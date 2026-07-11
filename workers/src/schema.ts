export const SNAPSHOT_TABLES = [
  'plans',
  'buckets',
  'labels',
  'tasks',
  'containers',
  'events',
  'habits',
  'daily_journals',
  'settings'
] as const;

export function sanitizeJsonValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
