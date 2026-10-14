import { HttpError } from './http';
import { newId, nowISO, sha256Hex } from './crypto';
import { isObjectRecord } from './schema';
import { getLatestSyncCursor } from './sync';
import { validateSnapshot } from './migration';
import type { Env, LocalSnapshot } from './types';

const PREVIEW_TTL_MS = 60 * 60 * 1000;
const ROLLBACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOCK_TTL_MS = 10 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
const JSON_CHUNK_BYTES = 1_400_000;
const FORBIDDEN_SETTING = /token|cookie|secret|password|private_path|local_path|google_sync_account|desktop_work_reminder|runtime_state|session|oauth|account_(name|email|key|picture)|workspace_(id|identity)/i;
const REPLACEABLE_SETTINGS_WHERE = `
  key NOT LIKE 'google_sync_%'
  AND key NOT LIKE 'desktop_%'
  AND lower(key) NOT LIKE '%token%'
  AND lower(key) NOT LIKE '%cookie%'
  AND lower(key) NOT LIKE '%secret%'
  AND lower(key) NOT LIKE '%password%'
  AND lower(key) NOT LIKE '%private_path%'
  AND lower(key) NOT LIKE '%local_path%'
  AND lower(key) NOT LIKE '%runtime_state%'
  AND lower(key) NOT LIKE '%session%'
  AND lower(key) NOT LIKE '%oauth%'
  AND lower(key) NOT LIKE '%account_name%'
  AND lower(key) NOT LIKE '%account_email%'
  AND lower(key) NOT LIKE '%account_key%'
  AND lower(key) NOT LIKE '%account_picture%'
  AND lower(key) NOT LIKE '%workspace_id%'
  AND lower(key) NOT LIKE '%workspace_identity%'
`;

type CanonicalEntity = 'plans' | 'buckets' | 'labels' | 'tasks' | 'containers' | 'events' | 'settings';
type CanonicalData = Record<CanonicalEntity, Record<string, unknown>[]>;
type EntityCounts = Record<CanonicalEntity, { create: number; replace: number; delete: number; unchanged: number }>;

type ReplacementRow = {
  id: string;
  account_id: string;
  source_runtime: string;
  action_type: string;
  parent_replacement_id: string | null;
  snapshot_hash: string;
  incoming_r2_key: string;
  rollback_r2_key: string | null;
  expected_cursor: number;
  status: string;
  preview_counts_json: string;
  result_counts_json: string;
  created_at: string;
  expires_at: string;
  committed_at: string | null;
  rolled_back_at: string | null;
};

function rows(snapshot: LocalSnapshot & { data: Record<string, unknown> }, key: string): Record<string, unknown>[] {
  const value = snapshot.data[key];
  return Array.isArray(value) ? value.filter(isObjectRecord) : [];
}

function asText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function cleanId(value: unknown): string {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function canonicalId(prefix: string, row: Record<string, unknown>, fallback: string): string {
  const raw = asText(row.id) || fallback;
  return raw.startsWith(`${prefix}_`) ? raw : `${prefix}_${cleanId(raw)}`;
}

function referenceId(prefix: string, value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;
  return raw.startsWith(`${prefix}_`) ? raw : `${prefix}_${cleanId(raw)}`;
}

function legacyId(prefix: string, row: Record<string, unknown>): string | null {
  const explicit = asText(row.legacy_id);
  if (explicit) return explicit;
  const id = asText(row.id);
  return id && !id.startsWith(`${prefix}_`) ? id : null;
}

function jsonText(value: unknown, fallback: unknown): string {
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(fallback);
    }
  }
  return JSON.stringify(value ?? fallback);
}

function settingEntries(value: unknown): Array<[string, unknown]> {
  const entries = Array.isArray(value)
    ? value.filter(isObjectRecord).map(row => {
        let item = row.value;
        if (item === undefined && typeof row.value_json === 'string') {
          try { item = JSON.parse(row.value_json); } catch { item = row.value_json; }
        }
        return [asText(row.key), item] as const;
      })
    : isObjectRecord(value) ? Object.entries(value) : [];
  return entries
    .filter((entry): entry is readonly [string, unknown] => Boolean(entry[0]) && !FORBIDDEN_SETTING.test(String(entry[0])))
    .map(([key, item]) => [key, item]);
}

