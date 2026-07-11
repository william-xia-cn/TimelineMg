import { HttpError } from './http';
import { newId, nowISO, sha256Hex } from './crypto';
import { isObjectRecord, sanitizeJsonValue } from './schema';
import type { Env, LocalSnapshot } from './types';

const FORBIDDEN_KEYS = /token|cookie|secret|password|private_path|local_path/i;

type MigrationTable = 'plans' | 'buckets' | 'labels' | 'tasks' | 'containers' | 'calendar_events';

export function validateSnapshot(snapshot: LocalSnapshot): asserts snapshot is LocalSnapshot & { data: Record<string, unknown> } {
  if (!isObjectRecord(snapshot)) {
    throw new HttpError(400, 'invalid_snapshot', 'Migration snapshot must be an object');
  }
  if (!isObjectRecord(snapshot.data)) {
    throw new HttpError(400, 'invalid_snapshot_data', 'Migration snapshot data is required');
  }
  const raw = JSON.stringify(snapshot);
  if (FORBIDDEN_KEYS.test(raw)) {
    throw new HttpError(400, 'snapshot_contains_private_data', 'Migration snapshot contains private runtime data');
  }
}

function rows(snapshot: LocalSnapshot & { data: Record<string, unknown> }, table: string): Record<string, unknown>[] {
  const value = snapshot.data[table];
  return Array.isArray(value) ? value.filter(isObjectRecord) : [];
}

function stableId(prefix: string, row: Record<string, unknown>, fallback: string): string {
  const id = row.id ?? row.date ?? row.key ?? fallback;
  return `${prefix}_${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function asText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rowUpdatedAt(row: Record<string, unknown>, now: string): string {
  return asText(row.updated_at || row.updatedAt || row.source_updated_at) || now;
}

async function detectMigrationConflicts(
  env: Env,
  accountId: string,
  runId: string,
  entityType: string,
  table: MigrationTable,
  sourceRows: Record<string, unknown>[],
  now: string
): Promise<Set<string>> {
  const skipLegacyIds = new Set<string>();
  for (const row of sourceRows) {
    const legacyId = asText(row.id);
    if (!legacyId) continue;
    const existing = await env.DB.prepare(
      `SELECT * FROM ${table} WHERE account_id = ? AND legacy_id = ? AND deleted_at IS NULL`
    ).bind(accountId, legacyId).first<Record<string, unknown>>();
    if (!existing) continue;
    const incomingUpdatedAt = rowUpdatedAt(row, now);
    const cloudUpdatedAt = asText(existing.updated_at) || '';
    if (incomingUpdatedAt === cloudUpdatedAt) continue;
    skipLegacyIds.add(legacyId);
    await env.DB.prepare(
      `INSERT INTO migration_conflicts (id, account_id, migration_run_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
    ).bind(
      newId('conflict'),
      accountId,
      runId,
      entityType,
      legacyId,
      'cloud_record_changed_since_snapshot',
      sanitizeJsonValue(row),
      sanitizeJsonValue(existing),
      now
    ).run();
  }
  return skipLegacyIds;
}

async function upsertPlans(env: Env, accountId: string, plans: Record<string, unknown>[], now: string, skipLegacyIds: Set<string> = new Set()): Promise<number> {
  let count = 0;
  for (const plan of plans) {
    const legacyId = asText(plan.id);
    if (legacyId && skipLegacyIds.has(legacyId)) continue;
    const id = stableId('plan', plan, crypto.randomUUID());
    await env.DB.prepare(
      `INSERT INTO plans (id, account_id, legacy_id, name, color, icon_char, subject, subject_in_matrixview, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, legacy_id) DO UPDATE SET
         name = excluded.name,
         color = excluded.color,
         icon_char = excluded.icon_char,
         subject = excluded.subject,
         subject_in_matrixview = excluded.subject_in_matrixview,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at,
         revision = revision + 1`
    ).bind(
      id,
      accountId,
      legacyId,
      asText(plan.name) || 'Untitled Plan',
      asText(plan.color),
      asText(plan.icon_char),
      asText(plan.subject),
      asText(plan.subject_in_matrixview),
      asNumber(plan.sort_order),
      asText(plan.created_at) || now,
      rowUpdatedAt(plan, now)
    ).run();
    count++;
  }
  return count;
}

