const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const rootDir = path.resolve(__dirname, '..');

function pass(message) {
  console.log(`  PASS ${message}`);
}

async function main() {
  console.log('WebDev business parity tests');
  console.log('============================');
  const { computeCalendarDateProjection } = await import(pathToFileURL(path.join(rootDir, 'pages/src/domain/calendarDateProjection.js')).href);
  const { buildLegacyIndexedDbSnapshot } = await import(pathToFileURL(path.join(rootDir, 'pages/src/migration/legacyIndexedDbSnapshotAdapter.js')).href);

  const events = [
    {
      id: 'weekly',
      title: 'Weekly class',
      date: '2026-05-11',
      repeat: 'weekly',
      repeat_days: [1],
      active_start_date: '2026-05-11',
      active_end_date: '2026-05-25',
      time_start: '09:00'
    },
    {
      id: 'custom',
      title: 'Custom class',
      date: '2026-05-11',
      repeat: 'custom',
      repeat_days: [1, 3],
      active_start_date: '2026-05-11',
      active_end_date: '2026-05-25',
      time_start: '10:00'
    },
    {
      id: 'none-range',
      title: 'One day only',
      date: '2026-05-11',
      repeat: 'none',
      active_start_date: '2026-05-11',
      active_end_date: '2026-05-25',
      time_start: '11:00'
    }
  ];
  const mondayProjection = computeCalendarDateProjection({ date: '2026-05-18', events });
  assert(mondayProjection.events.some(event => event.id === 'weekly'));
  assert(mondayProjection.events.some(event => event.id === 'custom'));
  assert(!mondayProjection.events.some(event => event.id === 'none-range'));
  pass('Calendar projection expands weekly/custom events without expanding non-repeat ranges');

  const tuesdayProjection = computeCalendarDateProjection({ date: '2026-05-19', events });
  assert(!tuesdayProjection.events.some(event => event.id === 'weekly'));
  assert(!tuesdayProjection.events.some(event => event.id === 'custom'));
  pass('Calendar projection respects repeat_days for non-matching weekdays');

  const containerProjection = computeCalendarDateProjection({
    date: '2026-05-20',
    containers: [
      { id: 'custom-container', name: 'Custom container', repeat: 'custom', repeat_days: [3], time_start: '18:00', time_end: '19:00', enabled: true },
      { id: 'off-container', name: 'Off container', repeat: 'custom', repeat_days: [2], time_start: '20:00', time_end: '21:00', enabled: true }
    ]
  });
  assert(containerProjection.containers.some(container => container.id === 'custom-container'));
  assert(!containerProjection.containers.some(container => container.id === 'off-container'));
  pass('Calendar projection applies custom container repeat days');

  const snapshot = await buildLegacyIndexedDbSnapshot({
    tasks: [{
      id: 'managebac-task',
      title: 'ManageBac source task',
      source: 'managebac',
      source_type: 'managebac_ics',
      source_uid: 'mb-1',
      source_url: 'https://example.invalid/task',
      source_updated_at: '2026-05-20T00:00:00.000Z',
      managebac_subject: 'English',
      readonly: true,
      recurrence_series_id: 'series-1',
      recurrence_index: 2,
      recurrence_count: 4,
      recurrence_frequency: 'weekly',
      recurrence_anchor_start_date: '2026-05-01',
      recurrence_anchor_due_date: '2026-05-08'
    }]
  });
  const task = snapshot.data.tasks[0];
  assert.equal(task.source_type, 'managebac_ics');
  assert.equal(task.managebac_subject, 'English');
  assert.equal(task.readonly, true);
  assert.equal(task.recurrence_series_id, 'series-1');
  assert.equal(task.recurrence_frequency, 'weekly');
  pass('Legacy snapshot keeps ManageBac source and recurrence fields for Cloud migration');

  console.log('============================');
  console.log('All WebDev business parity checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