function normalizeSnapshot(snapshot: LocalSnapshot): { snapshot: LocalSnapshot & { data: Record<string, unknown> }; canonical: CanonicalData } {
  validateSnapshot(snapshot);
  const checked = snapshot as LocalSnapshot & { data: Record<string, unknown> };
  const now = nowISO();
  const plans = rows(checked, 'plans').map((row, index) => ({
    id: canonicalId('plan', row, String(index)), account_id: null, legacy_id: legacyId('plan', row),
    name: asText(row.name) || 'Untitled Plan', color: asText(row.color), icon_char: asText(row.icon_char),
    subject: asText(row.subject), subject_in_matrixview: asText(row.subject_in_matrixview),
    sort_order: asNumber(row.sort_order ?? row.order), created_at: asText(row.created_at) || now,
    updated_at: asText(row.updated_at || row.updatedAt) || now, deleted_at: null, revision: Math.max(1, asNumber(row.revision, 1))
  }));
  const buckets = rows(checked, 'buckets').map((row, index) => ({
    id: canonicalId('bucket', row, String(index)), account_id: null, plan_id: referenceId('plan', row.plan_id),
    legacy_id: legacyId('bucket', row), name: asText(row.name) || 'Bucket', color: asText(row.color),
    sort_order: asNumber(row.sort_order ?? row.order), created_at: asText(row.created_at) || now,
    updated_at: asText(row.updated_at || row.updatedAt) || now, deleted_at: null, revision: Math.max(1, asNumber(row.revision, 1))
  }));
  const labels = rows(checked, 'labels').map((row, index) => ({
    id: canonicalId('label', row, String(index)), account_id: null, plan_id: referenceId('plan', row.plan_id),
    legacy_id: legacyId('label', row), name: asText(row.name) || 'Label', color: asText(row.color),
    created_at: asText(row.created_at) || now, updated_at: asText(row.updated_at || row.updatedAt) || now,
    deleted_at: null, revision: Math.max(1, asNumber(row.revision, 1))
  }));
  const containers = rows(checked, 'containers').map((row, index) => ({
    id: canonicalId('container', row, String(index)), account_id: null, legacy_id: legacyId('container', row),
    name: asText(row.name) || 'Container', time_start: asText(row.time_start), time_end: asText(row.time_end),
    repeat: asText(row.repeat), days_json: jsonText(row.days_json ?? row.days, []), enabled: row.enabled === false || row.enabled === 0 ? 0 : 1,
    active_start_date: asText(row.active_start_date), active_end_date: asText(row.active_end_date),
    created_at: asText(row.created_at) || now, updated_at: asText(row.updated_at || row.updatedAt) || now,
    deleted_at: null, revision: Math.max(1, asNumber(row.revision, 1))
  }));
  const tasks = rows(checked, 'tasks').map((row, index) => ({
    id: canonicalId('task', row, String(index)), account_id: null, plan_id: referenceId('plan', row.plan_id),
    bucket_id: referenceId('bucket', row.bucket_id), legacy_id: legacyId('task', row), title: asText(row.title) || 'Untitled Task',
    notes: asText(row.notes), description: asText(row.description), checklist_json: jsonText(row.checklist_json ?? row.checklist, []),
    labels_json: jsonText(row.labels_json ?? row.labels, []), start_date: asText(row.start_date), arranged_date: asText(row.arranged_date),
    due_date: asText(row.due_date ?? row.deadline), schedule_time: asText(row.schedule_time), duration: asNumber(row.duration, 45),
    subject: asText(row.subject), recurrence_series_id: asText(row.recurrence_series_id),
    recurrence_index: row.recurrence_index === undefined || row.recurrence_index === null ? null : asNumber(row.recurrence_index, 1),
    recurrence_count: row.recurrence_count === undefined || row.recurrence_count === null ? null : asNumber(row.recurrence_count, 1),
    recurrence_frequency: asText(row.recurrence_frequency), recurrence_anchor_start_date: asText(row.recurrence_anchor_start_date),
    recurrence_anchor_due_date: asText(row.recurrence_anchor_due_date), priority: asText(row.priority) || 'medium',
    progress: asText(row.progress ?? row.status) || 'not_started', completed_at: asText(row.completed_at), source: asText(row.source),
    source_type: asText(row.source_type), source_uid: asText(row.source_uid), source_url: asText(row.source_url),
    source_updated_at: asText(row.source_updated_at), managebac_subject: asText(row.managebac_subject),
    readonly: row.readonly === true || row.readonly === 1 ? 1 : 0, created_at: asText(row.created_at || row.createdAt) || now,
    updated_at: asText(row.updated_at || row.updatedAt || row.source_updated_at) || now, deleted_at: null,
    revision: Math.max(1, asNumber(row.revision, 1))
  }));
  const events = rows(checked, 'events').map((row, index) => ({
    id: canonicalId('event', row, String(index)), account_id: null, container_id: referenceId('container', row.container_id),
    legacy_id: legacyId('event', row), title: asText(row.title) || 'Untitled Event', date: asText(row.date),
    time_start: asText(row.time_start), time_end: asText(row.time_end), source: asText(row.source), source_uid: asText(row.source_uid),
    subject_in_matrixview: asText(row.subject_in_matrixview), active_start_date: asText(row.active_start_date),
    active_end_date: asText(row.active_end_date), payload_json: jsonText(row.payload_json, row),
    created_at: asText(row.created_at) || now, updated_at: asText(row.updated_at || row.updatedAt) || now,
    deleted_at: null, revision: Math.max(1, asNumber(row.revision, 1))
  }));
  const settings = settingEntries(checked.data.settings).map(([key, value]) => ({
    account_id: null, key, value_json: JSON.stringify(value ?? null), updated_at: now, revision: 1
  }));
  const canonical: CanonicalData = { plans, buckets, labels, tasks, containers, events, settings };
  validateReferences(canonical);
  const normalized: LocalSnapshot & { data: Record<string, unknown> } = {
    schema: 'timewhere-legacy-indexeddb-snapshot-v1',
    exported_at: checked.exported_at || now,
    data: canonical
  };
  const encoded = new TextEncoder().encode(JSON.stringify(normalized)).byteLength;
  if (encoded > MAX_SNAPSHOT_BYTES) throw new HttpError(413, 'replacement_snapshot_too_large', 'Replacement snapshot exceeds 20 MB');
  const total = Object.values(canonical).reduce((sum, list) => sum + list.length, 0);
  if (!total) throw new HttpError(400, 'empty_backup_not_allowed', 'A replacement backup must contain supported TimeWhere data');
  return { snapshot: normalized, canonical };
}

