import { HttpError } from './http';
import { newId, nowISO } from './crypto';
import { sanitizeJsonValue } from './schema';
import type { Env } from './types';

type TaskRow = Record<string, unknown>;

type TaskListQuery = {
  progress?: string | null;
  includeCompleted?: boolean;
  search?: string | null;
};

const TASK_UPDATE_FIELDS: Record<string, string> = {
  plan_id: 'plan_id',
  bucket_id: 'bucket_id',
  title: 'title',
  notes: 'notes',
  description: 'description',
  start_date: 'start_date',
  due_date: 'due_date',
  schedule_time: 'schedule_time',
  duration: 'duration',
  priority: 'priority',
  progress: 'progress',
  completed_at: 'completed_at'
};

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : value === null ? null : null;
}

function normalizeDuration(value: unknown): number {
  const numberValue = Number(value ?? 45);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 45;
  return Math.min(24 * 60, Math.round(numberValue));
}

function normalizeProgress(value: unknown): string {
  const progress = optionalString(value) || 'not_started';
  if (['not_started', 'in_progress', 'blocked', 'completed'].includes(progress)) return progress;
  return 'not_started';
}

function normalizePriority(value: unknown): string {
  const priority = optionalString(value) || 'medium';
  if (['urgent', 'important', 'medium', 'low', 'P1', 'P2', 'P3', 'P4'].includes(priority)) return priority;
  return 'medium';
}

function taskDto(row: TaskRow): Record<string, unknown> {
  return {
    ...row,
    checklist: parseJsonArray(row.checklist_json),
    labels: parseJsonArray(row.labels_json),
    checklist_json: undefined,
    labels_json: undefined
  };
}

function bindValueForPatch(key: string, value: unknown): unknown {
  if (key === 'title') {
    const title = nullableString(value);
    if (!title) throw new HttpError(400, 'missing_task_title', 'Task title is required');
    return title;
  }
  if (key === 'duration') return normalizeDuration(value);
  if (key === 'progress') return normalizeProgress(value);
  if (key === 'priority') return normalizePriority(value);
  return value === undefined ? null : value;
}