async function upsertSimpleOwnedTable(env: Env, accountId: string, table: 'buckets' | 'labels', prefix: string, sourceRows: Record<string, unknown>[], now: string, skipLegacyIds: Set<string> = new Set()): Promise<number> {
  let count = 0;
  for (const row of sourceRows) {
    const legacyId = asText(row.id);
    if (legacyId && skipLegacyIds.has(legacyId)) continue;
    const id = stableId(prefix, row, crypto.randomUUID());
    if (table === 'buckets') {
      await env.DB.prepare(
        `INSERT INTO buckets (id, account_id, plan_id, legacy_id, name, color, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, legacy_id) DO UPDATE SET
           name = excluded.name,
           color = excluded.color,
           sort_order = excluded.sort_order,
           updated_at = excluded.updated_at,
           revision = revision + 1`
      ).bind(id, accountId, row.plan_id ? stableId('plan', { id: row.plan_id }, String(row.plan_id)) : null, legacyId, asText(row.name) || 'Bucket', asText(row.color), asNumber(row.sort_order), asText(row.created_at) || now, rowUpdatedAt(row, now)).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO labels (id, account_id, plan_id, legacy_id, name, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, legacy_id) DO UPDATE SET
           name = excluded.name,
           color = excluded.color,
           updated_at = excluded.updated_at,
           revision = revision + 1`
      ).bind(id, accountId, row.plan_id ? stableId('plan', { id: row.plan_id }, String(row.plan_id)) : null, legacyId, asText(row.name) || 'Label', asText(row.color), asText(row.created_at) || now, rowUpdatedAt(row, now)).run();
    }
    count++;
  }
  return count;
}

async function upsertTasks(env: Env, accountId: string, tasks: Record<string, unknown>[], now: string, skipLegacyIds: Set<string> = new Set()): Promise<number> {
  let count = 0;
  for (const task of tasks) {
    const legacyId = asText(task.id);
    if (legacyId && skipLegacyIds.has(legacyId)) continue;
    const id = stableId('task', task, crypto.randomUUID());
    await env.DB.prepare(
      `INSERT INTO tasks (
        id, account_id, plan_id, bucket_id, legacy_id, title, notes, description, checklist_json, labels_json,
        start_date, arranged_date, due_date, schedule_time, duration, subject, priority, progress, completed_at,
        source, source_type, source_uid, source_url, source_updated_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, legacy_id) DO UPDATE SET
         title = excluded.title,
         notes = excluded.notes,
         description = excluded.description,
         checklist_json = excluded.checklist_json,
         labels_json = excluded.labels_json,
         start_date = excluded.start_date,
         arranged_date = excluded.arranged_date,
         due_date = excluded.due_date,
         schedule_time = excluded.schedule_time,
         duration = excluded.duration,
         subject = excluded.subject,
         priority = excluded.priority,
         progress = excluded.progress,
         completed_at = excluded.completed_at,
         updated_at = excluded.updated_at,
         revision = revision + 1`
    ).bind(
      id,
      accountId,
      task.plan_id ? stableId('plan', { id: task.plan_id }, String(task.plan_id)) : null,
      task.bucket_id ? stableId('bucket', { id: task.bucket_id }, String(task.bucket_id)) : null,
      legacyId,
      asText(task.title) || 'Untitled Task',
      asText(task.notes),
      asText(task.description),
      sanitizeJsonValue(task.checklist || []),
      sanitizeJsonValue(task.labels || []),
      asText(task.start_date),
      asText(task.arranged_date),
      asText(task.due_date || task.deadline),
      asText(task.schedule_time),
      asNumber(task.duration, 45),
      asText(task.subject),
      asText(task.priority) || 'medium',
      asText(task.progress || task.status) || 'not_started',
      asText(task.completed_at),
      asText(task.source),
      asText(task.source_type),
      asText(task.source_uid),
      asText(task.source_url),
      asText(task.source_updated_at),
      asText(task.created_at || task.createdAt) || now,
      rowUpdatedAt(task, now)
    ).run();
    count++;
  }
  return count;
}

async function upsertContainers(env: Env, accountId: string, containers: Record<string, unknown>[], now: string, skipLegacyIds: Set<string> = new Set()): Promise<number> {
  let count = 0;
  for (const container of containers) {
    const legacyId = asText(container.id);
    if (legacyId && skipLegacyIds.has(legacyId)) continue;
    const id = stableId('container', container, crypto.randomUUID());
    await env.DB.prepare(
      `INSERT INTO containers (id, account_id, legacy_id, name, time_start, time_end, repeat, days_json, enabled, active_start_date, active_end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, legacy_id) DO UPDATE SET
         name = excluded.name,
         time_start = excluded.time_start,
         time_end = excluded.time_end,
         repeat = excluded.repeat,
         days_json = excluded.days_json,
         enabled = excluded.enabled,
         active_start_date = excluded.active_start_date,
         active_end_date = excluded.active_end_date,
         updated_at = excluded.updated_at,
         revision = revision + 1`
    ).bind(id, accountId, legacyId, asText(container.name) || 'Container', asText(container.time_start), asText(container.time_end), asText(container.repeat), sanitizeJsonValue(container.days || []), container.enabled === false ? 0 : 1, asText(container.active_start_date), asText(container.active_end_date), asText(container.created_at) || now, rowUpdatedAt(container, now)).run();
    count++;
  }
  return count;
}

async function upsertEvents(env: Env, accountId: string, events: Record<string, unknown>[], now: string, skipLegacyIds: Set<string> = new Set()): Promise<number> {
  let count = 0;
  for (const event of events) {
    const legacyId = asText(event.id);
    if (legacyId && skipLegacyIds.has(legacyId)) continue;
    const id = stableId('event', event, crypto.randomUUID());
    await env.DB.prepare(
      `INSERT INTO calendar_events (id, account_id, container_id, legacy_id, title, date, time_start, time_end, source, source_uid, subject_in_matrixview, active_start_date, active_end_date, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, legacy_id) DO UPDATE SET
         title = excluded.title,
         date = excluded.date,
         time_start = excluded.time_start,
         time_end = excluded.time_end,
         source = excluded.source,
         source_uid = excluded.source_uid,
         subject_in_matrixview = excluded.subject_in_matrixview,
         active_start_date = excluded.active_start_date,
         active_end_date = excluded.active_end_date,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at,
         revision = revision + 1`
    ).bind(id, accountId, event.container_id ? stableId('container', { id: event.container_id }, String(event.container_id)) : null, legacyId, asText(event.title) || 'Untitled Event', asText(event.date), asText(event.time_start), asText(event.time_end), asText(event.source), asText(event.source_uid), asText(event.subject_in_matrixview), asText(event.active_start_date), asText(event.active_end_date), sanitizeJsonValue(event), asText(event.created_at) || now, rowUpdatedAt(event, now)).run();
    count++;
  }
  return count;
}

async function upsertSettings(env: Env, accountId: string, settings: unknown, now: string): Promise<number> {
  const entries = Array.isArray(settings)
    ? settings.filter(isObjectRecord).map(row => [asText(row.key), row.value] as const)
    : isObjectRecord(settings)
      ? Object.entries(settings)
      : [];
  let count = 0;
  for (const [key, value] of entries) {
    if (!key || FORBIDDEN_KEYS.test(key)) continue;
    await env.DB.prepare(
      `INSERT INTO product_settings (account_id, key, value_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at,
         revision = revision + 1`
    ).bind(accountId, key, sanitizeJsonValue(value), now).run();
    count++;
  }
  return count;
}

export async function listMigrationConflicts(env: Env, accountId: string, status = 'open'): Promise<Record<string, unknown>[]> {
  const rows = await env.DB.prepare(
    'SELECT id, migration_run_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at, resolved_at FROM migration_conflicts WHERE account_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(accountId, status).all<Record<string, unknown>>();
  return (rows.results || []).map(row => ({
    ...row,
    local: row.local_json ? JSON.parse(String(row.local_json)) : null,
    cloud: row.cloud_json ? JSON.parse(String(row.cloud_json)) : null,
    local_json: undefined,
    cloud_json: undefined
  }));
}

async function applyLocalConflict(env: Env, accountId: string, conflict: Record<string, unknown>, now: string): Promise<boolean> {
  const local = conflict.local_json ? JSON.parse(String(conflict.local_json)) : null;
  if (!isObjectRecord(local)) return false;
  const entityType = String(conflict.entity_type || '');
  if (entityType === 'plan') {
    await upsertPlans(env, accountId, [local], now);
    return true;
  }
  if (entityType === 'bucket') {
    await upsertSimpleOwnedTable(env, accountId, 'buckets', 'bucket', [local], now);
    return true;
  }
  if (entityType === 'label') {
    await upsertSimpleOwnedTable(env, accountId, 'labels', 'label', [local], now);
    return true;
  }
  if (entityType === 'task') {
    await upsertTasks(env, accountId, [local], now);
    return true;
  }
  if (entityType === 'container') {
    await upsertContainers(env, accountId, [local], now);
    return true;
  }
  if (entityType === 'event') {
    await upsertEvents(env, accountId, [local], now);
    return true;
  }
  return false;
}

export async function resolveMigrationConflict(env: Env, accountId: string, conflictId: string, resolution: string): Promise<Record<string, unknown>> {
  const allowed = new Set(['use_cloud', 'use_local', 'skip', 'resolved']);
  const nextStatus = allowed.has(resolution) ? resolution : 'resolved';
  const resolvedAt = nowISO();
  const conflict = await env.DB.prepare(
    'SELECT id, migration_run_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at, resolved_at FROM migration_conflicts WHERE account_id = ? AND id = ?'
  ).bind(accountId, conflictId).first<Record<string, unknown>>();
  if (!conflict) throw new HttpError(404, 'migration_conflict_not_found', 'Migration conflict not found');
  const appliedLocal = resolution === 'use_local'
    ? await applyLocalConflict(env, accountId, conflict, resolvedAt)
    : false;
  await env.DB.prepare(
    'UPDATE migration_conflicts SET status = ?, resolved_at = ? WHERE account_id = ? AND id = ?'
  ).bind(nextStatus, resolvedAt, accountId, conflictId).run();
  return {
    id: conflict.id,
    migration_run_id: conflict.migration_run_id,
    entity_type: conflict.entity_type,
    entity_id: conflict.entity_id,
    reason: conflict.reason,
    status: nextStatus,
    resolved_at: resolvedAt,
    applied_local: appliedLocal
  };
}
export async function importSnapshot(env: Env, accountId: string, snapshot: LocalSnapshot, sourceRuntime = 'unknown'): Promise<{ run_id: string; status: string; counts: Record<string, number> }> {
  validateSnapshot(snapshot);
  const now = nowISO();
  const snapshotText = JSON.stringify(snapshot);
  const snapshotHash = await sha256Hex(snapshotText);
  const existing = await env.DB.prepare(
    'SELECT id, status, counts_json FROM migration_runs WHERE account_id = ? AND source_runtime = ? AND snapshot_hash = ?'
  ).bind(accountId, sourceRuntime, snapshotHash).first<{ id: string; status: string; counts_json: string }>();
  if (existing) {
    return { run_id: existing.id, status: existing.status, counts: JSON.parse(existing.counts_json || '{}') };
  }

  const runId = newId('migration');
  const r2Key = `${accountId}/${runId}/snapshot.json`;
  await env.SNAPSHOTS.put(r2Key, snapshotText, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' }
  });

  await env.DB.prepare(
    'INSERT INTO migration_runs (id, account_id, source_runtime, source_database_id, snapshot_hash, snapshot_r2_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(runId, accountId, sourceRuntime, asText(snapshot.device_id), snapshotHash, r2Key, 'running', now, now).run();

  const planRows = rows(snapshot, 'plans');
  const bucketRows = rows(snapshot, 'buckets');
  const labelRows = rows(snapshot, 'labels');
  const taskRows = rows(snapshot, 'tasks');
  const containerRows = rows(snapshot, 'containers');
  const eventRows = rows(snapshot, 'events');
  const planConflicts = await detectMigrationConflicts(env, accountId, runId, 'plan', 'plans', planRows, now);
  const bucketConflicts = await detectMigrationConflicts(env, accountId, runId, 'bucket', 'buckets', bucketRows, now);
  const labelConflicts = await detectMigrationConflicts(env, accountId, runId, 'label', 'labels', labelRows, now);
  const taskConflicts = await detectMigrationConflicts(env, accountId, runId, 'task', 'tasks', taskRows, now);
  const containerConflicts = await detectMigrationConflicts(env, accountId, runId, 'container', 'containers', containerRows, now);
  const eventConflicts = await detectMigrationConflicts(env, accountId, runId, 'event', 'calendar_events', eventRows, now);

  const counts: Record<string, number> = {};
  counts.conflicts = planConflicts.size + bucketConflicts.size + labelConflicts.size + taskConflicts.size + containerConflicts.size + eventConflicts.size;
  counts.plans = await upsertPlans(env, accountId, planRows, now, planConflicts);
  counts.buckets = await upsertSimpleOwnedTable(env, accountId, 'buckets', 'bucket', bucketRows, now, bucketConflicts);
  counts.labels = await upsertSimpleOwnedTable(env, accountId, 'labels', 'label', labelRows, now, labelConflicts);
  counts.tasks = await upsertTasks(env, accountId, taskRows, now, taskConflicts);
  counts.containers = await upsertContainers(env, accountId, containerRows, now, containerConflicts);
  counts.events = await upsertEvents(env, accountId, eventRows, now, eventConflicts);
  counts.settings = await upsertSettings(env, accountId, snapshot.data.settings, now);
  const finalStatus = counts.conflicts > 0 ? 'conflict' : 'completed';

  await env.DB.prepare(
    'UPDATE migration_runs SET status = ?, counts_json = ?, updated_at = ? WHERE id = ?'
  ).bind(finalStatus, JSON.stringify(counts), nowISO(), runId).run();

  return { run_id: runId, status: finalStatus, counts };
}

