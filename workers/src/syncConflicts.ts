import { newId, nowISO } from './crypto';
import { HttpError } from './http';
import { sanitizeJsonValue } from './schema';
import type { Env } from './types';

const PRIVATE_KEY_PATTERN = /token|secret|cookie|password|private_path|local_path/i;
const ALLOWED_STATUSES = new Set([
  'open',
  'keep_cloud',
  'discard_local',
  'apply_local',
  'manual_merge',
  'dismissed',
  'rejected'
]);

const ALLOWED_TASK_RESOLUTIONS = new Set([
  'keep_cloud',
  'discard_local',
  'later'
]);

type SyncConflictRow = {
  id: string;
  mutation_id: string | null;
  entity_type: string;
  entity_id: string;
  reason: string;
  local_json: string | null;
  cloud_json: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

type SyncConflictInput = {
  mutation_id?: string | null;
  entity_type: string;
  entity_id: string;
  reason: string;
  local?: unknown;
  cloud?: unknown;
  status?: string;
};

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function assertNoPrivateData(value: unknown): void {
  if (!isObjectLike(value)) return;
  if (Array.isArray(value)) {
    value.forEach(assertNoPrivateData);
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    if (PRIVATE_KEY_PATTERN.test(key)) {
      throw new HttpError(400, 'sync_conflict_private_data', 'Sync conflict contains private fields');
    }
    assertNoPrivateData(nestedValue);
  }
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeStatus(status: string | null): string {
  const nextStatus = status || 'open';
  return ALLOWED_STATUSES.has(nextStatus) ? nextStatus : 'open';
}

function limitValue(value: string | null): number {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(100, Math.floor(parsed));
}

function conflictDto(row: SyncConflictRow): Record<string, unknown> {
  return {
    id: row.id,
    mutation_id: row.mutation_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    reason: row.reason,
    status: row.status,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    local: parseJson(row.local_json),
    cloud: parseJson(row.cloud_json)
  };
}

export async function createSyncConflictRecord(
  env: Env,
  accountId: string,
  input: SyncConflictInput
): Promise<Record<string, unknown>> {
  const entityType = String(input.entity_type || '').trim();
  const entityId = String(input.entity_id || '').trim();
  const reason = String(input.reason || '').trim();
  if (!entityType || !entityId || !reason) {
    throw new HttpError(400, 'invalid_sync_conflict', 'Sync conflict requires entity type, entity id, and reason');
  }
  assertNoPrivateData(input.local);
  assertNoPrivateData(input.cloud);
  const now = nowISO();
  const id = newId('sync_conflict');
  const status = normalizeStatus(input.status || 'open');
  await env.DB.prepare(
    `INSERT INTO sync_conflicts (
      id, account_id, mutation_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, mutation_id) DO UPDATE SET
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      reason = excluded.reason,
      local_json = excluded.local_json,
      cloud_json = excluded.cloud_json,
      status = excluded.status,
      created_at = excluded.created_at`
  ).bind(
    id,
    accountId,
    input.mutation_id || null,
    entityType,
    entityId,
    reason,
    sanitizeJsonValue(input.local ?? null),
    sanitizeJsonValue(input.cloud ?? null),
    status,
    now
  ).run();

  const row = input.mutation_id
    ? await env.DB.prepare(
      `SELECT id, mutation_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at, resolved_at
       FROM sync_conflicts
       WHERE account_id = ? AND mutation_id = ?`
    ).bind(accountId, input.mutation_id).first<SyncConflictRow>()
    : await env.DB.prepare(
      `SELECT id, mutation_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at, resolved_at
       FROM sync_conflicts
       WHERE account_id = ? AND id = ?`
    ).bind(accountId, id).first<SyncConflictRow>();
  if (!row) throw new HttpError(500, 'sync_conflict_create_failed', 'Sync conflict could not be created');
  return conflictDto(row);
}

export async function listSyncConflicts(
  env: Env,
  accountId: string,
  statusValue: string | null,
  limitInput: string | null
): Promise<Record<string, unknown>> {
  const status = normalizeStatus(statusValue);
  const limit = limitValue(limitInput);
  const rows = await env.DB.prepare(
    `SELECT id, mutation_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at, resolved_at
     FROM sync_conflicts
     WHERE account_id = ? AND status = ?
     ORDER BY created_at DESC
     LIMIT ?`
  ).bind(accountId, status, limit).all<SyncConflictRow>();
  const conflicts = (rows.results || []).map(conflictDto);
  return {
    status,
    limit,
    count: conflicts.length,
    conflicts
  };
}

export async function getSyncConflict(
  env: Env,
  accountId: string,
  conflictId: string
): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(
    `SELECT id, mutation_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at, resolved_at
     FROM sync_conflicts
     WHERE account_id = ? AND id = ?`
  ).bind(accountId, conflictId).first<SyncConflictRow>();
  if (!row) throw new HttpError(404, 'sync_conflict_not_found', 'Sync conflict not found');
  return conflictDto(row);
}

export async function resolveSyncConflict(
  env: Env,
  accountId: string,
  conflictId: string,
  resolutionValue: string
): Promise<Record<string, unknown>> {
  const resolution = String(resolutionValue || '').trim();
  if (!ALLOWED_TASK_RESOLUTIONS.has(resolution)) {
    throw new HttpError(400, 'invalid_sync_conflict_resolution', 'Unsupported sync conflict resolution');
  }

  const row = await env.DB.prepare(
    `SELECT id, mutation_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at, resolved_at
     FROM sync_conflicts
     WHERE account_id = ? AND id = ?`
  ).bind(accountId, conflictId).first<SyncConflictRow>();
  if (!row) throw new HttpError(404, 'sync_conflict_not_found', 'Sync conflict not found');
  if (row.entity_type !== 'task') {
    throw new HttpError(400, 'sync_conflict_resolution_scope_blocked', 'Only single Task sync conflicts can be resolved in this phase');
  }
  if (resolution === 'later') {
    return {
      conflict: conflictDto(row),
      resolution,
      status_changed: false,
      writes_cloud_data: false,
      applies_local_data: false
    };
  }

  const resolvedAt = nowISO();
  await env.DB.prepare(
    `UPDATE sync_conflicts
     SET status = ?, resolved_at = ?
     WHERE account_id = ? AND id = ?`
  ).bind(resolution, resolvedAt, accountId, conflictId).run();

  if (row.mutation_id) {
    await env.DB.prepare(
      `UPDATE sync_mutation_outcomes
       SET outcome_status = ?, reason = ?, conflict_id = ?, last_seen_at = ?
       WHERE account_id = ? AND mutation_id = ?`
    ).bind(
      resolution === 'keep_cloud' ? 'kept_cloud' : 'discarded_local',
      `conflict_resolved_${resolution}`,
      row.id,
      resolvedAt,
      accountId,
      row.mutation_id
    ).run();
  }

  const updated = await env.DB.prepare(
    `SELECT id, mutation_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at, resolved_at
     FROM sync_conflicts
     WHERE account_id = ? AND id = ?`
  ).bind(accountId, conflictId).first<SyncConflictRow>();
  if (!updated) throw new HttpError(500, 'sync_conflict_resolution_failed', 'Sync conflict could not be resolved');
  return {
    conflict: conflictDto(updated),
    resolution,
    status_changed: true,
    writes_cloud_data: false,
    applies_local_data: false
  };
}

export async function findSyncConflictByMutation(
  env: Env,
  accountId: string,
  mutationId: string
): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare(
    `SELECT id, mutation_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at, resolved_at
     FROM sync_conflicts
     WHERE account_id = ? AND mutation_id = ?`
  ).bind(accountId, mutationId).first<SyncConflictRow>();
  return row ? conflictDto(row) : null;
}