export async function listTasks(env: Env, accountId: string, query: TaskListQuery = {}): Promise<Record<string, unknown>[]> {
  const clauses = ['account_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [accountId];
  if (!query.includeCompleted) clauses.push("progress != 'completed'");
  if (query.progress) {
    clauses.push('progress = ?');
    values.push(query.progress);
  }
  if (query.search) {
    clauses.push('(title LIKE ? OR notes LIKE ? OR description LIKE ?)');
    const search = `%${query.search}%`;
    values.push(search, search, search);
  }
  const result = await env.DB.prepare(
    `SELECT * FROM tasks WHERE ${clauses.join(' AND ')} ORDER BY due_date IS NULL, due_date ASC, priority ASC, updated_at DESC LIMIT 500`
  ).bind(...values).all<TaskRow>();
  return (result.results || []).map(taskDto);
}

export async function createTask(env: Env, accountId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = nowISO();
  const id = newId('task');
  const title = nullableString(input.title);
  if (!title) throw new HttpError(400, 'missing_task_title', 'Task title is required');
  const progress = normalizeProgress(input.progress);
  await env.DB.prepare(
    `INSERT INTO tasks (
      id, account_id, plan_id, bucket_id, legacy_id, title, notes, description, checklist_json, labels_json,
      start_date, due_date, schedule_time, duration, priority, progress, completed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    accountId,
    input.plan_id || null,
    input.bucket_id || null,
    input.legacy_id || null,
    title,
    optionalString(input.notes),
    optionalString(input.description),
    sanitizeJsonValue(Array.isArray(input.checklist) ? input.checklist : []),
    sanitizeJsonValue(Array.isArray(input.labels) ? input.labels : []),
    optionalString(input.start_date),
    optionalString(input.due_date),
    optionalString(input.schedule_time),
    normalizeDuration(input.duration),
    normalizePriority(input.priority),
    progress,
    progress === 'completed' ? optionalString(input.completed_at) || now : optionalString(input.completed_at),
    now,
    now
  ).run();
  return await getTask(env, accountId, id);
}

export async function getTask(env: Env, accountId: string, id: string): Promise<Record<string, unknown>> {
  const task = await env.DB.prepare(
    'SELECT * FROM tasks WHERE account_id = ? AND id = ? AND deleted_at IS NULL'
  ).bind(accountId, id).first<TaskRow>();
  if (!task) throw new HttpError(404, 'task_not_found', 'Task not found');
  return taskDto(task);
}

export async function updateTask(env: Env, accountId: string, id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  await getTask(env, accountId, id);
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [inputKey, columnName] of Object.entries(TASK_UPDATE_FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(patch, inputKey)) {
      updates.push(`${columnName} = ?`);
      values.push(bindValueForPatch(inputKey, patch[inputKey]));
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'checklist')) {
    updates.push('checklist_json = ?');
    values.push(sanitizeJsonValue(Array.isArray(patch.checklist) ? patch.checklist : []));
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'labels')) {
    updates.push('labels_json = ?');
    values.push(sanitizeJsonValue(Array.isArray(patch.labels) ? patch.labels : []));
  }
  if (patch.progress === 'completed' && !Object.prototype.hasOwnProperty.call(patch, 'completed_at')) {
    updates.push('completed_at = ?');
    values.push(nowISO());
  }
  if (patch.progress && patch.progress !== 'completed' && !Object.prototype.hasOwnProperty.call(patch, 'completed_at')) {
    updates.push('completed_at = ?');
    values.push(null);
  }
  if (!updates.length) return await getTask(env, accountId, id);
  updates.push('updated_at = ?', 'revision = revision + 1');
  values.push(nowISO(), accountId, id);
  await env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE account_id = ? AND id = ?`).bind(...values).run();
  return await getTask(env, accountId, id);
}

export async function deleteTask(env: Env, accountId: string, id: string): Promise<{ deleted: true; id: string }> {
  await getTask(env, accountId, id);
  await env.DB.prepare(
    'UPDATE tasks SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE account_id = ? AND id = ?'
  ).bind(nowISO(), nowISO(), accountId, id).run();
  return { deleted: true, id };
}


function eventDto(row: Record<string, unknown>): Record<string, unknown> {
  let payload: unknown = null;
  if (typeof row.payload_json === 'string' && row.payload_json) {
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      payload = null;
    }
  }
  return {
    ...row,
    payload,
    payload_json: undefined
  };
}

