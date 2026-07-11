import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sessionBearer = process.env.TIMEWHERE_LOCAL_SESSION_BEARER || 'timewhere-local-dev-session';
const sessionHash = createHash('sha256').update(sessionBearer).digest('hex');
const now = new Date().toISOString();
const today = now.slice(0, 10);
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const outputPath = resolve('.tmp/local-seed.sql');

function q(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function json(value) {
  return q(JSON.stringify(value));
}

const sql = `
INSERT INTO accounts (id, google_sub, email, display_name, picture_url, created_at, updated_at)
VALUES ('acct_local_dev', 'local-dev-sub', 'local-dev@example.invalid', 'Local Dev User', NULL, ${q(now)}, ${q(now)})
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  display_name = excluded.display_name,
  updated_at = excluded.updated_at;

INSERT INTO user_profiles (id, account_id, name, created_at, updated_at)
VALUES ('profile_local_dev', 'acct_local_dev', 'Local Dev Workspace', ${q(now)}, ${q(now)})
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  updated_at = excluded.updated_at;

INSERT INTO account_sessions (id, account_id, token_hash, created_at, expires_at, revoked_at)
VALUES ('sess_local_dev', 'acct_local_dev', ${q(sessionHash)}, ${q(now)}, '2099-01-01T00:00:00.000Z', NULL)
ON CONFLICT(id) DO UPDATE SET
  token_hash = excluded.token_hash,
  expires_at = excluded.expires_at,
  revoked_at = NULL;

INSERT INTO plans (id, account_id, legacy_id, name, color, icon_char, subject, subject_in_matrixview, sort_order, created_at, updated_at)
VALUES ('plan_local_study', 'acct_local_dev', 'legacy-plan-study', 'Study', '#2563eb', 'S', 'Study', 'Study', 1, ${q(now)}, ${q(now)})
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  color = excluded.color,
  updated_at = excluded.updated_at;

INSERT INTO buckets (id, account_id, plan_id, legacy_id, name, color, sort_order, created_at, updated_at)
VALUES ('bucket_local_focus', 'acct_local_dev', 'plan_local_study', 'legacy-bucket-focus', 'Focus', '#0ea5e9', 1, ${q(now)}, ${q(now)})
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  color = excluded.color,
  updated_at = excluded.updated_at;

INSERT INTO labels (id, account_id, plan_id, legacy_id, name, color, created_at, updated_at)
VALUES ('label_local_priority', 'acct_local_dev', 'plan_local_study', 'legacy-label-priority', 'Priority', '#f97316', ${q(now)}, ${q(now)})
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  color = excluded.color,
  updated_at = excluded.updated_at;

INSERT INTO containers (id, account_id, legacy_id, name, time_start, time_end, repeat, days_json, enabled, active_start_date, active_end_date, created_at, updated_at)
VALUES ('container_local_evening', 'acct_local_dev', 'legacy-container-evening', 'Evening Focus', '19:00', '21:00', 'daily', ${json([])}, 1, NULL, NULL, ${q(now)}, ${q(now)})
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  time_start = excluded.time_start,
  time_end = excluded.time_end,
  repeat = excluded.repeat,
  updated_at = excluded.updated_at;

INSERT INTO tasks (
  id, account_id, plan_id, bucket_id, legacy_id, title, notes, description, checklist_json, labels_json,
  start_date, arranged_date, due_date, schedule_time, duration, subject, priority, progress, completed_at,
  source, source_type, source_uid, source_url, source_updated_at, created_at, updated_at
)
VALUES (
  'task_local_reading', 'acct_local_dev', 'plan_local_study', 'bucket_local_focus', 'legacy-task-reading',
  'Read migration design', 'Local seed task for WebDev smoke.', NULL, ${json([{ text: 'Open task detail', done: false }])}, ${json(['Priority'])},
  ${q(today)}, NULL, ${q(tomorrow)}, '19:30', 45, 'Study', 'important', 'not_started', NULL,
  'local-seed', 'local-seed', 'local-seed-task-reading', NULL, NULL, ${q(now)}, ${q(now)}
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  notes = excluded.notes,
  due_date = excluded.due_date,
  schedule_time = excluded.schedule_time,
  updated_at = excluded.updated_at;

INSERT INTO calendar_events (
  id, account_id, container_id, legacy_id, title, date, time_start, time_end, source, source_uid,
  subject_in_matrixview, active_start_date, active_end_date, payload_json, created_at, updated_at
)
VALUES (
  'event_local_planning', 'acct_local_dev', 'container_local_evening', 'legacy-event-planning',
  'Planning block', ${q(today)}, '19:00', '19:25', 'local-seed', 'local-seed-event-planning',
  'Study', NULL, NULL, ${json({ seed: true })}, ${q(now)}, ${q(now)}
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  date = excluded.date,
  time_start = excluded.time_start,
  time_end = excluded.time_end,
  updated_at = excluded.updated_at;

INSERT INTO product_settings (account_id, key, value_json, updated_at)
VALUES ('acct_local_dev', 'webdev_seed_ready', 'true', ${q(now)})
ON CONFLICT(account_id, key) DO UPDATE SET
  value_json = excluded.value_json,
  updated_at = excluded.updated_at,
  revision = revision + 1;
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, sql.trimStart(), 'utf8');

console.log(`Wrote ${outputPath}`);
console.log(`Use Authorization: Bearer ${sessionBearer}`);
