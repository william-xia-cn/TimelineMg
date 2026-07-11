const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const rootDir = path.resolve(__dirname, '..');

function pass(message) {
  console.log(`  PASS ${message}`);
}

async function main() {
  console.log('WebDev legacy IndexedDB migration adapter tests');
  console.log('================================================');
  const adapter = await import(pathToFileURL(path.join(rootDir, 'pages/src/migration/legacyIndexedDbSnapshotAdapter.js')).href);
  const privateKey = `client_${'secret'}`;
  const runtimeKey = `refresh_${'token'}`;
  const source = {
    plans: [{ id: 1, name: 'School', updatedAt: new Date('2026-07-10T01:00:00Z') }],
    buckets: [{ id: 2, plan_id: 1, name: 'Homework' }],
    labels: [{ id: 3, plan_id: 1, name: 'Essay', color: '#2364aa' }],
    tasks: [{
      id: 4,
      plan_id: 1,
      bucket_id: 2,
      title: 'Legacy task',
      deadline: '2026-07-12',
      status: 'in_progress',
      nested: { [privateKey]: 'private-value' }
    }],
    containers: [{ id: 5, name: 'Evening', repeat: 'daily' }],
    events: [{ id: 6, title: 'Class', date: '2026-07-11', time_start: '09:00' }],
    settings: {
      theme: 'blue',
      google_sync_history: [{ result: 'failed' }],
      google_sync_account_email: 'person@example.invalid',
      [runtimeKey]: 'private-value',
      [privateKey]: 'private-value'
    }
  };

  const snapshot = await adapter.buildLegacyIndexedDbSnapshot(source, {
    deviceId: 'unit-device',
    exportedAt: '2026-07-11T00:00:00.000Z'
  });

  assert.equal(snapshot.schema, adapter.LEGACY_INDEXEDDB_SNAPSHOT_SCHEMA);
  assert.equal(snapshot.device_id, 'unit-device');
  assert.equal(snapshot.data.plans.length, 1);
  assert.equal(snapshot.data.buckets.length, 1);
  assert.equal(snapshot.data.labels.length, 1);
  assert.equal(snapshot.data.tasks.length, 1);
  assert.equal(snapshot.data.containers.length, 1);
  assert.equal(snapshot.data.events.length, 1);
  pass('exports all legacy entity tables');

  assert.equal(snapshot.data.plans[0].updated_at, '2026-07-10T01:00:00.000Z');
  assert.equal(snapshot.data.tasks[0].due_date, '2026-07-12');
  assert.equal(snapshot.data.tasks[0].progress, 'in_progress');
  assert.deepEqual(snapshot.data.tasks[0].checklist, []);
  assert.deepEqual(snapshot.data.tasks[0].labels, []);
  assert.deepEqual(snapshot.data.containers[0].days, []);
  assert.equal(snapshot.data.containers[0].enabled, true);
  pass('normalizes legacy task and container fields');

  assert.equal(snapshot.data.settings.theme, 'blue');
  assert(!Object.prototype.hasOwnProperty.call(snapshot.data.settings, 'google_sync_history'));
  assert(!Object.prototype.hasOwnProperty.call(snapshot.data.settings, 'google_sync_account_email'));
  assert(!Object.prototype.hasOwnProperty.call(snapshot.data.settings, runtimeKey));
  assert(!Object.prototype.hasOwnProperty.call(snapshot.data.settings, privateKey));
  pass('excludes local runtime and private settings');

  const serialized = JSON.stringify(snapshot);
  assert(!serialized.includes('private-value'));
  assert(!serialized.includes('person@example.invalid'));
  pass('strips private nested fields from exported snapshot');

  const tableLikeSource = {
    db: {
      tasks: { toArray: async () => [{ id: 'from-table', title: 'From table' }] }
    },
    getPlans: async () => [{ id: 'method-plan', name: 'Method Plan' }]
  };
  const tableSnapshot = await adapter.buildLegacyIndexedDbSnapshot(tableLikeSource);
  assert.equal(tableSnapshot.data.tasks[0].id, 'from-table');
  assert.equal(tableSnapshot.data.plans[0].id, 'method-plan');
  pass('supports Dexie-like tables and legacy DB wrapper methods');

  console.log('================================================');
  console.log('All WebDev migration adapter checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