export async function listCalendarEvents(env: Env, accountId: string, query: { dateFrom?: string | null; dateTo?: string | null; search?: string | null } = {}): Promise<Record<string, unknown>[]> {
  const clauses = ['account_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [accountId];
  if (query.dateFrom) {
    clauses.push('date >= ?');
    values.push(query.dateFrom);
  }
  if (query.dateTo) {
    clauses.push('date <= ?');
    values.push(query.dateTo);
  }
  if (query.search) {
    clauses.push('(title LIKE ? OR source LIKE ? OR subject_in_matrixview LIKE ?)');
    const search = `%${query.search}%`;
    values.push(search, search, search);
  }
  const result = await env.DB.prepare(
    `SELECT * FROM calendar_events WHERE ${clauses.join(' AND ')} ORDER BY date IS NULL, date ASC, time_start IS NULL, time_start ASC, updated_at DESC LIMIT 500`
  ).bind(...values).all<Record<string, unknown>>();
  return (result.results || []).map(eventDto);
}

export async function createCalendarEvent(env: Env, accountId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = nowISO();
  const id = newId('event');
  const title = nullableString(input.title);
  if (!title) throw new HttpError(400, 'missing_event_title', 'Event title is required');
  await env.DB.prepare(
    `INSERT INTO calendar_events (
      id, account_id, container_id, legacy_id, title, date, time_start, time_end, source, source_uid,
      subject_in_matrixview, active_start_date, active_end_date, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    accountId,
    input.container_id || null,
    input.legacy_id || null,
    title,
    optionalString(input.date),
    optionalString(input.time_start),
    optionalString(input.time_end),
    optionalString(input.source),
    optionalString(input.source_uid),
    optionalString(input.subject_in_matrixview),
    optionalString(input.active_start_date),
    optionalString(input.active_end_date),
    sanitizeJsonValue(input.payload || {}),
    now,
    now
  ).run();
  return await getCalendarEvent(env, accountId, id);
}

export async function getCalendarEvent(env: Env, accountId: string, id: string): Promise<Record<string, unknown>> {
  const event = await env.DB.prepare(
    'SELECT * FROM calendar_events WHERE account_id = ? AND id = ? AND deleted_at IS NULL'
  ).bind(accountId, id).first<Record<string, unknown>>();
  if (!event) throw new HttpError(404, 'event_not_found', 'Calendar event not found');
  return eventDto(event);
}

export async function updateCalendarEvent(env: Env, accountId: string, id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  await getCalendarEvent(env, accountId, id);
  const allowed: Record<string, string> = {
    container_id: 'container_id',
    title: 'title',
    date: 'date',
    time_start: 'time_start',
    time_end: 'time_end',
    source: 'source',
    source_uid: 'source_uid',
    subject_in_matrixview: 'subject_in_matrixview',
    active_start_date: 'active_start_date',
    active_end_date: 'active_end_date'
  };
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [inputKey, columnName] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(patch, inputKey)) {
      if (inputKey === 'title') {
        const title = nullableString(patch.title);
        if (!title) throw new HttpError(400, 'missing_event_title', 'Event title is required');
        updates.push(`${columnName} = ?`);
        values.push(title);
      } else {
        updates.push(`${columnName} = ?`);
        values.push(patch[inputKey] === undefined ? null : patch[inputKey]);
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payload')) {
    updates.push('payload_json = ?');
    values.push(sanitizeJsonValue(patch.payload || {}));
  }
  if (!updates.length) return await getCalendarEvent(env, accountId, id);
  updates.push('updated_at = ?', 'revision = revision + 1');
  values.push(nowISO(), accountId, id);
  await env.DB.prepare(`UPDATE calendar_events SET ${updates.join(', ')} WHERE account_id = ? AND id = ?`).bind(...values).run();
  return await getCalendarEvent(env, accountId, id);
}

export async function deleteCalendarEvent(env: Env, accountId: string, id: string): Promise<{ deleted: true; id: string }> {
  await getCalendarEvent(env, accountId, id);
  await env.DB.prepare(
    'UPDATE calendar_events SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE account_id = ? AND id = ?'
  ).bind(nowISO(), nowISO(), accountId, id).run();
  return { deleted: true, id };
}

function sortOrder(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : 0;
}

function planDto(row: Record<string, unknown>): Record<string, unknown> {
  return row;
}

export async function listPlans(env: Env, accountId: string, query: { search?: string | null } = {}): Promise<Record<string, unknown>[]> {
  const clauses = ['account_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [accountId];
  if (query.search) {
    clauses.push('(name LIKE ? OR subject LIKE ? OR subject_in_matrixview LIKE ?)');
    const search = `%${query.search}%`;
    values.push(search, search, search);
  }
  const result = await env.DB.prepare(
    `SELECT * FROM plans WHERE ${clauses.join(' AND ')} ORDER BY sort_order ASC, updated_at DESC LIMIT 500`
  ).bind(...values).all<Record<string, unknown>>();
  return (result.results || []).map(planDto);
}

export async function createPlan(env: Env, accountId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = nowISO();
  const id = newId('plan');
  const name = nullableString(input.name);
  if (!name) throw new HttpError(400, 'missing_plan_name', 'Plan name is required');
  await env.DB.prepare(
    `INSERT INTO plans (
      id, account_id, legacy_id, name, color, icon_char, subject, subject_in_matrixview, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    accountId,
    input.legacy_id || null,
    name,
    optionalString(input.color),
    optionalString(input.icon_char),
    optionalString(input.subject),
    optionalString(input.subject_in_matrixview),
    sortOrder(input.sort_order),
    now,
    now
  ).run();
  return await getPlan(env, accountId, id);
}

export async function getPlan(env: Env, accountId: string, id: string): Promise<Record<string, unknown>> {
  const plan = await env.DB.prepare(
    'SELECT * FROM plans WHERE account_id = ? AND id = ? AND deleted_at IS NULL'
  ).bind(accountId, id).first<Record<string, unknown>>();
  if (!plan) throw new HttpError(404, 'plan_not_found', 'Plan not found');
  return planDto(plan);
}

export async function updatePlan(env: Env, accountId: string, id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  await getPlan(env, accountId, id);
  const allowed: Record<string, string> = {
    name: 'name',
    color: 'color',
    icon_char: 'icon_char',
    subject: 'subject',
    subject_in_matrixview: 'subject_in_matrixview',
    sort_order: 'sort_order'
  };
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [inputKey, columnName] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(patch, inputKey)) {
      if (inputKey === 'name') {
        const name = nullableString(patch.name);
        if (!name) throw new HttpError(400, 'missing_plan_name', 'Plan name is required');
        updates.push(`${columnName} = ?`);
        values.push(name);
      } else if (inputKey === 'sort_order') {
        updates.push(`${columnName} = ?`);
        values.push(sortOrder(patch.sort_order));
      } else {
        updates.push(`${columnName} = ?`);
        values.push(patch[inputKey] === undefined ? null : patch[inputKey]);
      }
    }
  }
  if (!updates.length) return await getPlan(env, accountId, id);
  updates.push('updated_at = ?', 'revision = revision + 1');
  values.push(nowISO(), accountId, id);
  await env.DB.prepare(`UPDATE plans SET ${updates.join(', ')} WHERE account_id = ? AND id = ?`).bind(...values).run();
  return await getPlan(env, accountId, id);
}

