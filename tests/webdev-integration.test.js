const assert = require('assert');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
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

function runWorkerSql(persistTo, sql) {
  const tmpDir = path.join(workersDir, '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `integration-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(file, sql);
  try {
    execFileSync(command('node'), ['scripts/run-local-d1-file.mjs', file], {
      cwd: workersDir,
      stdio: 'pipe',
      shell: process.platform === 'win32',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TIMEWHERE_WRANGLER_PERSIST_TO: persistTo }
    });
  } finally {
    fs.rmSync(file, { force: true });
  }
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

async function requestRaw(baseUrl, method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${localSession}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
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

    const taskChanges = await request(baseUrl, 'GET', '/sync/changes?cursor=0&limit=20');
    assert(taskChanges.changes.some(change => change.entity_type === 'task' && change.entity_id === createdTask.task.id && change.operation === 'created'));
    assert(taskChanges.changes.some(change => change.entity_type === 'task' && change.entity_id === createdTask.task.id && change.operation === 'updated' && change.entity_revision === updatedTask.task.revision));
    assert(Number(taskChanges.next_cursor) > 0);
    console.log('  PASS sync change feed exposes task create and update cursors');

    const createdEvent = await request(baseUrl, 'POST', '/calendar/events', {
      title: 'Integration Planning Block',
      date,
      time_start: '18:30',
      time_end: '19:00',
      source: 'integration-test'
    });
    assert.equal(createdEvent.event.date, date);
    console.log('  PASS created calendar event through Worker API');

    const eventChanges = await request(baseUrl, 'GET', `/sync/changes?cursor=${encodeURIComponent(taskChanges.next_cursor)}&limit=20`);
    assert(eventChanges.changes.some(change => change.entity_type === 'calendar_event' && change.entity_id === createdEvent.event.id && change.operation === 'created'));
    assert(Number(eventChanges.next_cursor) > Number(taskChanges.next_cursor));
    console.log('  PASS sync change feed advances cursor for later entity changes');

    const replayMutationId = `mut-integration-${Date.now()}`;
    const replayBody = {
      mutations: [{
        mutation_id: replayMutationId,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_revision: updatedTask.task.revision,
        base_values: { title: createdTask.task.title },
        patch: { title: 'Offline replay must not apply' }
      }]
    };
    const replayAttempt = await request(baseUrl, 'POST', '/sync/mutations', replayBody);
    assert.equal(replayAttempt.replay.accepted, false);
    assert.equal(replayAttempt.replay.replay_status, 'disabled_v1');
    assert.equal(replayAttempt.replay.activation_gate, 'task_only_replay_defined_but_disabled_v1');
    assert.equal(replayAttempt.replay.transaction_skeleton, 'internal_disabled_v1');
    assert.equal(replayAttempt.outcome_persistence.mode, 'disabled_v1_metadata_only');
    assert.equal(replayAttempt.outcome_persistence.recorded_count, 1);
    assert.equal(replayAttempt.replay.results[0].reason, 'offline_replay_disabled_v1');
    assert.equal(replayAttempt.replay.results[0].task_replay_gate.status, 'task_replay_gate_ready_but_disabled');
    assert.equal(replayAttempt.replay.results[0].task_replay_gate.field_conflict_check.status, 'cloud_values_required');
    assert.equal(replayAttempt.replay.results[0].transaction_skeleton.branch, 'requires_cloud_values');
    assert.equal(replayAttempt.replay.results[0].transaction_skeleton.writes_enabled, false);
    assert.equal(replayAttempt.replay.results[0].transaction_skeleton.applies_user_data, false);
    const storedReplayOutcome = await request(baseUrl, 'GET', `/sync/mutations/${encodeURIComponent(replayMutationId)}`);
    assert.equal(storedReplayOutcome.outcome.mutation_id, replayMutationId);
    assert.equal(storedReplayOutcome.outcome.outcome_status, 'rejected');
    assert.equal(storedReplayOutcome.outcome.reason, 'offline_replay_disabled_v1');
    assert.equal(storedReplayOutcome.outcome.task_replay_gate.status, 'task_replay_gate_ready_but_disabled');
    assert.equal(Object.prototype.hasOwnProperty.call(storedReplayOutcome.outcome, 'transaction_skeleton'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(storedReplayOutcome.outcome, 'patch'), false);
    const repeatedReplayAttempt = await request(baseUrl, 'POST', '/sync/mutations', replayBody);
    assert.equal(repeatedReplayAttempt.outcome_persistence.recorded_count, 1);
    const repeatedReplayOutcome = await request(baseUrl, 'GET', `/sync/mutations/${encodeURIComponent(replayMutationId)}`);
    assert.equal(repeatedReplayOutcome.outcome.attempt_count, 2);
    const taskAfterReplayAttempt = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(createdTask.task.id)}`);
    assert.notEqual(taskAfterReplayAttempt.task.title, 'Offline replay must not apply');
    const changesAfterReplayAttempt = await request(baseUrl, 'GET', `/sync/changes?cursor=${encodeURIComponent(eventChanges.next_cursor)}&limit=20`);
    assert.equal(changesAfterReplayAttempt.changes.length, 0);
    console.log('  PASS disabled mutation replay records outcome metadata without applying changes');

    const privatePatch = {};
    privatePatch['refresh' + '_token'] = 'do-not-store';
    const privateMutationId = `mut-private-${Date.now()}`;
    const privateReplayAttempt = await requestRaw(baseUrl, 'POST', '/sync/mutations', {
      mutations: [{
        mutation_id: privateMutationId,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        patch: privatePatch
      }]
    });
    assert.equal(privateReplayAttempt.response.status, 400);
    assert.equal(privateReplayAttempt.payload.error.code, 'offline_mutation_private_data');
    const missingPrivateOutcome = await requestRaw(baseUrl, 'GET', `/sync/mutations/${encodeURIComponent(privateMutationId)}`);
    assert.equal(missingPrivateOutcome.response.status, 404);
    assert.equal(missingPrivateOutcome.payload.error.code, 'sync_mutation_outcome_not_found');
    console.log('  PASS mutation replay contract rejects private fields');

    const nonConflictingReplayPreview = await request(baseUrl, 'POST', '/sync/mutations', {
      mutations: [{
        mutation_id: `mut-preview-merge-${Date.now()}`,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { title: 'Base title', notes: 'Old notes' },
        cloud_values: { title: 'Cloud title changed elsewhere', notes: 'Old notes' },
        patch: { notes: 'Offline note update' }
      }]
    });
    assert.equal(nonConflictingReplayPreview.replay.results[0].task_replay_gate.field_conflict_check.status, 'would_auto_merge');
    assert.equal(nonConflictingReplayPreview.replay.results[0].transaction_skeleton.branch, 'apply_candidate');
    assert(nonConflictingReplayPreview.replay.results[0].transaction_skeleton.d1_transaction_steps.includes('apply_task_patch'));
    assert.equal(nonConflictingReplayPreview.replay.results[0].transaction_skeleton.writes_enabled, false);
    console.log('  PASS task replay gate previews disjoint field auto-merge while disabled');

    const conflictingReplayPreview = await request(baseUrl, 'POST', '/sync/mutations', {
      mutations: [{
        mutation_id: `mut-preview-conflict-${Date.now()}`,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { notes: 'Old notes' },
        cloud_values: { notes: 'Cloud note changed elsewhere' },
        patch: { notes: 'Offline note update' }
      }]
    });
    assert.equal(conflictingReplayPreview.replay.results[0].task_replay_gate.field_conflict_check.status, 'would_conflict');
    assert.deepEqual(conflictingReplayPreview.replay.results[0].task_replay_gate.field_conflict_check.conflicting_fields, ['notes']);
    assert.equal(conflictingReplayPreview.replay.results[0].transaction_skeleton.branch, 'conflict_candidate');
    assert(conflictingReplayPreview.replay.results[0].transaction_skeleton.d1_transaction_steps.includes('create_sync_conflict_record'));
    assert.equal(conflictingReplayPreview.replay.results[0].transaction_skeleton.writes_enabled, false);
    console.log('  PASS task replay gate previews same-field conflict while disabled');

    const manageBacSourceReplayPreview = await request(baseUrl, 'POST', '/sync/mutations', {
      mutations: [{
        mutation_id: `mut-preview-mb-source-${Date.now()}`,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { source_type: 'managebac', title: 'Source title', notes: 'Local notes' },
        cloud_values: { source_type: 'managebac', title: 'Source title', notes: 'Local notes' },
        patch: { title: 'Offline title override' }
      }]
    });
    assert.equal(manageBacSourceReplayPreview.replay.results[0].reason, 'task_fields_not_allowed');
    assert.equal(manageBacSourceReplayPreview.replay.results[0].task_replay_gate.status, 'blocked_by_task_replay_gate');
    assert.deepEqual(manageBacSourceReplayPreview.replay.results[0].task_replay_gate.source_controlled_fields, ['title']);
    assert.equal(manageBacSourceReplayPreview.replay.results[0].transaction_skeleton.branch, 'reject_candidate');
    console.log('  PASS task replay gate blocks ManageBac source facts while disabled');

    const nonTaskReplayPreview = await request(baseUrl, 'POST', '/sync/mutations', {
      mutations: [{
        mutation_id: `mut-preview-container-${Date.now()}`,
        entity_type: 'container',
        entity_id: 'container-example',
        operation: 'update',
        base_values: { name: 'Base' },
        cloud_values: { name: 'Base' },
        patch: { name: 'Offline container update' }
      }]
    });
    assert.equal(nonTaskReplayPreview.replay.results[0].reason, 'entity_replay_not_in_task_gate');
    assert.equal(nonTaskReplayPreview.replay.results[0].task_replay_gate.status, 'not_in_task_only_gate');
    assert.equal(nonTaskReplayPreview.replay.results[0].transaction_skeleton.branch, 'not_in_task_gate');
    console.log('  PASS replay activation gate is task-only while disabled');

    const syncStatus = await request(baseUrl, 'GET', '/sync/status');
    assert.equal(syncStatus.task_replay_gate, 'defined_disabled_v1');
    assert.equal(syncStatus.task_replay_transaction, 'internal_disabled_v1');
    assert.equal(syncStatus.mutation_dry_run, 'internal_disabled_v1');
    assert.equal(syncStatus.mutation_outcomes, 'metadata_only_disabled_v1');
    assert.equal(syncStatus.conflict_records, 'scaffolded');
    assert.equal(syncStatus.replay_safety_gate.mode, 'phase4_replay_safety_gate_v1');
    assert.equal(syncStatus.replay_safety_gate.kill_switch_active, true);
    assert.equal(syncStatus.replay_safety_gate.writes_enabled, false);
    assert.equal(syncStatus.replay_safety_gate.can_run_replay, false);
    const replaySafety = await request(baseUrl, 'GET', '/sync/replay-safety');
    assert.equal(replaySafety.safety.prod_replay_allowed, false);
    assert.equal(replaySafety.safety.applies_user_data, false);
    assert(replaySafety.safety.blockers.includes('task_replay_kill_switch_active'));
    console.log('  PASS replay safety gate keeps local/dev and prod replay writes disabled by default');
    const mutationOutcomes = await request(baseUrl, 'GET', '/sync/mutations?status=rejected&limit=20');
    assert(mutationOutcomes.outcomes.some(outcome => outcome.mutation_id === replayMutationId));
    assert(mutationOutcomes.outcomes.every(outcome => outcome.outcome_status === 'rejected'));
    console.log('  PASS mutation outcome diagnostics can be listed by status');

    const dryRun = await request(baseUrl, 'POST', '/sync/mutations/dry-run', replayBody);
    assert.equal(dryRun.mode, 'internal_disabled_v1');
    assert.equal(dryRun.writes_enabled, false);
    assert.equal(dryRun.applies_user_data, false);
    assert.equal(dryRun.summary.stored_outcome_count, 1);
    assert.equal(dryRun.summary.stored_conflict_count, 0);
    assert.equal(dryRun.replay.results[0].stored_outcome.mutation_id, replayMutationId);
    assert.equal(dryRun.replay.results[0].stored_conflict, null);
    assert.equal(dryRun.replay.results[0].dry_run.would_apply, false);
    assert.equal(Object.prototype.hasOwnProperty.call(dryRun, 'outcome_persistence'), false);
    console.log('  PASS internal mutation dry-run joins outcomes without applying writes');

    const dryRunApplyMutationId = `mut-dry-run-apply-${Date.now()}`;
    const dryRunApply = await request(baseUrl, 'POST', '/sync/mutations/dry-run', {
      mutations: [{
        mutation_id: dryRunApplyMutationId,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { notes: 'Base apply note', priority: 'medium' },
        cloud_values: { notes: 'Base apply note', priority: 'medium' },
        patch: { notes: 'Local apply note', priority: 'urgent' }
      }]
    });
    assert.equal(dryRunApply.summary.apply_candidate_count, 1);
    assert.equal(dryRunApply.summary.apply_plan_preview_count, 1);
    assert.equal(dryRunApply.replay.results[0].dry_run.would_apply, true);
    assert.equal(dryRunApply.replay.results[0].apply_plan.would_persist, false);
    assert.deepEqual(dryRunApply.replay.results[0].apply_plan.patch_fields, ['notes', 'priority']);
    assert.deepEqual(dryRunApply.replay.results[0].apply_plan.patch, { notes: 'Local apply note', priority: 'urgent' });
    assert(dryRunApply.replay.results[0].apply_plan.d1_transaction_steps.includes('apply_task_patch'));
    const unchangedAfterApplyDryRun = await request(baseUrl, 'GET', `/tasks?include_completed=true&search=${encodeURIComponent(createdTask.task.title)}`);
    const unchangedTask = unchangedAfterApplyDryRun.tasks.find(task => task.id === createdTask.task.id);
    assert.notEqual(unchangedTask.notes, 'Local apply note');
    assert.notEqual(unchangedTask.priority, 'urgent');
    console.log('  PASS internal mutation dry-run previews apply plan without applying writes');

    const readinessSummary = await request(baseUrl, 'POST', '/sync/mutations/readiness-summary', {
      mutations: [{
        mutation_id: `mut-readiness-${Date.now()}`,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { notes: 'Base readiness note', priority: 'medium' },
        cloud_values: { notes: 'Base readiness note', priority: 'medium' },
        patch: { notes: 'Local readiness note' }
      }, {
        mutation_id: `mut-readiness-conflict-${Date.now()}`,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { notes: 'Base readiness conflict note' },
        cloud_values: { notes: 'Cloud readiness conflict note' },
        patch: { notes: 'Local readiness conflict note' }
      }]
    });
    assert.equal(readinessSummary.replay_enablement, 'not_approved');
    assert.equal(readinessSummary.writes_enabled, false);
    assert.equal(readinessSummary.applies_user_data, false);
    assert.equal(readinessSummary.readiness.can_enable_replay, false);
    assert.equal(readinessSummary.readiness.candidate_counts.apply, 1);
    assert.equal(readinessSummary.readiness.candidate_counts.conflict, 1);
    assert.equal(readinessSummary.readiness.preview_counts.apply_plan, 1);
    assert.equal(readinessSummary.readiness.preview_counts.conflict_record, 1);
    assert(readinessSummary.readiness.blocked_reasons.some(reason => reason.reason === 'offline_replay_disabled_v1'));
    assert.equal(readinessSummary.readiness.preview_hardening.mode, 'phase9_preview_readiness_hardening_v1');
    assert.equal(readinessSummary.readiness.preview_hardening.writes_enabled, false);
    assert.equal(readinessSummary.readiness.preview_hardening.applies_user_data, false);
    assert(readinessSummary.readiness.preview_hardening.approval_blockers.includes('product_owner_replay_enablement_approval_required'));
    assert(readinessSummary.readiness.preview_hardening.required_evidence.includes('npm_test'));
    assert.equal(readinessSummary.readiness.sample_results.length, 2);
    const unchangedAfterReadiness = await request(baseUrl, 'GET', `/tasks?include_completed=true&search=${encodeURIComponent(createdTask.task.title)}`);
    const readinessUnchangedTask = unchangedAfterReadiness.tasks.find(task => task.id === createdTask.task.id);
    assert.notEqual(readinessUnchangedTask.notes, 'Local readiness note');
    console.log('  PASS replay readiness summary aggregates dry-run counts without applying writes');

    const dependencyLabelId = `dep-label-${Date.now()}`;
    const dependencyBucketId = `dep-bucket-${Date.now()}`;
    const dependencySummary = await request(baseUrl, 'POST', '/sync/mutations/readiness-summary', {
      mutations: [{
        mutation_id: `mut-dep-label-create-${Date.now()}`,
        entity_type: 'label',
        entity_id: dependencyLabelId,
        operation: 'create',
        patch: { name: 'Dependency Label' }
      }, {
        mutation_id: `mut-dep-task-label-${Date.now()}`,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { labels: [] },
        cloud_values: { labels: [] },
        patch: { labels: [dependencyLabelId] }
      }, {
        mutation_id: `mut-dep-task-bucket-${Date.now()}`,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { bucket_id: null },
        cloud_values: { bucket_id: null },
        patch: { bucket_id: dependencyBucketId }
      }, {
        mutation_id: `mut-dep-bucket-create-${Date.now()}`,
        entity_type: 'bucket',
        entity_id: dependencyBucketId,
        operation: 'create',
        patch: { name: 'Late Bucket' }
      }]
    });
    const dependencyAnalysis = dependencySummary.readiness.dependency_analysis;
    assert.equal(dependencyAnalysis.mode, 'phase7_dependency_analysis_v1');
    assert.equal(dependencyAnalysis.writes_enabled, false);
    assert.equal(dependencyAnalysis.applies_user_data, false);
    assert(dependencyAnalysis.summary.blocked_count >= 1);
    const labelTaskRow = dependencyAnalysis.rows.find(row => row.mutation_id.startsWith('mut-dep-task-label-'));
    const labelDependency = labelTaskRow.dependencies.find(dependency => dependency.field === 'labels');
    assert.equal(labelDependency.status, 'satisfied');
    assert.equal(labelDependency.reason, 'same_batch_create');
    const bucketTaskRow = dependencyAnalysis.rows.find(row => row.mutation_id.startsWith('mut-dep-task-bucket-'));
    const bucketDependency = bucketTaskRow.dependencies.find(dependency => dependency.field === 'bucket_id');
    assert.equal(bucketDependency.status, 'blocked');
    assert.equal(bucketDependency.reason, 'same_batch_create_after_reference');
    assert(dependencySummary.readiness.preview_hardening.evidence_gaps.includes('dependency_ordering_blockers'));
    assert.equal(dependencySummary.readiness.preview_hardening.dependency_summary.blocked_count, dependencyAnalysis.summary.blocked_count);
    const unchangedAfterDependencyAnalysis = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(createdTask.task.id)}`);
    assert.notDeepEqual(unchangedAfterDependencyAnalysis.task.labels, [dependencyLabelId]);
    assert.notEqual(unchangedAfterDependencyAnalysis.task.bucket_id, dependencyBucketId);
    console.log('  PASS replay readiness dependency analysis stays read-only and detects ordering blockers');

    const enablementSimulation = await request(baseUrl, 'POST', '/sync/mutations/enablement-simulation', {
      policy: {
        task_only_scope_locked: true,
        managebac_source_fields_blocked: true,
        same_field_conflicts_create_records: true,
        delete_update_conflicts_blocked: true,
        rejected_mutations_stop_retrying: true,
        private_data_excluded_from_conflicts: true,
        offline_write_mode: 'queued_pending',
        cloud_success_after_worker_confirm: true,
        pending_edits_visible: true,
        failed_replay_has_user_path: true
      },
      evidence: { required_tests: ['npm run webdev:verify', 'npm test', 'sensitive scan'] },
      mutations: [{
        mutation_id: 'mut-enable-sim-' + Date.now(),
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { notes: 'Base simulation note', priority: 'medium' },
        cloud_values: { notes: 'Base simulation note', priority: 'medium' },
        patch: { notes: 'Local simulation note' }
      }, {
        mutation_id: 'mut-enable-sim-conflict-' + Date.now(),
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { notes: 'Base simulation conflict note' },
        cloud_values: { notes: 'Cloud simulation conflict note' },
        patch: { notes: 'Local simulation conflict note' }
      }]
    });
    assert.equal(enablementSimulation.replay_enablement, 'simulation_only');
    assert.equal(enablementSimulation.writes_enabled, false);
    assert.equal(enablementSimulation.applies_user_data, false);
    assert.equal(enablementSimulation.can_enable_replay, false);
    assert.equal(enablementSimulation.simulated_gate_pass, true);
    assert(enablementSimulation.gates.every(gate => gate.passed === true));
    assert.equal(enablementSimulation.readiness_summary.readiness.candidate_counts.apply, 1);
    assert.equal(enablementSimulation.readiness_summary.readiness.candidate_counts.conflict, 1);
    const unchangedAfterSimulation = await request(baseUrl, 'GET', '/tasks?include_completed=true&search=' + encodeURIComponent(createdTask.task.title));
    const simulationUnchangedTask = unchangedAfterSimulation.tasks.find(task => task.id === createdTask.task.id);
    assert.notEqual(simulationUnchangedTask.notes, 'Local simulation note');
    console.log('  PASS replay enablement simulation evaluates gates without applying writes');

    const dryRunConflictMutationId = `mut-dry-run-conflict-${Date.now()}`;
    const dryRunConflict = await request(baseUrl, 'POST', '/sync/mutations/dry-run', {
      mutations: [{
        mutation_id: dryRunConflictMutationId,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { notes: 'Base note', priority: 'medium' },
        cloud_values: { notes: 'Cloud changed note', priority: 'medium' },
        patch: { notes: 'Local changed note' }
      }]
    });
    assert.equal(dryRunConflict.summary.conflict_candidate_count, 1);
    assert.equal(dryRunConflict.summary.conflict_preview_count, 1);
    assert.equal(dryRunConflict.summary.stored_conflict_count, 0);
    assert.equal(dryRunConflict.replay.results[0].dry_run.would_create_conflict, true);
    assert.equal(dryRunConflict.replay.results[0].conflict_preview.would_persist, false);
    assert.equal(dryRunConflict.replay.results[0].conflict_preview.record.mutation_id, dryRunConflictMutationId);
    assert.equal(dryRunConflict.replay.results[0].conflict_preview.record.reason, 'field_conflict');
    assert.deepEqual(dryRunConflict.replay.results[0].conflict_preview.record.local, { notes: 'Local changed note' });
    assert.deepEqual(dryRunConflict.replay.results[0].conflict_preview.record.cloud, { notes: 'Cloud changed note' });
    const missingDryRunConflict = await requestRaw(baseUrl, 'GET', `/sync/conflicts/${encodeURIComponent(dryRunConflictMutationId)}`);
    assert.equal(missingDryRunConflict.response.status, 404);
    assert.equal(missingDryRunConflict.payload.error.code, 'sync_conflict_not_found');
    console.log('  PASS internal mutation dry-run previews conflict record shape without persisting it');

    const syncConflicts = await request(baseUrl, 'GET', '/sync/conflicts?status=open');
    assert.equal(syncConflicts.count, 0);
    assert.deepEqual(syncConflicts.conflicts, []);
    const missingSyncConflict = await requestRaw(baseUrl, 'GET', '/sync/conflicts/not-found');
    assert.equal(missingSyncConflict.response.status, 404);
    assert.equal(missingSyncConflict.payload.error.code, 'sync_conflict_not_found');
    console.log('  PASS sync conflict records are scaffolded without replay side effects');
    const testReplayMutationId = `mut-test-apply-${Date.now()}`;
    const testOnlyApply = await request(baseUrl, 'POST', '/sync/mutations', {
      test_only_task_replay_enabled: true,
      mutations: [{
        mutation_id: testReplayMutationId,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { notes: updatedTask.task.notes, priority: updatedTask.task.priority },
        patch: { notes: 'Applied by test-only replay', priority: 'urgent' }
      }]
    });
    assert.equal(testOnlyApply.replay.replay_status, 'test_only_task_replay_v1');
    assert.equal(testOnlyApply.replay.accepted, true);
    assert.equal(testOnlyApply.replay.writes_enabled, true);
    assert.equal(testOnlyApply.replay.test_only, true);
    assert.equal(testOnlyApply.replay.summary.applied_count, 1);
    assert.equal(testOnlyApply.replay.results[0].status, 'applied');
    assert.equal(testOnlyApply.outcome_persistence.recorded_count, 1);
    const taskAfterTestReplay = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(createdTask.task.id)}`);
    assert.equal(taskAfterTestReplay.task.notes, 'Applied by test-only replay');
    assert.equal(taskAfterTestReplay.task.priority, 'urgent');
    const testReplayOutcome = await request(baseUrl, 'GET', `/sync/mutations/${encodeURIComponent(testReplayMutationId)}`);
    assert.equal(testReplayOutcome.outcome.outcome_status, 'applied');
    assert.equal(testReplayOutcome.outcome.replay_status, 'test_only_task_replay_v1');
    const changesAfterTestReplay = await request(baseUrl, 'GET', `/sync/changes?cursor=${encodeURIComponent(eventChanges.next_cursor)}&limit=50`);
    assert(changesAfterTestReplay.changes.some(change => change.entity_type === 'task' && change.entity_id === createdTask.task.id && change.operation === 'updated'));
    console.log('  PASS test-only task replay applies a safe update and records metadata');

    const repeatTestOnlyApply = await request(baseUrl, 'POST', '/sync/mutations', {
      test_only_task_replay_enabled: true,
      mutations: [{
        mutation_id: testReplayMutationId,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { notes: updatedTask.task.notes, priority: updatedTask.task.priority },
        patch: { notes: 'Duplicate replay must not apply', priority: 'low' }
      }]
    });
    assert.equal(repeatTestOnlyApply.replay.summary.idempotent_count, 1);
    assert.equal(repeatTestOnlyApply.replay.results[0].reason, 'idempotent_replay_already_applied');
    const taskAfterDuplicateReplay = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(createdTask.task.id)}`);
    assert.equal(taskAfterDuplicateReplay.task.notes, 'Applied by test-only replay');
    assert.equal(taskAfterDuplicateReplay.task.priority, 'urgent');
    const repeatedTestReplayOutcome = await request(baseUrl, 'GET', `/sync/mutations/${encodeURIComponent(testReplayMutationId)}`);
    assert.equal(repeatedTestReplayOutcome.outcome.attempt_count, 2);
    console.log('  PASS test-only task replay is idempotent by mutation_id');
    const replayCreatedTaskId = `task_replay_create_${Date.now()}`;
    const testOnlyCreate = await request(baseUrl, 'POST', '/sync/mutations', {
      test_only_task_replay_enabled: true,
      mutations: [{
        mutation_id: `mut-test-create-${Date.now()}`,
        entity_type: 'task',
        entity_id: replayCreatedTaskId,
        operation: 'create',
        patch: {
          title: 'Created by test-only replay',
          due_date: date,
          notes: 'Replay create note',
          priority: 'medium'
        }
      }]
    });
    assert.equal(testOnlyCreate.replay.summary.applied_count, 1);
    const taskCreatedByReplay = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(replayCreatedTaskId)}`);
    assert.equal(taskCreatedByReplay.task.title, 'Created by test-only replay');
    assert.equal(taskCreatedByReplay.task.notes, 'Replay create note');
    console.log('  PASS test-only task replay creates a task with client entity_id');

    const testOnlyComplete = await request(baseUrl, 'POST', '/sync/mutations', {
      test_only_task_replay_enabled: true,
      mutations: [{
        mutation_id: `mut-test-complete-${Date.now()}`,
        entity_type: 'task',
        entity_id: replayCreatedTaskId,
        operation: 'complete',
        base_values: { progress: 'not_started', completed_at: null },
        patch: {}
      }]
    });
    assert.equal(testOnlyComplete.replay.summary.applied_count, 1);
    const taskCompletedByReplay = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(replayCreatedTaskId)}`);
    assert.equal(taskCompletedByReplay.task.progress, 'completed');
    assert(taskCompletedByReplay.task.completed_at);
    console.log('  PASS test-only task replay completes a task');

    const testOnlyReopen = await request(baseUrl, 'POST', '/sync/mutations', {
      test_only_task_replay_enabled: true,
      mutations: [{
        mutation_id: `mut-test-reopen-${Date.now()}`,
        entity_type: 'task',
        entity_id: replayCreatedTaskId,
        operation: 'reopen',
        base_values: { progress: 'completed', completed_at: taskCompletedByReplay.task.completed_at },
        patch: {}
      }]
    });
    assert.equal(testOnlyReopen.replay.summary.applied_count, 1);
    const taskReopenedByReplay = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(replayCreatedTaskId)}`);
    assert.equal(taskReopenedByReplay.task.progress, 'not_started');
    assert.equal(taskReopenedByReplay.task.completed_at, null);
    console.log('  PASS test-only task replay reopens a task');

    const testOnlyDelete = await request(baseUrl, 'POST', '/sync/mutations', {
      test_only_task_replay_enabled: true,
      mutations: [{
        mutation_id: `mut-test-delete-${Date.now()}`,
        entity_type: 'task',
        entity_id: replayCreatedTaskId,
        operation: 'delete',
        base_values: { progress: 'not_started' },
        patch: {}
      }]
    });
    assert.equal(testOnlyDelete.replay.summary.applied_count, 1);
    const deletedReplayTask = await requestRaw(baseUrl, 'GET', `/tasks/${encodeURIComponent(replayCreatedTaskId)}`);
    assert.equal(deletedReplayTask.response.status, 404);
    assert.equal(deletedReplayTask.payload.error.code, 'task_not_found');
    console.log('  PASS test-only task replay deletes a task');

    const testConflictMutationId = `mut-test-conflict-${Date.now()}`;
    const testOnlyConflict = await request(baseUrl, 'POST', '/sync/mutations', {
      test_only_task_replay_enabled: true,
      mutations: [{
        mutation_id: testConflictMutationId,
        entity_type: 'task',
        entity_id: createdTask.task.id,
        operation: 'update',
        base_values: { notes: 'Older local base' },
        patch: { notes: 'Local conflict value' }
      }]
    });
    assert.equal(testOnlyConflict.replay.summary.conflict_count, 1);
    assert.equal(testOnlyConflict.replay.results[0].status, 'conflict');
    assert.equal(testOnlyConflict.replay.results[0].reason, 'field_conflict');
    const replayConflicts = await request(baseUrl, 'GET', '/sync/conflicts?status=open');
    const replayConflict = replayConflicts.conflicts.find(conflict => conflict.mutation_id === testConflictMutationId);
    assert(replayConflict, `Expected replay conflict for ${testConflictMutationId}`);
    assert.deepEqual(replayConflict.local, { notes: 'Local conflict value' });
    assert.deepEqual(replayConflict.cloud, { notes: 'Applied by test-only replay' });
    const taskAfterConflictReplay = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(createdTask.task.id)}`);
    assert.equal(taskAfterConflictReplay.task.notes, 'Applied by test-only replay');
    console.log('  PASS test-only task replay persists same-field conflicts without applying local value');

    const laterConflictResolution = await request(baseUrl, 'POST', `/sync/conflicts/${encodeURIComponent(replayConflict.id)}/resolve`, {
      resolution: 'later'
    });
    assert.equal(laterConflictResolution.resolution, 'later');
    assert.equal(laterConflictResolution.status_changed, false);
    assert.equal(laterConflictResolution.conflict.status, 'open');
    console.log('  PASS Task sync conflict later action keeps the conflict open');

    const keepCloudResolution = await request(baseUrl, 'POST', `/sync/conflicts/${encodeURIComponent(replayConflict.id)}/resolve`, {
      resolution: 'keep_cloud'
    });
    assert.equal(keepCloudResolution.resolution, 'keep_cloud');
    assert.equal(keepCloudResolution.status_changed, true);
    assert.equal(keepCloudResolution.writes_cloud_data, false);
    assert.equal(keepCloudResolution.applies_local_data, false);
    assert.equal(keepCloudResolution.conflict.status, 'keep_cloud');
    const taskAfterKeepCloudResolution = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(createdTask.task.id)}`);
    assert.equal(taskAfterKeepCloudResolution.task.notes, 'Applied by test-only replay');
    const closedReplayConflicts = await request(baseUrl, 'GET', '/sync/conflicts?status=open');
    assert(!closedReplayConflicts.conflicts.some(conflict => conflict.id === replayConflict.id));
    const resolvedReplayOutcome = await request(baseUrl, 'GET', `/sync/mutations/${encodeURIComponent(testConflictMutationId)}`);
    assert.equal(resolvedReplayOutcome.outcome.outcome_status, 'kept_cloud');
    console.log('  PASS Task sync conflict keep-cloud closes metadata without overwriting Cloud task data');

    const nonTaskConflictId = `sync-conflict-non-task-${Date.now()}`;
    runWorkerSql(persistTo, `INSERT INTO sync_conflicts (id, account_id, mutation_id, entity_type, entity_id, reason, local_json, cloud_json, status, created_at) VALUES ('${nonTaskConflictId}', 'acct_local_dev', 'mut-non-task-conflict-${Date.now()}', 'container', 'container-example', 'field_conflict', '{}', '{}', 'open', '2026-01-01T00:00:00.000Z');`);
    const nonTaskResolution = await requestRaw(baseUrl, 'POST', `/sync/conflicts/${encodeURIComponent(nonTaskConflictId)}/resolve`, {
      resolution: 'keep_cloud'
    });
    assert.equal(nonTaskResolution.response.status, 400);
    assert.equal(nonTaskResolution.payload.error.code, 'sync_conflict_resolution_scope_blocked');
    console.log('  PASS Phase 3 sync conflict resolution rejects non-Task conflicts');

    const testOnlyNonTask = await request(baseUrl, 'POST', '/sync/mutations', {
      test_only_task_replay_enabled: true,
      mutations: [{
        mutation_id: `mut-test-non-task-${Date.now()}`,
        entity_type: 'container',
        entity_id: 'container-example',
        operation: 'update',
        patch: { name: 'Must stay disabled' }
      }]
    });
    assert.equal(testOnlyNonTask.replay.summary.rejected_count, 1);
    assert.equal(testOnlyNonTask.replay.results[0].reason, 'entity_replay_not_in_task_gate');
    console.log('  PASS test-only replay keeps non-Task entities blocked');

    const manageBacReplayTask = await request(baseUrl, 'POST', '/tasks', {
      title: 'ManageBac replay source task',
      due_date: date,
      notes: 'Source task local notes'
    });
    runWorkerSql(persistTo, `UPDATE tasks SET source_type = 'managebac', readonly = 1 WHERE id = '${manageBacReplayTask.task.id.replace(/'/g, "''")}';`);
    const testOnlyManageBacBlocked = await request(baseUrl, 'POST', '/sync/mutations', {
      test_only_task_replay_enabled: true,
      mutations: [{
        mutation_id: `mut-test-mb-title-${Date.now()}`,
        entity_type: 'task',
        entity_id: manageBacReplayTask.task.id,
        operation: 'update',
        base_values: { title: manageBacReplayTask.task.title },
        patch: { title: 'Should not override source title' }
      }]
    });
    assert.equal(testOnlyManageBacBlocked.replay.summary.rejected_count, 1);
    assert.equal(testOnlyManageBacBlocked.replay.results[0].reason, 'task_fields_not_allowed');
    const manageBacAfterBlockedReplay = await request(baseUrl, 'GET', `/tasks/${encodeURIComponent(manageBacReplayTask.task.id)}`);
    assert.equal(manageBacAfterBlockedReplay.task.title, 'ManageBac replay source task');
    console.log('  PASS test-only task replay preserves ManageBac source-field boundary');

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
