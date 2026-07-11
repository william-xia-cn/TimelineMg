import { newId, nowISO } from './crypto';
import type { Env } from './types';

type SyncChangeRow = {
  sequence: number;
  id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  entity_revision: number | null;
  changed_at: string;
};

function numericCursor(value: string | null): number {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function numericLimit(value: string | null): number {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(500, Math.floor(parsed));
}

export async function recordSyncChange(
  env: Env,
  accountId: string,
  entityType: string,
  entityId: string,
  operation: string,
  entityRevision: unknown
): Promise<void> {
  const revision = Number(entityRevision);
  await env.DB.prepare(
    `INSERT INTO sync_changes (
      id, account_id, entity_type, entity_id, operation, entity_revision, changed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    newId('chg'),
    accountId,
    entityType,
    entityId,
    operation,
    Number.isFinite(revision) ? revision : null,
    nowISO()
  ).run();
}

export async function listSyncChanges(
  env: Env,
  accountId: string,
  cursorValue: string | null,
  limitValue: string | null
): Promise<Record<string, unknown>> {
  const cursor = numericCursor(cursorValue);
  const limit = numericLimit(limitValue);
  const result = await env.DB.prepare(
    `SELECT sequence, id, entity_type, entity_id, operation, entity_revision, changed_at
     FROM sync_changes
     WHERE account_id = ? AND sequence > ?
     ORDER BY sequence ASC
     LIMIT ?`
  ).bind(accountId, cursor, limit).all<SyncChangeRow>();
  const changes = (result.results || []).map(row => ({
    cursor: row.sequence,
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    operation: row.operation,
    entity_revision: row.entity_revision,
    changed_at: row.changed_at
  }));
  const nextCursor = changes.length ? Number(changes[changes.length - 1].cursor) : cursor;
  return {
    cursor,
    next_cursor: nextCursor,
    has_more: changes.length === limit,
    changes
  };
}