export async function deletePlan(env: Env, accountId: string, id: string): Promise<{ deleted: true; id: string }> {
  await getPlan(env, accountId, id);
  await env.DB.prepare(
    'UPDATE plans SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE account_id = ? AND id = ?'
  ).bind(nowISO(), nowISO(), accountId, id).run();
  return { deleted: true, id };
}
function bucketDto(row: Record<string, unknown>): Record<string, unknown> {
  return row;
}

export async function listBuckets(env: Env, accountId: string, query: { search?: string | null } = {}): Promise<Record<string, unknown>[]> {
  const clauses = ['account_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [accountId];
  if (query.search) {
    clauses.push('(name LIKE ? OR color LIKE ?)');
    const search = `%${query.search}%`;
    values.push(search, search);
  }
  const result = await env.DB.prepare(
    `SELECT * FROM buckets WHERE ${clauses.join(' AND ')} ORDER BY sort_order ASC, updated_at DESC LIMIT 500`
  ).bind(...values).all<Record<string, unknown>>();
  return (result.results || []).map(bucketDto);
}

export async function createBucket(env: Env, accountId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = nowISO();
  const id = newId('bucket');
  const name = nullableString(input.name);
  if (!name) throw new HttpError(400, 'missing_bucket_name', 'Bucket name is required');
  await env.DB.prepare(
    `INSERT INTO buckets (id, account_id, plan_id, legacy_id, name, color, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    accountId,
    input.plan_id || null,
    input.legacy_id || null,
    name,
    optionalString(input.color),
    sortOrder(input.sort_order),
    now,
    now
  ).run();
  return await getBucket(env, accountId, id);
}

export async function getBucket(env: Env, accountId: string, id: string): Promise<Record<string, unknown>> {
  const bucket = await env.DB.prepare(
    'SELECT * FROM buckets WHERE account_id = ? AND id = ? AND deleted_at IS NULL'
  ).bind(accountId, id).first<Record<string, unknown>>();
  if (!bucket) throw new HttpError(404, 'bucket_not_found', 'Bucket not found');
  return bucketDto(bucket);
}

export async function updateBucket(env: Env, accountId: string, id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  await getBucket(env, accountId, id);
  const allowed: Record<string, string> = {
    plan_id: 'plan_id',
    name: 'name',
    color: 'color',
    sort_order: 'sort_order'
  };
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [inputKey, columnName] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(patch, inputKey)) {
      if (inputKey === 'name') {
        const name = nullableString(patch.name);
        if (!name) throw new HttpError(400, 'missing_bucket_name', 'Bucket name is required');
        updates.push(`${columnName} = ?`);
        values.push(name);
      } else if (inputKey === 'sort_order') {
        updates.push(`${columnName} = ?`);
        values.push(sortOrder(patch.sort_order));
      } else {
        updates.push(`${columnName} = ?`);
        values.push(patch[inputKey] === undefined ? null : patch[inputKey]);
      }
    }
  }
  if (!updates.length) return await getBucket(env, accountId, id);
  updates.push('updated_at = ?', 'revision = revision + 1');
  values.push(nowISO(), accountId, id);
  await env.DB.prepare(`UPDATE buckets SET ${updates.join(', ')} WHERE account_id = ? AND id = ?`).bind(...values).run();
  return await getBucket(env, accountId, id);
}

export async function deleteBucket(env: Env, accountId: string, id: string): Promise<{ deleted: true; id: string }> {
  await getBucket(env, accountId, id);
  await env.DB.prepare(
    'UPDATE buckets SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE account_id = ? AND id = ?'
  ).bind(nowISO(), nowISO(), accountId, id).run();
  return { deleted: true, id };
}

function labelDto(row: Record<string, unknown>): Record<string, unknown> {
  return row;
}

export async function listLabels(env: Env, accountId: string, query: { search?: string | null } = {}): Promise<Record<string, unknown>[]> {
  const clauses = ['account_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [accountId];
  if (query.search) {
    clauses.push('(name LIKE ? OR color LIKE ?)');
    const search = `%${query.search}%`;
    values.push(search, search);
  }
  const result = await env.DB.prepare(
    `SELECT * FROM labels WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC LIMIT 500`
  ).bind(...values).all<Record<string, unknown>>();
  return (result.results || []).map(labelDto);
}

export async function createLabel(env: Env, accountId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = nowISO();
  const id = newId('label');
  const name = nullableString(input.name);
  if (!name) throw new HttpError(400, 'missing_label_name', 'Label name is required');
  await env.DB.prepare(
    `INSERT INTO labels (id, account_id, plan_id, legacy_id, name, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    accountId,
    input.plan_id || null,
    input.legacy_id || null,
    name,
    optionalString(input.color),
    now,
    now
  ).run();
  return await getLabel(env, accountId, id);
}

export async function getLabel(env: Env, accountId: string, id: string): Promise<Record<string, unknown>> {
  const label = await env.DB.prepare(
    'SELECT * FROM labels WHERE account_id = ? AND id = ? AND deleted_at IS NULL'
  ).bind(accountId, id).first<Record<string, unknown>>();
  if (!label) throw new HttpError(404, 'label_not_found', 'Label not found');
  return labelDto(label);
}

export async function updateLabel(env: Env, accountId: string, id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  await getLabel(env, accountId, id);
  const allowed: Record<string, string> = {
    plan_id: 'plan_id',
    name: 'name',
    color: 'color'
  };
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [inputKey, columnName] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(patch, inputKey)) {
      if (inputKey === 'name') {
        const name = nullableString(patch.name);
        if (!name) throw new HttpError(400, 'missing_label_name', 'Label name is required');
        updates.push(`${columnName} = ?`);
        values.push(name);
      } else {
        updates.push(`${columnName} = ?`);
        values.push(patch[inputKey] === undefined ? null : patch[inputKey]);
      }
    }
  }
  if (!updates.length) return await getLabel(env, accountId, id);
  updates.push('updated_at = ?', 'revision = revision + 1');
  values.push(nowISO(), accountId, id);
  await env.DB.prepare(`UPDATE labels SET ${updates.join(', ')} WHERE account_id = ? AND id = ?`).bind(...values).run();
  return await getLabel(env, accountId, id);
}

