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
  const { computeDashboardProjection } = await import(pathToFileURL(path.join(rootDir, 'pages/src/domain/dailySettleProjection.js')).href);
  const { advanceReminderSession, computeReminderState } = await import(pathToFileURL(path.join(rootDir, 'pages/src/domain/reminderState.js')).href);
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

  const assignmentProjection = computeCalendarDateProjection({
    date: '2026-05-20',
    containers: [{ id: 'evening', name: 'Evening', repeat: 'daily', time_start: '18:00', time_end: '19:00', enabled: true }],
    tasks: [
      { id: 'fit', title: 'Fits', start_date: '2026-05-20', due_date: '2026-05-20', schedule_time: '18:15', duration: 30 },
      { id: 'miss', title: 'Misses', start_date: '2026-05-20', due_date: '2026-05-20', schedule_time: '20:15', duration: 30 }
    ]
  });
  assert.equal(assignmentProjection.containerItems[0].tasks[0].id, 'fit');
  assert.equal(assignmentProjection.unassignedTasks[0].id, 'miss');
  pass('Calendar projection assigns date tasks into matching containers and exposes unassigned tasks');

  const settleProjection = computeDashboardProjection({
    now: new Date('2026-05-20T18:10:00'),
    containers: [
      { id: 'study', name: 'Study', repeat: 'daily', layer: 1, time_start: '18:00', time_end: '19:00', enabled: true },
      { id: 'later', name: 'Later', repeat: 'daily', layer: 2, time_start: '20:00', time_end: '21:00', enabled: true }
    ],
    tasks: [
      { id: 'a', title: 'A', start_date: '2026-05-20', due_date: '2026-05-20', duration: 45, priority: 'important' },
      { id: 'b', title: 'B', start_date: '2026-05-20', due_date: '2026-05-20', duration: 45, priority: 'medium' },
      { id: 'future', title: 'Future', start_date: '2026-05-21', duration: 45 }
    ]
  });
  assert.equal(settleProjection.activeContainer.id, 'study');
  assert.equal(settleProjection.assignedContainers.find(item => item.container.id === 'study').tasks[0].id, 'a');
  assert.equal(settleProjection.assignedContainers.find(item => item.container.id === 'later').tasks[0].id, 'b');
  assert.equal(settleProjection.pendingCount, 2);
  pass('Daily Settle projection assigns current and overflow work across containers');

  const reminderNow = new Date('2026-05-20T18:10:00Z');
  const reminderState = computeReminderState({
    now: reminderNow,
    tasks: [{ id: 'due', title: 'Due now', due_date: '2026-05-20', schedule_time: '18:00' }]
  });
  const visible = advanceReminderSession({ reminderState, now: reminderNow, event: { type: 'notification_sent', at: reminderNow.toISOString() } });
  assert.equal(visible.status, 'notification_visible');
  const closed = advanceReminderSession({ previousSession: visible, reminderState, now: reminderNow, event: { type: 'notification_closed', at: reminderNow.toISOString() } });
  assert.equal(closed.status, 'notification_closed');
  const dueAgain = advanceReminderSession({ previousSession: closed, reminderState, now: new Date('2026-05-20T18:11:01Z') });
  assert.equal(dueAgain.status, 'notification_due');
  const clicked = advanceReminderSession({ previousSession: visible, reminderState, now: reminderNow, event: { type: 'notification_clicked', at: reminderNow.toISOString() } });
  assert.equal(clicked.status, 'execution_check_scheduled');
  const checkDue = advanceReminderSession({ previousSession: clicked, reminderState, now: new Date('2026-05-20T18:40:01Z') });
  assert.equal(checkDue.status, 'execution_check_due');
  pass('Reminder session state machine handles visible closed clicked and execution check states');

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
