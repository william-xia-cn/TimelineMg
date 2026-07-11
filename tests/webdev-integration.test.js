const assert = require('assert');
const { execFileSync, spawn } = require('child_process');
const net = require('net');
const path = require('path');
const { pathToFileURL } = require('url');

const rootDir = path.resolve(__dirname, '..');
const workersDir = path.join(rootDir, 'workers');
const localSession = process.env.TIMEWHERE_LOCAL_SESSION_BEARER || 'timewhere-local-dev-session';

function command(name) {
  return name;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function runPrepare(persistTo) {
  execFileSync(command('npm'), ['run', 'webdev:local:prepare'], {
    cwd: rootDir,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TIMEWHERE_WRANGLER_PERSIST_TO: persistTo }
  });
}

function startWorker(port, persistTo) {
  const child = spawn(command('npx'), [
    'wrangler',
    'dev',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--local',
    '--local-protocol',
    'http',
    '--persist-to',
    persistTo,
    '--show-interactive-dev-session=false',
    '--log-level',
    'error'
  ], {
    cwd: workersDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' }
  });
  const logs = [];
  child.stdout.on('data', chunk => logs.push(String(chunk)));
  child.stderr.on('data', chunk => logs.push(String(chunk)));
  child.logs = logs;
  return child;
}

async function stopWorker(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      return;
    } catch {
      // Fall through to normal kill.
    }
  }
  child.kill('SIGTERM');
}

async function waitForHealth(baseUrl, child) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < 60000) {
    if (child.exitCode !== null) {
      throw new Error(`Worker exited early (${child.exitCode}). Logs:\n${child.logs.join('').slice(-4000)}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Worker health. Last error: ${lastError?.message || 'unknown'}\n${child.logs.join('').slice(-4000)}`);
}

async function request(baseUrl, method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${localSession}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status === 'error') {
    const detail = payload?.error ? `${payload.error.code}: ${payload.error.message}` : `HTTP ${response.status}`;
    throw new Error(`${method} ${pathname} failed: ${detail}`);
  }
  return payload.data;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  console.log('WebDev local integration test');
  console.log('================================');
  const persistTo = `.wrangler/integration-state-${process.pid}-${Date.now()}`;
  runPrepare(persistTo);
  console.log('  PASS local D1 migrated and seeded');

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const worker = startWorker(port, persistTo);
  try {
    await waitForHealth(baseUrl, worker);
    console.log('  PASS local Worker started');

    const account = await request(baseUrl, 'GET', '/account/me');
    assert.equal(account.account.id, 'acct_local_dev');
    console.log('  PASS seeded mock session can read account');

    const date = todayKey();
    const createdTask = await request(baseUrl, 'POST', '/tasks', {
      title: `Integration Task ${Date.now()}`,
      legacy_id: `legacy-it-task-${Date.now()}`,
      due_date: date,
      schedule_time: '20:00',
      duration: 30,
      priority: 'important',
      checklist: [{ text: 'Created by integration test', done: false }],
      labels: ['integration']
    });
    assert.equal(createdTask.task.schedule_time, '20:00');
    console.log('  PASS created task through Worker API');

    const updatedTask = await request(baseUrl, 'PATCH', `/tasks/${encodeURIComponent(createdTask.task.id)}`, {
      notes: 'Updated by local integration test.',
      duration: 50,
      checklist: [{ text: 'Updated detail', done: true }],
      labels: ['integration', 'updated']
    });
    assert.equal(updatedTask.task.duration, 50);
    assert.equal(updatedTask.task.checklist[0].done, true);
    console.log('  PASS updated task detail through Worker API');

    const createdEvent = await request(baseUrl, 'POST', '/calendar/events', {
      title: 'Integration Planning Block',
      date,
      time_start: '18:30',
      time_end: '19:00',
      source: 'integration-test'
    });
    assert.equal(createdEvent.event.date, date);
    console.log('  PASS created calendar event through Worker API');

    const tasks = await request(baseUrl, 'GET', `/tasks?include_completed=true&search=${encodeURIComponent('Integration Task')}`);
    const events = await request(baseUrl, 'GET', `/calendar/events?date_from=${date}&date_to=${date}`);
    const containers = await request(baseUrl, 'GET', '/containers');
    const { computeCalendarDateProjection } = await import(pathToFileURL(path.join(rootDir, 'pages/src/domain/calendarDateProjection.js')).href);
    const { buildLegacyIndexedDbSnapshot } = await import(pathToFileURL(path.join(rootDir, 'pages/src/migration/legacyIndexedDbSnapshotAdapter.js')).href);
    const projection = computeCalendarDateProjection({
      date,
      tasks: tasks.tasks,
      events: events.events,
      containers: containers.containers
    });
    assert(projection.tasks.some(task => task.id === createdTask.task.id));
    assert(projection.events.some(event => event.id === createdEvent.event.id));
    assert(projection.timedItems.length >= 2);
    console.log('  PASS read calendar projection from Worker data');

    const legacyId = `legacy-conflict-${Date.now()}`;
    const cloudTask = await request(baseUrl, 'POST', '/tasks', {
      title: 'Cloud conflict baseline',
      legacy_id: legacyId,
      due_date: date,
      priority: 'medium'
    });
    const snapshot = await buildLegacyIndexedDbSnapshot({
      tasks: [{
        id: legacyId,
        title: 'Local conflict winner',
        due_date: date,
        priority: 'urgent',
        updated_at: '2000-01-01T00:00:00.000Z'
      }],
      settings: { integration_conflict_seed: true }
    }, {
      deviceId: `integration-device-${Date.now()}`,
      exportedAt: '2026-07-11T00:00:00.000Z'
    });
    const migration = await request(baseUrl, 'POST', '/migration/runs', {
      source_runtime: 'integration-test',
      snapshot
    });
    assert.equal(migration.migration.status, 'conflict');
    assert.equal(migration.migration.counts.conflicts, 1);
    console.log('  PASS created migration conflict from changed cloud record');

    const repeatedMigration = await request(baseUrl, 'POST', '/migration/runs', {
      source_runtime: 'integration-test',
      snapshot
    });
    assert.equal(repeatedMigration.migration.run_id, migration.migration.run_id);
    assert.equal(repeatedMigration.migration.counts.conflicts, 1);
    const cloudStillWins = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(cloudTask.task.id)}`);
    assert.equal(cloudStillWins.task.title, 'Cloud conflict baseline');
    console.log('  PASS repeated migration is idempotent and does not silently overwrite cloud data');

    const conflicts = await request(baseUrl, 'GET', '/migration/conflicts?status=open');
    const conflict = conflicts.conflicts.find(item => item.entity_id === legacyId);
    assert(conflict, `Expected conflict for ${legacyId}`);
    const resolved = await request(baseUrl, 'PATCH', `/migration/conflicts/${encodeURIComponent(conflict.id)}`, {
      resolution: 'use_local'
    });
    assert.equal(resolved.conflict.status, 'use_local');
    assert.equal(resolved.conflict.applied_local, true);
    const taskAfterResolve = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(cloudTask.task.id)}`);
    assert.equal(taskAfterResolve.task.title, 'Local conflict winner');
    console.log('  PASS resolved migration conflict with local data');

    console.log('================================');
    console.log('All WebDev local integration checks passed.');
  } finally {
    await stopWorker(worker);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