export async function deleteLabel(env: Env, accountId: string, id: string): Promise<{ deleted: true; id: string }> {
  await getLabel(env, accountId, id);
  await env.DB.prepare(
    'UPDATE labels SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE account_id = ? AND id = ?'
  ).bind(nowISO(), nowISO(), accountId, id).run();
  return { deleted: true, id };
}
function containerDto(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    days: parseJsonArray(row.days_json),
    enabled: row.enabled === 1 || row.enabled === true,
    days_json: undefined
  };
}

function normalizeEnabled(value: unknown): number {
  return value === false || value === 0 ? 0 : 1;
}

export async function listContainers(env: Env, accountId: string, query: { search?: string | null } = {}): Promise<Record<string, unknown>[]> {
  const clauses = ['account_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [accountId];
  if (query.search) {
    clauses.push('(name LIKE ? OR repeat LIKE ?)');
    const search = `%${query.search}%`;
    values.push(search, search);
  }
  const result = await env.DB.prepare(
    `SELECT * FROM containers WHERE ${clauses.join(' AND ')} ORDER BY time_start IS NULL, time_start ASC, updated_at DESC LIMIT 500`
  ).bind(...values).all<Record<string, unknown>>();
  return (result.results || []).map(containerDto);
}

export async function createContainer(env: Env, accountId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = nowISO();
  const id = newId('container');
  const name = nullableString(input.name);
  if (!name) throw new HttpError(400, 'missing_container_name', 'Container name is required');
  await env.DB.prepare(
    `INSERT INTO containers (
      id, account_id, legacy_id, name, time_start, time_end, repeat, days_json, enabled,
      active_start_date, active_end_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    accountId,
    input.legacy_id || null,
    name,
    optionalString(input.time_start),
    optionalString(input.time_end),
    optionalString(input.repeat),
    sanitizeJsonValue(Array.isArray(input.days) ? input.days : []),
    normalizeEnabled(input.enabled),
    optionalString(input.active_start_date),
    optionalString(input.active_end_date),
    now,
    now
  ).run();
  return await getContainer(env, accountId, id);
}

export async function getContainer(env: Env, accountId: string, id: string): Promise<Record<string, unknown>> {
  const container = await env.DB.prepare(
    'SELECT * FROM containers WHERE account_id = ? AND id = ? AND deleted_at IS NULL'
  ).bind(accountId, id).first<Record<string, unknown>>();
  if (!container) throw new HttpError(404, 'container_not_found', 'Container not found');
  return containerDto(container);
}

export async function updateContainer(env: Env, accountId: string, id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  await getContainer(env, accountId, id);
  const allowed: Record<string, string> = {
    name: 'name',
    time_start: 'time_start',
    time_end: 'time_end',
    repeat: 'repeat',
    enabled: 'enabled',
    active_start_date: 'active_start_date',
    active_end_date: 'active_end_date'
  };
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [inputKey, columnName] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(patch, inputKey)) {
      if (inputKey === 'name') {
        const name = nullableString(patch.name);
        if (!name) throw new HttpError(400, 'missing_container_name', 'Container name is required');
        updates.push(`${columnName} = ?`);
        values.push(name);
      } else if (inputKey === 'enabled') {
        updates.push(`${columnName} = ?`);
        values.push(normalizeEnabled(patch.enabled));
      } else {
        updates.push(`${columnName} = ?`);
        values.push(patch[inputKey] === undefined ? null : patch[inputKey]);
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'days')) {
    updates.push('days_json = ?');
    values.push(sanitizeJsonValue(Array.isArray(patch.days) ? patch.days : []));
  }
  if (!updates.length) return await getContainer(env, accountId, id);
  updates.push('updated_at = ?', 'revision = revision + 1');
  values.push(nowISO(), accountId, id);
  await env.DB.prepare(`UPDATE containers SET ${updates.join(', ')} WHERE account_id = ? AND id = ?`).bind(...values).run();
  return await getContainer(env, accountId, id);
}

export async function deleteContainer(env: Env, accountId: string, id: string): Promise<{ deleted: true; id: string }> {
  await getContainer(env, accountId, id);
  await env.DB.prepare(
    'UPDATE containers SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE account_id = ? AND id = ?'
  ).bind(nowISO(), nowISO(), accountId, id).run();
  return { deleted: true, id };
}
export async function getSettings(env: Env, accountId: string): Promise<Record<string, unknown>> {
  const result = await env.DB.prepare('SELECT key, value_json FROM product_settings WHERE account_id = ?')
    .bind(accountId)
    .all<{ key: string; value_json: string }>();
  const settings: Record<string, unknown> = {};
  for (const row of result.results || []) {
    try {
      settings[row.key] = JSON.parse(row.value_json);
    } catch {
      settings[row.key] = row.value_json;
    }
  }
  return settings;
}

export async function updateSettings(env: Env, accountId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = nowISO();
  for (const [key, value] of Object.entries(patch)) {
    if (!key || key.includes('token') || key.includes('secret') || key.includes('cookie')) continue;
    await env.DB.prepare(
      `INSERT INTO product_settings (account_id, key, value_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at,
         revision = revision + 1`
    ).bind(accountId, key, sanitizeJsonValue(value), now).run();
  }
  return await getSettings(env, accountId);
}


