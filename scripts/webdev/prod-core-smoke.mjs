import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const localStateDir = path.join(root, '.wrangler');
const resourcesPath = path.join(localStateDir, 'timewhere-prod-resources.local.json');
const deploymentStatePath = path.join(localStateDir, 'timewhere-prod-deployment.local.json');
const generatedConfigPath = path.join(localStateDir, 'timewhere-webdev.prod.generated.wrangler.toml');
const wranglerBinPath = path.join(root, 'workers', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const tokenEnvName = 'CLOUDFLARE_' + 'API_' + 'TOKEN';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sanitize(text) {
  const token = process.env[tokenEnvName] || '';
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text || '')
    .replaceAll(root, '<workspace>')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<uuid>')
    .replace(/[a-f0-9]{32,}/gi, '<hex-id>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/[A-Za-z]:\\Users\\[^\\\r\n"]+/g, '<user-home>')
    .replace(new RegExp(escapedToken || '___NO_TOKEN___', 'g'), '<token>');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    shell: false
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${sanitize(output)}`);
  }
  return {
    ok: result.status === 0,
    output,
    sanitizedOutput: sanitize(output)
  };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isRetryableWranglerFailure(output) {
  return /Authentication error\s+\[code:\s*10000\]|A request to the Cloudflare API .* failed|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(String(output || ''));
}

function runWrangler(args, options = {}) {
  const attempts = options.allowFailure ? 1 : (options.attempts || 4);
  let lastResult = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = run(process.execPath, [wranglerBinPath, ...args], { ...options, allowFailure: true });
    if (result.ok || options.allowFailure) return result;
    lastResult = result;
    if (!isRetryableWranglerFailure(result.output) || attempt === attempts) break;
    console.warn(`  WARN Wrangler transient failure, retrying ${attempt}/${attempts - 1}...`);
    sleep(1000 * attempt);
  }
  throw new Error(`${process.execPath} ${[wranglerBinPath, ...args].join(' ')} failed:\n${lastResult?.sanitizedOutput || ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLocalState() {
  assert(fs.existsSync(resourcesPath), 'Missing local Cloudflare resource state. Run npm run webdev:prod:provision first.');
  assert(fs.existsSync(deploymentStatePath), 'Missing local prod deployment state. Run npm run webdev:prod:deploy first.');
  assert(fs.existsSync(generatedConfigPath), 'Missing generated wrangler config. Run npm run webdev:prod:provision first.');
  assert(fs.existsSync(wranglerBinPath), 'Missing local Wrangler dependency. Run npm --prefix workers install first.');
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function d1(command) {
  return runWrangler([
    'd1',
    'execute',
    'DB',
    '--remote',
    '--config',
    generatedConfigPath,
    '--env',
    'prod',
    '--command',
    command
  ]);
}

function cleanupSmokeAccounts() {
  const smokeAccountWhere = "account_id IN (SELECT id FROM accounts WHERE google_sub LIKE 'prod-smoke-%')";
  const statements = [
    `DELETE FROM sync_mutation_outcomes WHERE ${smokeAccountWhere};`,
    `DELETE FROM sync_conflicts WHERE ${smokeAccountWhere};`,
    `DELETE FROM sync_changes WHERE ${smokeAccountWhere};`,
    `DELETE FROM migration_conflicts WHERE ${smokeAccountWhere};`,
    `DELETE FROM migration_runs WHERE ${smokeAccountWhere};`,
    `DELETE FROM product_settings WHERE ${smokeAccountWhere};`,
    `DELETE FROM tasks WHERE ${smokeAccountWhere};`,
    `DELETE FROM calendar_events WHERE ${smokeAccountWhere};`,
    `DELETE FROM containers WHERE ${smokeAccountWhere};`,
    `DELETE FROM labels WHERE ${smokeAccountWhere};`,
    `DELETE FROM buckets WHERE ${smokeAccountWhere};`,
    `DELETE FROM plans WHERE ${smokeAccountWhere};`,
    `DELETE FROM account_sessions WHERE ${smokeAccountWhere};`,
    `DELETE FROM user_profiles WHERE ${smokeAccountWhere};`,
    "DELETE FROM accounts WHERE google_sub LIKE 'prod-smoke-%';"
  ];
  for (const statement of statements) d1(statement);
}

function deleteSmokeSnapshot(prod, accountId, runId) {
  if (!prod?.r2_bucket_name || !accountId || !runId) return;
  runWrangler(['r2', 'object', 'delete', `${prod.r2_bucket_name}/${accountId}/${runId}/snapshot.json`], { allowFailure: true });
}

function createSmokeSession() {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const stamp = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const accountId = `acct_smoke_${stamp}`;
  const profileId = `profile_smoke_${stamp}`;
  const sessionId = `sess_smoke_${stamp}`;
  const token = `${sessionId}.${crypto.randomUUID().replace(/-/g, '')}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  d1(
    `INSERT INTO accounts (id, google_sub, email, display_name, picture_url, created_at, updated_at) VALUES (` +
    [accountId, `prod-smoke-${stamp}`, null, 'Prod Smoke Account', null, now, now].map(sqlValue).join(', ') +
    ');'
  );
  d1(
    `INSERT INTO user_profiles (id, account_id, name, created_at, updated_at) VALUES (` +
    [profileId, accountId, 'Prod Smoke Workspace', now, now].map(sqlValue).join(', ') +
    ');'
  );
  d1(
    `INSERT INTO account_sessions (id, account_id, token_hash, created_at, expires_at) VALUES (` +
    [sessionId, accountId, tokenHash, now, expiresAt].map(sqlValue).join(', ') +
    ');'
  );
  return { accountId, token };
}

async function fetchWithPowerShell(url, { method = 'GET', token, body } = {}) {
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    [
      "$ErrorActionPreference='Stop'",
      '$headers = @{}',
      "if ($env:TIMEWHERE_PROD_AUTH) { $headers['Authorization'] = ('Bearer ' + $env:TIMEWHERE_PROD_AUTH) }",
      "$params = @{ Uri = $env:TIMEWHERE_PROD_URL; Method = $env:TIMEWHERE_PROD_METHOD; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 45 }",
      "if ($env:TIMEWHERE_PROD_BODY) { $headers['Content-Type'] = 'application/json'; $params['Body'] = $env:TIMEWHERE_PROD_BODY }",
      '$r = Invoke-WebRequest @params',
      '[pscustomobject]@{ status = [int]$r.StatusCode; content = [string]$r.Content } | ConvertTo-Json -Compress'
    ].join('; ')
  ], {
    cwd: root,
    env: {
      ...process.env,
      TIMEWHERE_PROD_URL: url,
      TIMEWHERE_PROD_METHOD: method,
      TIMEWHERE_PROD_AUTH: token || '',
      TIMEWHERE_PROD_BODY: body ? JSON.stringify(body) : ''
    },
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(sanitize(result.stderr || result.stdout || `PowerShell request failed for ${url}`));
  }
  const payload = JSON.parse(result.stdout);
  return {
    ok: payload.status >= 200 && payload.status < 300,
    status: payload.status,
    text: async () => payload.content
  };
}

async function requestJson(workerUrl, token, method, pathName, body) {
  const url = `${workerUrl}${pathName}`;
  const response = process.platform === 'win32'
    ? await fetchWithPowerShell(url, { method, token, body })
    : await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Keep null for structured failure below.
  }
  assert(response.ok, `${method} ${pathName} returned HTTP ${response.status}: ${sanitize(text).slice(0, 500)}`);
  assert(json?.status === 'ok', `${method} ${pathName} did not return ok envelope.`);
  return json.data;
}

async function main() {
  console.log('WebDev prod core smoke');
  console.log('=========================');

  const auth = runWrangler(['whoami'], { allowFailure: true });
  if (!auth.ok) {
    console.error(`Cloudflare auth is not available. Set ${tokenEnvName} in your shell or run wrangler login, then retry.`);
    process.exit(2);
  }

  requireLocalState();
  const resources = readJson(resourcesPath);
  const deployment = readJson(deploymentStatePath);
  const prod = resources.environments?.prod;
  assert(prod?.timewhere_env === 'prod', 'Local Cloudflare resource state does not contain prod resources.');
  assert(prod.worker_name === 'timewhere-api', 'Prod core smoke refuses to run against a non-prod Worker.');
  assert(prod.pages_project === 'timewhere-web', 'Prod core smoke refuses to run against a non-prod Pages project.');

  const workerUrl = String(deployment.worker_url || '').replace(/\/$/, '');
  assert(workerUrl.includes('timewhere-api'), 'Prod core smoke refuses to run against a non-prod Worker URL.');

  let session = null;
  const migrationRunIds = new Set();
  try {
    cleanupSmokeAccounts();
    session = createSmokeSession();
    console.log('  PASS temporary prod smoke session created');

    const accountStatus = await requestJson(workerUrl, session.token, 'GET', '/account/status');
    assert(accountStatus?.runtime?.environment === 'prod', 'Account status did not report prod environment.');
    assert(accountStatus?.runtime?.gates?.prod_release_enabled === false, 'Prod release gate unexpectedly enabled.');
    console.log('  PASS account status and gate diagnostics');

    const profile = await requestJson(workerUrl, session.token, 'PATCH', '/account/profile', { name: 'Prod Smoke Workspace Updated' });
    assert(profile?.profile?.name === 'Prod Smoke Workspace Updated', 'Workspace profile update did not round-trip.');
    console.log('  PASS account profile update');

    const plan = (await requestJson(workerUrl, session.token, 'POST', '/plans', {
      name: 'Prod Smoke Plan',
      color: '#4f46e5',
      sort_order: 1
    })).plan;
    assert(plan?.id, 'Plan create did not return id.');
    const bucket = (await requestJson(workerUrl, session.token, 'POST', '/buckets', {
      plan_id: plan.id,
      name: 'Prod Smoke Bucket',
      color: '#0f766e',
      sort_order: 1
    })).bucket;
    const label = (await requestJson(workerUrl, session.token, 'POST', '/labels', {
      plan_id: plan.id,
      name: 'Prod Smoke Label',
      color: '#dc2626'
    })).label;
    const container = (await requestJson(workerUrl, session.token, 'POST', '/containers', {
      name: 'Prod Smoke Container',
      time_start: '09:00',
      time_end: '10:00',
      repeat: 'daily',
      days: [],
      enabled: true
    })).container;
    assert(bucket?.id && label?.id && container?.id, 'Structure create did not return all ids.');
    console.log('  PASS structure CRUD create path');

    const task = (await requestJson(workerUrl, session.token, 'POST', '/tasks', {
      plan_id: plan.id,
      bucket_id: bucket.id,
      title: 'Prod Smoke Task',
      notes: 'Prod smoke note',
      due_date: '2026-07-12',
      schedule_time: '09:30',
      duration: 25,
      priority: 'important',
      labels: [label.id]
    })).task;
    assert(task?.id && task.title === 'Prod Smoke Task', 'Task create did not round-trip.');
    const updatedTask = (await requestJson(workerUrl, session.token, 'PATCH', `/tasks/${encodeURIComponent(task.id)}`, {
      progress: 'in_progress',
      notes: 'Prod smoke note updated'
    })).task;
    assert(updatedTask?.progress === 'in_progress', 'Task update did not round-trip progress.');
    const taskList = await requestJson(workerUrl, session.token, 'GET', '/tasks?search=Prod%20Smoke%20Task');
    assert(Array.isArray(taskList?.tasks) && taskList.tasks.some(item => item.id === task.id), 'Task list did not include created task.');
    console.log('  PASS Task API create/update/list');

    const event = (await requestJson(workerUrl, session.token, 'POST', '/calendar/events', {
      container_id: container.id,
      title: 'Prod Smoke Event',
      date: '2026-07-12',
      time_start: '09:00',
      time_end: '09:30',
      payload: { repeat: 'none' }
    })).event;
    assert(event?.id && event.title === 'Prod Smoke Event', 'Calendar event create did not round-trip.');
    const updatedEvent = (await requestJson(workerUrl, session.token, 'PATCH', `/calendar/events/${encodeURIComponent(event.id)}`, {
      title: 'Prod Smoke Event Updated'
    })).event;
    assert(updatedEvent?.title === 'Prod Smoke Event Updated', 'Calendar event update did not round-trip.');
    const eventList = await requestJson(workerUrl, session.token, 'GET', '/calendar/events?date_from=2026-07-12&date_to=2026-07-12');
    assert(Array.isArray(eventList?.events) && eventList.events.some(item => item.id === event.id), 'Calendar event list did not include created event.');
    console.log('  PASS Calendar API create/update/list');

    const settings = (await requestJson(workerUrl, session.token, 'PUT', '/settings', {
      default_duration: 30,
      default_priority: 'important',
      enable_notifications: false
    })).settings;
    assert(settings?.default_duration === 30, 'Settings update did not round-trip default_duration.');
    console.log('  PASS Settings API update');

    const bootstrap = await requestJson(workerUrl, session.token, 'GET', '/sync/bootstrap');
    assert(bootstrap?.entities?.tasks?.some(item => item.id === task.id), 'Sync bootstrap did not include created task.');
    assert(Number.isFinite(Number(bootstrap?.cursor)), 'Sync bootstrap did not return a numeric cursor.');
    const changes = await requestJson(workerUrl, session.token, 'GET', '/sync/changes?cursor=0');
    assert(Array.isArray(changes?.changes) && changes.changes.length > 0, 'Sync changes did not include prod smoke changes.');
    console.log('  PASS Sync bootstrap and changes cursor');

    const migrationSnapshot = {
      schema_version: 1,
      device_id: 'prod-smoke-device',
      data: {
        plans: [{
          id: 'prod-smoke-plan-legacy',
          name: 'Prod Smoke Migrated Plan',
          updated_at: '2026-01-01T00:00:00.000Z'
        }],
        tasks: [{
          id: 'prod-smoke-task-legacy',
          plan_id: 'prod-smoke-plan-legacy',
          title: 'Prod Smoke Migrated Task',
          due_date: '2026-07-13',
          duration: 20,
          updated_at: '2026-01-01T00:00:00.000Z'
        }],
        containers: [{
          id: 'prod-smoke-container-legacy',
          name: 'Prod Smoke Migrated Container',
          time_start: '13:00',
          time_end: '14:00',
          repeat: 'daily',
          updated_at: '2026-01-01T00:00:00.000Z'
        }],
        events: [{
          id: 'prod-smoke-event-legacy',
          title: 'Prod Smoke Migrated Event',
          container_id: 'prod-smoke-container-legacy',
          date: '2026-07-13',
          time_start: '13:00',
          time_end: '13:30',
          updated_at: '2026-01-01T00:00:00.000Z'
        }],
        settings: {
          default_duration: 20
        }
      }
    };
    const migration = (await requestJson(workerUrl, session.token, 'POST', '/migration/runs', {
      source_runtime: 'prod-core-smoke',
      snapshot: migrationSnapshot
    })).migration;
    migrationRunIds.add(migration.run_id);
    assert(migration?.status === 'completed', 'Migration smoke import did not complete.');
    assert(migration?.counts?.tasks === 1 && migration?.counts?.plans === 1, 'Migration smoke import counts did not match.');
    const migrationRetry = (await requestJson(workerUrl, session.token, 'POST', '/migration/runs', {
      source_runtime: 'prod-core-smoke',
      snapshot: migrationSnapshot
    })).migration;
    migrationRunIds.add(migrationRetry.run_id);
    assert(migrationRetry?.run_id === migration.run_id, 'Migration smoke retry was not idempotent by snapshot hash.');

    const conflictSeed = (await requestJson(workerUrl, session.token, 'POST', '/tasks', {
      legacy_id: 'prod-smoke-conflict-task',
      title: 'Prod Smoke Cloud Conflict Task',
      due_date: '2026-07-14'
    })).task;
    assert(conflictSeed?.id, 'Migration conflict seed task did not create.');
    const conflictSnapshot = {
      schema_version: 1,
      device_id: 'prod-smoke-device-conflict',
      data: {
        tasks: [{
          id: 'prod-smoke-conflict-task',
          title: 'Prod Smoke Local Conflict Task',
          due_date: '2026-07-15',
          updated_at: '2026-01-01T00:00:00.000Z'
        }]
      }
    };
    const conflictMigration = (await requestJson(workerUrl, session.token, 'POST', '/migration/runs', {
      source_runtime: 'prod-core-smoke-conflict',
      snapshot: conflictSnapshot
    })).migration;
    migrationRunIds.add(conflictMigration.run_id);
    assert(conflictMigration?.status === 'conflict' && conflictMigration?.counts?.conflicts === 1, 'Migration conflict smoke did not create one conflict.');
    const migrationConflicts = await requestJson(workerUrl, session.token, 'GET', '/migration/conflicts?status=open');
    const migrationConflict = migrationConflicts?.conflicts?.find(conflict => conflict.migration_run_id === conflictMigration.run_id);
    assert(migrationConflict?.id, 'Migration conflict list did not include prod smoke conflict.');
    const resolvedMigrationConflict = (await requestJson(workerUrl, session.token, 'PATCH', `/migration/conflicts/${encodeURIComponent(migrationConflict.id)}`, {
      resolution: 'use_cloud'
    })).conflict;
    assert(resolvedMigrationConflict?.status === 'use_cloud', 'Migration conflict did not resolve with use_cloud.');
    console.log('  PASS Migration API import, idempotent retry, conflict, and resolution');

    await requestJson(workerUrl, session.token, 'DELETE', `/tasks/${encodeURIComponent(task.id)}`);
    await requestJson(workerUrl, session.token, 'DELETE', `/calendar/events/${encodeURIComponent(event.id)}`);
    await requestJson(workerUrl, session.token, 'DELETE', `/containers/${encodeURIComponent(container.id)}`);
    await requestJson(workerUrl, session.token, 'DELETE', `/labels/${encodeURIComponent(label.id)}`);
    await requestJson(workerUrl, session.token, 'DELETE', `/buckets/${encodeURIComponent(bucket.id)}`);
    await requestJson(workerUrl, session.token, 'DELETE', `/plans/${encodeURIComponent(plan.id)}`);
    console.log('  PASS core smoke entities deleted through API');
  } finally {
    if (session?.accountId) {
      for (const runId of migrationRunIds) {
        deleteSmokeSnapshot(prod, session.accountId, runId);
      }
    }
    cleanupSmokeAccounts();
  }

  console.log('=========================');
  console.log('All WebDev prod core smoke checks passed.');
  console.log('Prod internal verification used only temporary prod-smoke data; no Google session, token, account email, or Cloudflare id was printed.');
}

main().catch(error => {
  console.error(sanitize(error?.stack || error?.message || error));
  process.exit(1);
});