function validateReferences(data: CanonicalData): void {
  const plans = new Set(data.plans.map(row => String(row.id)));
  const buckets = new Set(data.buckets.map(row => String(row.id)));
  const containers = new Set(data.containers.map(row => String(row.id)));
  const missing: string[] = [];
  for (const row of [...data.buckets, ...data.labels]) if (row.plan_id && !plans.has(String(row.plan_id))) missing.push(`plan:${row.plan_id}`);
  for (const row of data.tasks) {
    if (row.plan_id && !plans.has(String(row.plan_id))) missing.push(`plan:${row.plan_id}`);
    if (row.bucket_id && !buckets.has(String(row.bucket_id))) missing.push(`bucket:${row.bucket_id}`);
  }
  for (const row of data.events) if (row.container_id && !containers.has(String(row.container_id))) missing.push(`container:${row.container_id}`);
  if (missing.length) throw new HttpError(400, 'replacement_reference_invalid', `Replacement snapshot has missing references: ${[...new Set(missing)].slice(0, 10).join(', ')}`);
}

async function loadCurrentCanonical(env: Env, accountId: string): Promise<CanonicalData> {
  const [plans, buckets, labels, tasks, containers, events, settings] = await Promise.all([
    env.DB.prepare('SELECT * FROM plans WHERE account_id = ? AND deleted_at IS NULL').bind(accountId).all<Record<string, unknown>>(),
    env.DB.prepare('SELECT * FROM buckets WHERE account_id = ? AND deleted_at IS NULL').bind(accountId).all<Record<string, unknown>>(),
    env.DB.prepare('SELECT * FROM labels WHERE account_id = ? AND deleted_at IS NULL').bind(accountId).all<Record<string, unknown>>(),
    env.DB.prepare('SELECT * FROM tasks WHERE account_id = ? AND deleted_at IS NULL').bind(accountId).all<Record<string, unknown>>(),
    env.DB.prepare('SELECT * FROM containers WHERE account_id = ? AND deleted_at IS NULL').bind(accountId).all<Record<string, unknown>>(),
    env.DB.prepare('SELECT * FROM calendar_events WHERE account_id = ? AND deleted_at IS NULL').bind(accountId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT * FROM product_settings WHERE account_id = ? AND ${REPLACEABLE_SETTINGS_WHERE}`).bind(accountId).all<Record<string, unknown>>()
  ]);
  return {
    plans: plans.results || [], buckets: buckets.results || [], labels: labels.results || [], tasks: tasks.results || [],
    containers: containers.results || [], events: events.results || [], settings: (settings.results || []).filter(row => !FORBIDDEN_SETTING.test(String(row.key || '')))
  };
}

function identity(row: Record<string, unknown>): string {
  return row.legacy_id ? `legacy:${row.legacy_id}` : row.key ? `key:${row.key}` : `id:${row.id}`;
}

function comparable(row: Record<string, unknown>): string {
  const copy = { ...row };
  delete copy.account_id;
  delete copy.updated_at;
  delete copy.created_at;
  delete copy.revision;
  delete copy.deleted_at;
  return JSON.stringify(copy, Object.keys(copy).sort());
}

function buildPreviewCounts(current: CanonicalData, incoming: CanonicalData): EntityCounts {
  const result = {} as EntityCounts;
  for (const entity of Object.keys(incoming) as CanonicalEntity[]) {
    const currentMap = new Map(current[entity].map(row => [identity(row), row]));
    let create = 0, replace = 0, unchanged = 0;
    for (const row of incoming[entity]) {
      const existing = currentMap.get(identity(row));
      if (!existing) create++;
      else if (comparable(existing) === comparable(row)) unchanged++;
      else replace++;
      currentMap.delete(identity(row));
    }
    result[entity] = { create, replace, delete: currentMap.size, unchanged };
  }
  return result;
}

function snapshotFromCanonical(data: CanonicalData): LocalSnapshot {
  const settings: Record<string, unknown> = {};
  for (const row of data.settings) {
    try { settings[String(row.key)] = JSON.parse(String(row.value_json)); } catch { settings[String(row.key)] = row.value_json; }
  }
  return {
    schema: 'timewhere-cloud-replacement-backup-v1',
    exported_at: nowISO(),
    data: { ...data, settings }
  };
}

function chunkRows(rows: Record<string, unknown>[]): string[] {
  const chunks: string[] = [];
  let current: Record<string, unknown>[] = [];
  let bytes = 2;
  for (const row of rows) {
    const rowBytes = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1;
    if (rowBytes > JSON_CHUNK_BYTES) throw new HttpError(413, 'replacement_entity_too_large', 'One replacement entity exceeds the D1 safe payload size');
    if (current.length && bytes + rowBytes > JSON_CHUNK_BYTES) {
      chunks.push(JSON.stringify(current));
      current = [];
      bytes = 2;
    }
    current.push(row);
    bytes += rowBytes;
  }
  if (current.length) chunks.push(JSON.stringify(current));
  return chunks;
}

const INSERT_SQL: Record<CanonicalEntity, string> = {
  plans: `INSERT INTO plans (id,account_id,legacy_id,name,color,icon_char,subject,subject_in_matrixview,sort_order,created_at,updated_at,deleted_at,revision)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.account_id'),json_extract(value,'$.legacy_id'),json_extract(value,'$.name'),json_extract(value,'$.color'),json_extract(value,'$.icon_char'),json_extract(value,'$.subject'),json_extract(value,'$.subject_in_matrixview'),json_extract(value,'$.sort_order'),json_extract(value,'$.created_at'),json_extract(value,'$.updated_at'),NULL,json_extract(value,'$.revision') FROM json_each(?)`,
  buckets: `INSERT INTO buckets (id,account_id,plan_id,legacy_id,name,color,sort_order,created_at,updated_at,deleted_at,revision)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.account_id'),json_extract(value,'$.plan_id'),json_extract(value,'$.legacy_id'),json_extract(value,'$.name'),json_extract(value,'$.color'),json_extract(value,'$.sort_order'),json_extract(value,'$.created_at'),json_extract(value,'$.updated_at'),NULL,json_extract(value,'$.revision') FROM json_each(?)`,
  labels: `INSERT INTO labels (id,account_id,plan_id,legacy_id,name,color,created_at,updated_at,deleted_at,revision)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.account_id'),json_extract(value,'$.plan_id'),json_extract(value,'$.legacy_id'),json_extract(value,'$.name'),json_extract(value,'$.color'),json_extract(value,'$.created_at'),json_extract(value,'$.updated_at'),NULL,json_extract(value,'$.revision') FROM json_each(?)`,
  tasks: `INSERT INTO tasks (id,account_id,plan_id,bucket_id,legacy_id,title,notes,description,checklist_json,labels_json,start_date,arranged_date,due_date,schedule_time,duration,subject,recurrence_series_id,recurrence_index,recurrence_count,recurrence_frequency,recurrence_anchor_start_date,recurrence_anchor_due_date,priority,progress,completed_at,source,source_type,source_uid,source_url,source_updated_at,managebac_subject,readonly,created_at,updated_at,deleted_at,revision)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.account_id'),json_extract(value,'$.plan_id'),json_extract(value,'$.bucket_id'),json_extract(value,'$.legacy_id'),json_extract(value,'$.title'),json_extract(value,'$.notes'),json_extract(value,'$.description'),json_extract(value,'$.checklist_json'),json_extract(value,'$.labels_json'),json_extract(value,'$.start_date'),json_extract(value,'$.arranged_date'),json_extract(value,'$.due_date'),json_extract(value,'$.schedule_time'),json_extract(value,'$.duration'),json_extract(value,'$.subject'),json_extract(value,'$.recurrence_series_id'),json_extract(value,'$.recurrence_index'),json_extract(value,'$.recurrence_count'),json_extract(value,'$.recurrence_frequency'),json_extract(value,'$.recurrence_anchor_start_date'),json_extract(value,'$.recurrence_anchor_due_date'),json_extract(value,'$.priority'),json_extract(value,'$.progress'),json_extract(value,'$.completed_at'),json_extract(value,'$.source'),json_extract(value,'$.source_type'),json_extract(value,'$.source_uid'),json_extract(value,'$.source_url'),json_extract(value,'$.source_updated_at'),json_extract(value,'$.managebac_subject'),json_extract(value,'$.readonly'),json_extract(value,'$.created_at'),json_extract(value,'$.updated_at'),NULL,json_extract(value,'$.revision') FROM json_each(?)`,
  containers: `INSERT INTO containers (id,account_id,legacy_id,name,time_start,time_end,repeat,days_json,enabled,active_start_date,active_end_date,created_at,updated_at,deleted_at,revision)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.account_id'),json_extract(value,'$.legacy_id'),json_extract(value,'$.name'),json_extract(value,'$.time_start'),json_extract(value,'$.time_end'),json_extract(value,'$.repeat'),json_extract(value,'$.days_json'),json_extract(value,'$.enabled'),json_extract(value,'$.active_start_date'),json_extract(value,'$.active_end_date'),json_extract(value,'$.created_at'),json_extract(value,'$.updated_at'),NULL,json_extract(value,'$.revision') FROM json_each(?)`,
  events: `INSERT INTO calendar_events (id,account_id,container_id,legacy_id,title,date,time_start,time_end,source,source_uid,subject_in_matrixview,active_start_date,active_end_date,payload_json,created_at,updated_at,deleted_at,revision)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.account_id'),json_extract(value,'$.container_id'),json_extract(value,'$.legacy_id'),json_extract(value,'$.title'),json_extract(value,'$.date'),json_extract(value,'$.time_start'),json_extract(value,'$.time_end'),json_extract(value,'$.source'),json_extract(value,'$.source_uid'),json_extract(value,'$.subject_in_matrixview'),json_extract(value,'$.active_start_date'),json_extract(value,'$.active_end_date'),json_extract(value,'$.payload_json'),json_extract(value,'$.created_at'),json_extract(value,'$.updated_at'),NULL,json_extract(value,'$.revision') FROM json_each(?)`,
  settings: `INSERT INTO product_settings (account_id,key,value_json,updated_at,revision)
    SELECT json_extract(value,'$.account_id'),json_extract(value,'$.key'),json_extract(value,'$.value_json'),json_extract(value,'$.updated_at'),json_extract(value,'$.revision') FROM json_each(?)`
};

function withAccount(data: CanonicalData, accountId: string): CanonicalData {
  const result = {} as CanonicalData;
  for (const entity of Object.keys(data) as CanonicalEntity[]) result[entity] = data[entity].map(row => ({ ...row, account_id: accountId }));
  return result;
}

async function loadReplacement(env: Env, accountId: string, id: string): Promise<ReplacementRow> {
  const row = await env.DB.prepare('SELECT * FROM migration_replacements WHERE account_id = ? AND id = ?').bind(accountId, id).first<ReplacementRow>();
  if (!row) throw new HttpError(404, 'replacement_not_found', 'Replacement preview not found');
  return row;
}

async function loadR2Snapshot(env: Env, key: string): Promise<LocalSnapshot> {
  const object = await env.SNAPSHOTS.get(key);
  if (!object) throw new HttpError(410, 'replacement_snapshot_missing', 'Replacement snapshot is no longer available');
  return JSON.parse(await object.text()) as LocalSnapshot;
}

export async function createReplacementPreview(
  env: Env,
  accountId: string,
  snapshot: LocalSnapshot,
  sourceRuntime = 'extension_json_export_v1',
  options: { actionType?: 'overwrite' | 'rollback'; parentReplacementId?: string | null } = {}
): Promise<Record<string, unknown>> {
  await cleanupExpiredReplacementArtifacts(env);
  const normalized = normalizeSnapshot(snapshot);
  const current = await loadCurrentCanonical(env, accountId);
  const counts = buildPreviewCounts(current, normalized.canonical);
  const expectedCursor = await getLatestSyncCursor(env, accountId);
  const id = newId('replacement');
  const createdAt = nowISO();
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
  const snapshotText = JSON.stringify(normalized.snapshot);
  const hash = await sha256Hex(snapshotText);
  const key = `${accountId}/replacements/${id}/incoming.json`;
  await env.SNAPSHOTS.put(key, snapshotText, { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
  await env.DB.prepare(
    `INSERT INTO migration_replacements (id,account_id,source_runtime,action_type,parent_replacement_id,snapshot_hash,incoming_r2_key,expected_cursor,status,preview_counts_json,created_at,expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(id, accountId, sourceRuntime, options.actionType || 'overwrite', options.parentReplacementId || null, hash, key, expectedCursor, 'preview', JSON.stringify(counts), createdAt, expiresAt).run();
  return { replacement_id: id, action_type: options.actionType || 'overwrite', expires_at: expiresAt, expected_cursor: expectedCursor, counts };
}

async function acquireLock(env: Env, accountId: string, replacementId: string): Promise<void> {
  const now = nowISO();
  await env.DB.prepare('DELETE FROM account_mutation_locks WHERE account_id = ? AND expires_at <= ?').bind(accountId, now).run();
  try {
    await env.DB.prepare('INSERT INTO account_mutation_locks (account_id,replacement_id,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(accountId, replacementId, now, new Date(Date.now() + LOCK_TTL_MS).toISOString()).run();
  } catch {
    throw new HttpError(409, 'workspace_replacement_in_progress', 'A workspace replacement is already in progress');
  }
}

async function releaseLock(env: Env, accountId: string, replacementId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM account_mutation_locks WHERE account_id = ? AND replacement_id = ?').bind(accountId, replacementId).run();
}

export async function assertAccountMutationUnlocked(env: Env, accountId: string): Promise<void> {
  const lock = await env.DB.prepare('SELECT replacement_id FROM account_mutation_locks WHERE account_id = ? AND expires_at > ?')
    .bind(accountId, nowISO()).first<{ replacement_id: string }>();
  if (lock) throw new HttpError(409, 'workspace_replacement_in_progress', 'Workspace replacement is in progress');
}

async function commitPreparedReplacement(env: Env, accountId: string, row: ReplacementRow, confirmation: string): Promise<Record<string, unknown>> {
  const expectedPhrase = row.action_type === 'rollback' ? '撤销覆盖' : '覆盖导入';
  if (confirmation !== expectedPhrase) throw new HttpError(400, 'replacement_confirmation_invalid', `Type ${expectedPhrase} to continue`);
  if (row.status !== 'preview') throw new HttpError(409, 'replacement_not_pending', 'Replacement preview is not pending');
  if (Date.parse(row.expires_at) <= Date.now()) throw new HttpError(410, 'replacement_preview_expired', 'Replacement preview expired');
  await acquireLock(env, accountId, row.id);
  try {
    const cursor = await getLatestSyncCursor(env, accountId);
    if (cursor !== Number(row.expected_cursor)) throw new HttpError(409, 'replacement_preview_stale', 'Cloud data changed after preview; create a new preview');
    const incoming = normalizeSnapshot(await loadR2Snapshot(env, row.incoming_r2_key));
    const current = await loadCurrentCanonical(env, accountId);
    const backup = snapshotFromCanonical(current);
    const backupText = JSON.stringify(backup);
    const rollbackKey = `${accountId}/replacements/${row.id}/rollback.json`;
    await env.SNAPSHOTS.put(rollbackKey, backupText, { httpMetadata: { contentType: 'application/json; charset=utf-8' } });

    const data = withAccount(incoming.canonical, accountId);
    const completedAt = nowISO();
    const rollbackExpiresAt = new Date(Date.now() + ROLLBACK_TTL_MS).toISOString();
    const previewCounts = JSON.parse(row.preview_counts_json || '{}');
    const statements: D1PreparedStatement[] = [
      env.DB.prepare('DELETE FROM tasks WHERE account_id = ?').bind(accountId),
      env.DB.prepare('DELETE FROM calendar_events WHERE account_id = ?').bind(accountId),
      env.DB.prepare('DELETE FROM buckets WHERE account_id = ?').bind(accountId),
      env.DB.prepare('DELETE FROM labels WHERE account_id = ?').bind(accountId),
      env.DB.prepare('DELETE FROM containers WHERE account_id = ?').bind(accountId),
      env.DB.prepare('DELETE FROM plans WHERE account_id = ?').bind(accountId),
      env.DB.prepare(`DELETE FROM product_settings WHERE account_id = ? AND ${REPLACEABLE_SETTINGS_WHERE}`).bind(accountId)
    ];
    for (const entity of ['plans', 'buckets', 'labels', 'containers', 'tasks', 'events', 'settings'] as CanonicalEntity[]) {
      for (const chunk of chunkRows(data[entity])) statements.push(env.DB.prepare(INSERT_SQL[entity]).bind(chunk));
    }
    statements.push(
      env.DB.prepare("UPDATE migration_conflicts SET status = 'superseded', resolved_at = ? WHERE account_id = ? AND status = 'open'").bind(completedAt, accountId),
      env.DB.prepare("UPDATE sync_conflicts SET status = 'superseded', resolved_at = ? WHERE account_id = ? AND status = 'open'").bind(completedAt, accountId),
      env.DB.prepare("INSERT INTO sync_changes (id,account_id,entity_type,entity_id,operation,entity_revision,changed_at) VALUES (?,?, 'workspace', ?, 'replaced', NULL, ?)")
        .bind(newId('chg'), accountId, accountId, completedAt),
      env.DB.prepare("UPDATE migration_replacements SET status = 'completed', rollback_r2_key = ?, result_counts_json = ?, committed_at = ?, expires_at = ? WHERE account_id = ? AND id = ?")
        .bind(rollbackKey, JSON.stringify(previewCounts), completedAt, rollbackExpiresAt, accountId, row.id)
    );
    if (row.action_type === 'rollback' && row.parent_replacement_id) {
      statements.push(env.DB.prepare("UPDATE migration_replacements SET status = 'rolled_back', rolled_back_at = ? WHERE account_id = ? AND id = ?")
        .bind(completedAt, accountId, row.parent_replacement_id));
    }
    statements.push(env.DB.prepare('DELETE FROM account_mutation_locks WHERE account_id = ? AND replacement_id = ?').bind(accountId, row.id));
    await env.DB.batch(statements);
    await env.SNAPSHOTS.delete(row.incoming_r2_key);
    const nextCursor = await getLatestSyncCursor(env, accountId);
    return { replacement_id: row.id, action_type: row.action_type, status: 'completed', counts: previewCounts, rollback_expires_at: rollbackExpiresAt, sync_cursor: nextCursor };
  } catch (error) {
    await releaseLock(env, accountId, row.id);
    if (error instanceof HttpError) throw error;
    await env.DB.prepare("UPDATE migration_replacements SET status = 'failed', error_json = ? WHERE account_id = ? AND id = ?")
      .bind(JSON.stringify({ code: 'replacement_batch_failed' }), accountId, row.id).run();
    throw new HttpError(500, 'replacement_batch_failed', 'Workspace replacement failed; canonical data was rolled back', true);
  }
}

export async function commitReplacement(env: Env, accountId: string, id: string, confirmation: string): Promise<Record<string, unknown>> {
  const row = await loadReplacement(env, accountId, id);
  if (row.action_type !== 'overwrite') throw new HttpError(409, 'replacement_action_mismatch', 'This preview is not an overwrite');
  return commitPreparedReplacement(env, accountId, row, confirmation);
}

export async function listReplacements(env: Env, accountId: string): Promise<Record<string, unknown>[]> {
  await cleanupExpiredReplacementArtifacts(env);
  const result = await env.DB.prepare(
    `SELECT id,source_runtime,action_type,parent_replacement_id,status,preview_counts_json,result_counts_json,created_at,expires_at,committed_at,rolled_back_at,rollback_r2_key
     FROM migration_replacements WHERE account_id = ? ORDER BY created_at DESC LIMIT 20`
  ).bind(accountId).all<Record<string, unknown>>();
  return (result.results || []).map(row => ({
    id: row.id, source_runtime: row.source_runtime, action_type: row.action_type, parent_replacement_id: row.parent_replacement_id,
    status: row.status, preview_counts: JSON.parse(String(row.preview_counts_json || '{}')), result_counts: JSON.parse(String(row.result_counts_json || '{}')),
    created_at: row.created_at, committed_at: row.committed_at, rolled_back_at: row.rolled_back_at, expires_at: row.expires_at,
    can_rollback: row.status === 'completed' && Boolean(row.rollback_r2_key) && Date.parse(String(row.expires_at)) > Date.now()
  }));
}

export async function createRollbackPreview(env: Env, accountId: string, id: string): Promise<Record<string, unknown>> {
  const original = await loadReplacement(env, accountId, id);
  if (original.status !== 'completed' || !original.rollback_r2_key || Date.parse(original.expires_at) <= Date.now()) {
    throw new HttpError(410, 'replacement_rollback_unavailable', 'Rollback snapshot is not available');
  }
  const snapshot = await loadR2Snapshot(env, original.rollback_r2_key);
  return createReplacementPreview(env, accountId, snapshot, 'replacement_rollback', { actionType: 'rollback', parentReplacementId: original.id });
}

export async function commitRollback(env: Env, accountId: string, id: string, confirmation: string): Promise<Record<string, unknown>> {
  const row = await loadReplacement(env, accountId, id);
  if (row.action_type !== 'rollback') throw new HttpError(409, 'replacement_action_mismatch', 'This preview is not a rollback');
  return commitPreparedReplacement(env, accountId, row, confirmation);
}

export async function cleanupExpiredReplacementArtifacts(env: Env): Promise<void> {
  const now = nowISO();
  await env.DB.prepare('DELETE FROM account_mutation_locks WHERE expires_at <= ?').bind(now).run();
  const expired = await env.DB.prepare(
    `SELECT id,incoming_r2_key,rollback_r2_key,status FROM migration_replacements
     WHERE expires_at <= ? AND (status = 'preview' OR rollback_r2_key IS NOT NULL) LIMIT 100`
  ).bind(now).all<{ id: string; incoming_r2_key: string; rollback_r2_key: string | null; status: string }>();
  for (const row of expired.results || []) {
    await env.SNAPSHOTS.delete(row.incoming_r2_key);
    if (row.rollback_r2_key) await env.SNAPSHOTS.delete(row.rollback_r2_key);
    await env.DB.prepare("UPDATE migration_replacements SET status = CASE WHEN status = 'preview' THEN 'expired' ELSE status END, rollback_r2_key = NULL WHERE id = ?")
      .bind(row.id).run();
  }
}
