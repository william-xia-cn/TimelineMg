export const LEGACY_INDEXEDDB_SNAPSHOT_SCHEMA = 'timewhere-legacy-indexeddb-snapshot-v1';
export const EXTENSION_BACKUP_MAX_BYTES = 20 * 1024 * 1024;

const TABLES = ['plans', 'buckets', 'labels', 'tasks', 'containers', 'events'];
const PRIVATE_KEY_PATTERN = /token|cookie|secret|password|private_path|local_path|credential/i;
const LOCAL_ONLY_SETTING_KEYS = new Set([
  'google_sync_state',
  'google_sync_conflicts',
  'google_sync_history',
  'google_sync_meta',
  'google_sync_account_key',
  'google_sync_account_name',
  'google_sync_account_email',
  'google_sync_account_picture',
  'desktop_work_reminder_state_v1',
  'desktop_reminder_sent_state',
  'desktop_profile',
  'desktop_auth_state'
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateExtensionBackup(backup) {
  if (!isRecord(backup)) throw new Error('备份文件必须是 JSON 对象');
  if (!isRecord(backup._meta) || backup._meta.app !== 'TimeWhere' || Number(backup._meta.version) !== 1) {
    throw new Error('不是受支持的 TimeWhere Extension v1 备份');
  }
  const expectedTables = [...TABLES, 'habits', 'daily_journals', 'settings'];
  for (const table of expectedTables) {
    if (backup[table] !== undefined && !Array.isArray(backup[table])) {
      throw new Error('备份字段 ' + table + ' 必须是数组');
    }
  }
  return backup;
}

export function summarizeExtensionBackup(backup) {
  validateExtensionBackup(backup);
  const counts = Object.fromEntries(TABLES.map(table => [table, backup[table]?.length || 0]));
  counts.settings = backup.settings?.length || 0;
  return {
    counts,
    skipped: {
      habits: backup.habits?.length || 0,
      daily_journals: backup.daily_journals?.length || 0
    }
  };
}

export async function parseExtensionBackupFile(file) {
  if (!file || typeof file.text !== 'function') throw new Error('请选择 JSON 备份文件');
  if (Number(file.size || 0) > EXTENSION_BACKUP_MAX_BYTES) throw new Error('备份文件不能超过 20 MB');
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }
  validateExtensionBackup(backup);
  return backup;
}

export async function buildExtensionBackupSnapshot(backup) {
  validateExtensionBackup(backup);
  return buildLegacyIndexedDbSnapshot(backup, {
    deviceId: 'extension-json-export-v1',
    exportedAt: backup._meta.exported_at || new Date().toISOString()
  });
}

function toIsoIfDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

export function sanitizeLegacyValue(value) {
  const normalized = toIsoIfDate(value);
  if (Array.isArray(normalized)) return normalized.map(sanitizeLegacyValue).filter(item => item !== undefined);
  if (!isRecord(normalized)) return normalized;

  const clean = {};
  for (const [key, child] of Object.entries(normalized)) {
    if (PRIVATE_KEY_PATTERN.test(key)) continue;
    if (typeof child === 'function' || child === undefined) continue;
    const next = sanitizeLegacyValue(child);
    if (next !== undefined) clean[key] = next;
  }
  return clean;
}

function normalizeUpdatedAt(row) {
  return row.updated_at || row.updatedAt || row.modified_at || row.modifiedAt || row.created_at || row.createdAt || null;
}

function normalizeRow(table, row) {
  const clean = sanitizeLegacyValue(row);
  if (!isRecord(clean)) return null;
  const normalized = { ...clean };
  const updatedAt = normalizeUpdatedAt(normalized);
  if (updatedAt && !normalized.updated_at) normalized.updated_at = updatedAt;
  if (table === 'tasks') {
    if (!normalized.due_date && normalized.deadline) normalized.due_date = normalized.deadline;
    if (!normalized.progress && normalized.status) normalized.progress = normalized.status;
    if (!Array.isArray(normalized.checklist)) normalized.checklist = [];
    if (!Array.isArray(normalized.labels)) normalized.labels = [];
  }
  if (table === 'containers') {
    if (!Array.isArray(normalized.days)) normalized.days = [];
    if (normalized.enabled === undefined) normalized.enabled = true;
  }
  return normalized;
}

async function maybeCall(source, methodName) {
  if (typeof source?.[methodName] === 'function') return await source[methodName]();
  return null;
}

async function readTable(source, table) {
  if (Array.isArray(source?.[table])) return source[table];
  if (typeof source?.[table]?.toArray === 'function') return await source[table].toArray();
  if (typeof source?.db?.[table]?.toArray === 'function') return await source.db[table].toArray();

  const methodByTable = {
    plans: 'getPlans',
    buckets: 'getBuckets',
    labels: 'getLabels',
    tasks: 'getAllTasks',
    containers: 'getContainers',
    events: 'getEvents'
  };
  const viaMethod = await maybeCall(source, methodByTable[table]);
  return Array.isArray(viaMethod) ? viaMethod : [];
}

async function readSettings(source) {
  if (Array.isArray(source?.settings)) return source.settings;
  if (typeof source?.settings?.toArray === 'function') return await source.settings.toArray();
  if (typeof source?.db?.settings?.toArray === 'function') return await source.db.settings.toArray();
  if (isRecord(source?.settings)) return source.settings;
  const viaMethod = await maybeCall(source, 'getAllSettings');
  return viaMethod || {};
}

export function normalizeLegacySettings(settings) {
  const entries = Array.isArray(settings)
    ? settings.map(row => [row?.key, row?.value])
    : isRecord(settings)
      ? Object.entries(settings)
      : [];
  const clean = {};
  for (const [key, value] of entries) {
    if (!key || LOCAL_ONLY_SETTING_KEYS.has(String(key)) || PRIVATE_KEY_PATTERN.test(String(key))) continue;
    clean[String(key)] = sanitizeLegacyValue(value);
  }
  return clean;
}

export async function buildLegacyIndexedDbSnapshot(source, {
  deviceId = 'legacy-indexeddb',
  exportedAt = new Date().toISOString()
} = {}) {
  const data = {};
  for (const table of TABLES) {
    const rows = await readTable(source, table);
    data[table] = rows.map(row => normalizeRow(table, row)).filter(Boolean);
  }
  data.settings = normalizeLegacySettings(await readSettings(source));
  return {
    schema: LEGACY_INDEXEDDB_SNAPSHOT_SCHEMA,
    exported_at: exportedAt,
    device_id: deviceId,
    data
  };
}
