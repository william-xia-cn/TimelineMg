/**
 * TimeWhere reminder rule tests.
 * Run: node tests/reminders.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Reminders = require('../extension/shared/js/reminders.js');

const g = {};
const schedulingSrc = fs.readFileSync(path.join(__dirname, '../extension/shared/js/scheduling.js'), 'utf8');
new Function('global', schedulingSrc).call(g, g);
const Scheduling = g.TimeWhereScheduling;

let passed = 0;
let failed = 0;

function assert(desc, condition) {
    if (condition) {
        passed++;
        console.log(`  PASS ${desc}`);
    } else {
        failed++;
        console.log(`  FAIL ${desc}`);
    }
}

function assertEqual(desc, got, expected) {
    assert(`${desc} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(expected));
}

function at(time) {
    return new Date(`2026-05-16T${time}:00`);
}

function atExact(time) {
    return new Date(`2026-05-16T${time}`);
}

function task(overrides = {}) {
    return {
        id: overrides.id || 'task-1',
        title: overrides.title || 'Essay',
        progress: 'not_started',
        start_date: '2026-05-16',
        due_date: '2026-05-20',
        priority: 'medium',
        duration: 45,
        ...overrides
    };
}

function container(overrides = {}) {
    return {
        id: overrides.id || 'study',
        name: overrides.name || '学习时间',
        time_start: '18:30',
        time_end: '20:00',
        repeat: 'daily',
        layer: 1,
        enabled: true,
        ...overrides
    };
}

console.log('\nTimeWhere reminder tests\n' + '='.repeat(40));

const scheduledStart = Reminders.computeScheduledTaskReminder(task({ schedule_time: '20:00' }), at('19:59'));
assertEqual('schedule_time task reminds one minute before start', scheduledStart?.type, 'scheduled-start');
assertEqual('scheduled start reminder key includes task and type', scheduledStart?.key.includes('task-1:scheduled-start'), true);
assertEqual(
    'schedule_time task reminds when alarm wakes 30 seconds before start',
    Reminders.computeScheduledTaskReminder(task({ schedule_time: '20:00' }), atExact('19:59:30'))?.type,
    'scheduled-start'
);
assertEqual(
    'schedule_time task does not remind too early before advance window',
    Reminders.computeScheduledTaskReminder(task({ schedule_time: '20:00' }), atExact('19:58:45')),
    null
);

for (const time of ['20:00', '20:15', '20:30', '20:45']) {
    const reminder = Reminders.computeScheduledTaskReminder(task({ schedule_time: '20:00' }), at(time));
    assertEqual(`schedule_time task repeats at ${time}`, reminder?.type, 'scheduled-repeat');
}

assertEqual(
    'schedule_time task repeats on alarm drift inside unsent 15-minute bucket',
    Reminders.computeScheduledTaskReminder(task({ schedule_time: '20:00' }), at('20:07'))?.type,
    'scheduled-repeat'
);

assertEqual(
    'schedule_time task does not remind after duration window',
    Reminders.computeScheduledTaskReminder(task({ schedule_time: '20:00', duration: 45 }), at('20:46')),
    null
);

assertEqual(
    'completed task does not remind',
    Reminders.computeScheduledTaskReminder(task({ schedule_time: '20:00', progress: 'completed' }), at('19:59')),
    null
);

assertEqual(
    'future deferred task does not remind',
    Reminders.computeScheduledTaskReminder(task({ schedule_time: '20:00', deferred_until: '2026-05-16T21:00:00' }), at('19:59')),
    null
);

const sentState = {};
const first = Reminders.computeScheduledTaskReminder(task({ schedule_time: '20:00' }), at('20:00'), sentState);
sentState[first.key] = true;
assertEqual('sent state blocks duplicate reminder for same time bucket',
    Reminders.computeScheduledTaskReminder(task({ schedule_time: '20:00' }), at('20:07'), sentState),
    null);

const containerReminder = Reminders.computeContainerTaskReminders(
    [task({ id: 'container-task', schedule_time: null })],
    [container()],
    at('18:45'),
    Scheduling
);
assertEqual('container task reminds inside current container every 15 minutes', containerReminder.length, 1);
assertEqual('container reminder uses container-repeat type', containerReminder[0]?.type, 'container-repeat');

const containerSameBucketSent = {};
const firstContainer = Reminders.computeContainerTaskReminders(
    [task({ id: 'container-task', schedule_time: null })],
    [container()],
    at('18:45'),
    Scheduling,
    containerSameBucketSent
);
containerSameBucketSent[firstContainer[0].key] = true;
const containerOffMinute = Reminders.computeContainerTaskReminders(
    [task({ id: 'container-task', schedule_time: null })],
    [container()],
    at('18:46'),
    Scheduling,
    containerSameBucketSent
);
assertEqual('sent state blocks duplicate container reminder in same 15 minute bucket', containerOffMinute.length, 0);

const containerNextBucket = Reminders.computeContainerTaskReminders(
    [task({ id: 'container-task', schedule_time: null })],
    [container()],
    at('19:00'),
    Scheduling
);
assertEqual('container task reminds again in next 15 minute bucket', containerNextBucket.length, 1);

const both = Reminders.computeTaskReminders(
    [task({ id: 'both-task', schedule_time: '18:45' })],
    [container()],
    at('18:45'),
    Scheduling
);
assertEqual('schedule_time wins over container reminder for same task', both.length, 1);
assertEqual('schedule_time priority emits scheduled reminder', both[0]?.type, 'scheduled-repeat');

const aggregate = Reminders.computeAggregatedReminder(
    [
        task({ id: 'scheduled-start', title: 'Essay', schedule_time: '20:00', priority: 'medium', notes: 'Do not show this note' }),
        task({ id: 'container-waiting', title: 'Reading', schedule_time: null, priority: 'urgent', description: 'Do not show this description' })
    ],
    [container()],
    at('19:59'),
    Scheduling
);
assertEqual('aggregated reminder emits one representative notification', aggregate?.task_id, 'scheduled-start');
assertEqual('aggregated reminder records total due task count', aggregate?.total_count, 2);
assertEqual('aggregated reminder records overflow count', aggregate?.overflow_count, 1);
assert('aggregated reminder carries all due task ids',
    aggregate?.task_ids?.includes('scheduled-start') && aggregate.task_ids.includes('container-waiting'));
assertEqual('aggregated reminder stores sorted list preview items',
    aggregate?.items?.map(item => item.title),
    ['Essay', 'Reading']);

const selectedPrimary = Reminders.selectPrimaryReminder([
    { type: 'container-repeat', task_id: 'container', task: task({ id: 'container', priority: 'urgent', schedule_time: null }) },
    { type: 'scheduled-repeat', task_id: 'repeat', scheduled_time: '20:00', task: task({ id: 'repeat', priority: 'low', schedule_time: '20:00' }) },
    { type: 'scheduled-start', task_id: 'start', scheduled_time: '21:00', task: task({ id: 'start', priority: 'low', schedule_time: '21:00' }) }
]);
assertEqual('scheduled-start wins over scheduled-repeat and container reminders', selectedPrimary?.task_id, 'start');

const aggregateSentState = {};
const aggregateFirst = Reminders.computeAggregatedReminder(
    [
        task({ id: 'a', schedule_time: '20:00' }),
        task({ id: 'b', schedule_time: '20:00', priority: 'urgent' })
    ],
    [container()],
    at('20:00'),
    Scheduling,
    aggregateSentState
);
aggregateSentState[aggregateFirst.key] = true;
assertEqual('aggregated sent state blocks duplicate Chrome reminder in same 15 minute bucket',
    Reminders.computeAggregatedReminder(
        [
            task({ id: 'a', schedule_time: '20:00' }),
            task({ id: 'b', schedule_time: '20:00', priority: 'urgent' })
        ],
        [container()],
        at('20:07'),
        Scheduling,
        aggregateSentState
    ),
    null);

const singleAggregate = Reminders.computeAggregatedReminder(
    [task({ id: 'single', title: 'Solo Work', schedule_time: '20:00', notes: 'Private implementation detail' })],
    [container()],
    at('20:00'),
    Scheduling
);
const overflowAggregate = Reminders.computeAggregatedReminder(
    [
        task({ id: 'a', title: 'Alpha', schedule_time: '20:00' }),
        task({ id: 'b', title: 'Beta', schedule_time: '20:00' }),
        task({ id: 'c', title: 'Gamma', schedule_time: '20:00' }),
        task({ id: 'd', title: 'Delta', schedule_time: '20:00' }),
        task({ id: 'e', title: 'Epsilon', schedule_time: '20:00' })
    ],
    [container()],
    at('20:00'),
    Scheduling
);

const payload = Reminders.buildReminderNotificationPayload({
    ...scheduledStart,
    task: { ...scheduledStart.task, plan_name: 'English Plan', notes: 'Draft body paragraph' }
});
assert('notification payload is Chrome basic persistent notification',
    payload.type === 'basic' && payload.iconUrl === 'icons/icon128.png' && payload.requireInteraction === true);
assert('scheduled start notification title has action semantics', payload.title === '即将开始：Essay');
assert('scheduled start notification body includes time plan duration and details',
    payload.message.includes('20:00') && payload.message.includes('English Plan') && payload.message.includes('45分钟') && payload.message.includes('Draft body paragraph'));

const repeatPayload = Reminders.buildReminderNotificationPayload({
    ...first,
    task: { ...first.task, plan_name: 'English Plan' }
});
assert('scheduled repeat notification title uses unfinished semantics', repeatPayload.title === '仍未完成：Essay');

const containerPayload = Reminders.buildReminderNotificationPayload(containerReminder[0]);
assert('container notification title uses current task semantics', containerPayload.title === '当前任务提醒：Essay');
assert('container notification body includes container name', containerPayload.message.includes('学习时间'));

const aggregatePayload = Reminders.buildReminderNotificationPayload({
    ...aggregate,
    task: { ...aggregate.task, plan_name: 'English Plan' }
});
assert('aggregated notification title summarizes waiting task count',
    aggregatePayload.title === '当前有 2 个任务待处理');
assert('aggregated notification body renders current work list without task notes',
    aggregatePayload.message.includes('1. Essay')
    && aggregatePayload.message.includes('20:00')
    && aggregatePayload.message.includes('2. Reading')
    && !aggregatePayload.message.includes('Do not show'));

const singleAggregatePayload = Reminders.buildReminderNotificationPayload(singleAggregate);
assert('single aggregated notification also uses list-style title and body',
    singleAggregatePayload.title === '当前有 1 个任务待处理'
    && singleAggregatePayload.message.includes('1. Solo Work')
    && !singleAggregatePayload.message.includes('Private implementation detail'));

const overflowPayload = Reminders.buildReminderNotificationPayload(overflowAggregate);
assert('aggregated notification body shows first three items and hidden count',
    overflowPayload.title === '当前有 5 个任务待处理'
    && overflowPayload.message.includes('1. Alpha')
    && overflowPayload.message.includes('2. Beta')
    && overflowPayload.message.includes('3. Gamma')
    && overflowPayload.message.includes('另有 2 项')
    && !overflowPayload.message.includes('Delta')
    && !overflowPayload.message.includes('Epsilon'));

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../extension/manifest.json'), 'utf8'));
assert('manifest includes notifications and alarms permissions',
    manifest.permissions.includes('notifications') && manifest.permissions.includes('alarms'));
assert('manifest uses classic background service worker for importScripts',
    manifest.background.service_worker === 'background.js' && !manifest.background.type);

const background = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
assert('background registers reminder alarm',
    background.includes("const TASK_REMINDER_ALARM = 'timewhere-task-reminder-tick'")
    && background.includes('chrome.alarms?.onAlarm.addListener')
    && background.includes('TIMEWHERE_TASK_REMINDER_ENSURE')
    && background.includes('TIMEWHERE_TASK_REMINDER_STATUS'));
assert('background verifies alarm registration after create',
    background.includes('Task reminder alarm was not registered')
    && background.includes('chrome.alarms.get'));
assert('background runs immediate reminder check on bootstrap',
    background.includes('bootstrapTaskReminders()')
    && background.includes('await runTaskReminderTick()'));
assert('background handles work reminder click as generic Dashboard open',
    background.includes('chrome.notifications?.onClicked.addListener')
    && background.includes('TASK_REMINDER_NOTIFICATION_PREFIX')
    && background.includes('handleWorkReminderNotificationClick')
    && background.includes("url: 'pages/focus/focus.html'")
    && !background.includes('focus.html?task_id='));
assert('background respects notification_enabled setting',
    background.includes("settings?.notification_enabled === false"));
assert('background sends at most one aggregated task reminder per session tick',
    background.includes('computeAggregatedReminder')
    && background.includes('notification_visible')
    && background.includes('renotify_waiting')
    && background.includes('execution_check_waiting')
    && background.includes('TASK_REMINDER_RENOTIFY_COOLDOWN_MS = 60 * 1000')
    && background.includes('TASK_REMINDER_EXECUTION_CHECK_MS = 30 * 60 * 1000'));
assert('background supports Chrome work reminder close and stop state',
    background.includes('chrome.notifications?.onClosed.addListener')
    && background.includes('handleWorkReminderNotificationClosed')
    && background.includes('TIMEWHERE_WORK_REMINDER_STATE')
    && background.includes('TIMEWHERE_WORK_REMINDER_STOP')
    && background.includes('timewhere_work_reminder_state_v1'));
assert('background exposes manual test notification message',
    background.includes('TIMEWHERE_TASK_REMINDER_TEST')
    && background.includes('timewhere-test-reminder:'));
assert('background emits debug notification on every reminder tick',
    background.includes('TASK_REMINDER_DEBUG_NOTIFICATIONS')
    && background.includes('TimeWhere 检查：没有任务提醒')
    && background.includes('createTaskReminderDebugNotification(now, [aggregatedReminder])')
    && background.includes('requireInteraction: true'));
assert('background can schedule a diagnostic alarm event notification',
    background.includes('TASK_REMINDER_DIAGNOSTIC_ALARM')
    && background.includes('TimeWhere 诊断：alarm 事件已触发')
    && background.includes('createDiagnosticAlarm()')
    && background.includes('TASK_REMINDER_DIAGNOSTIC_STATE_KEY'));
assert('background registers daily journal snapshot and prompt alarms',
    background.includes("const DAILY_JOURNAL_SNAPSHOT_ALARM = 'timewhere-daily-journal-snapshot'")
    && background.includes("const DAILY_JOURNAL_COMPLETION_ALARM = 'timewhere-daily-journal-completion'")
    && background.includes("const DAILY_JOURNAL_PROMPT_ALARM = 'timewhere-daily-journal-prompt'")
    && background.includes('DAILY_JOURNAL_SNAPSHOT_HOUR = 0')
    && background.includes('DAILY_JOURNAL_COMPLETION_HOUR = 0')
    && background.includes('DAILY_JOURNAL_COMPLETION_MINUTE = 5')
    && background.includes('DAILY_JOURNAL_PROMPT_HOUR = 21')
    && background.includes('DAILY_JOURNAL_PROMPT_MINUTE = 30')
    && background.includes('ensureDailyJournalAlarms()'));
assert('background daily journal prompt opens Dashboard journal URL',
    background.includes('timewhere-daily-journal:')
    && background.includes('focus.html?journal_date='));
assert('background daily journal snapshot freezes planned tasks after local midnight',
    background.includes('ensureTodayDailyJournalSnapshot')
    && background.includes('buildDailyJournalSettleSnapshot(tasks, containers, date, now)')
    && background.includes('scheduling.buildDailyTaskPool(tasks || [], now)')
    && background.includes('scheduling.dailySettle(taskPool, todayContainers, now)')
    && background.includes('planned_task_snapshots')
    && background.includes('daily_pool_snapshots'));
assert('background creates previous-day completion snapshot after local midnight',
    background.includes('ensurePreviousDailyJournalCompletionSnapshot')
    && background.includes('ensureDailyJournalCompletionSnapshot(getPreviousDateString(now), now)')
    && background.includes('completion_snapshot_at')
    && background.includes('completion_task_snapshots')
    && background.includes('completion_extra_task_snapshots')
    && background.includes('alarm?.name === DAILY_JOURNAL_COMPLETION_ALARM'));

const settingsHtml = fs.readFileSync(path.join(__dirname, '../extension/pages/settings/settings.html'), 'utf8');
const settingsJs = fs.readFileSync(path.join(__dirname, '../extension/pages/settings/script.js'), 'utf8');
const desktopReminders = fs.readFileSync(path.join(__dirname, '../extension/shared/js/desktop-reminders.js'), 'utf8');
const desktopMain = fs.readFileSync(path.join(__dirname, '../platforms/desktop-electron/main.js'), 'utf8');
assert('Settings exposes system task reminder toggle',
    settingsHtml.includes('id="notificationEnabled"') && settingsHtml.includes('系统任务提醒'));
assert('Settings exposes manual notification test action',
    settingsHtml.includes('id="testNotificationBtn"') && settingsHtml.includes('发送测试提醒'));
assert('Settings persists notification_enabled',
    settingsJs.includes("document.getElementById('notificationEnabled').checked")
    && settingsJs.includes("settings.notification_enabled !== false"));
assert('Settings sends manual notification test message',
    settingsJs.includes('TIMEWHERE_TASK_REMINDER_TEST') && settingsJs.includes('handleTestNotification'));
assert('Settings ensures task reminder alarm from notification settings',
    settingsJs.includes('TIMEWHERE_TASK_REMINDER_ENSURE')
    && settingsJs.includes('alarm 已注册')
    && settingsJs.includes('TimeWhereDesktopReminders?.rescheduleNow'));
assert('Settings reports diagnostic alarm scheduled time',
    settingsJs.includes('formatDiagnosticAlarmStatus')
    && settingsJs.includes('30 秒诊断')
    && settingsJs.includes('scheduleDiagnosticAlarmFollowUp'));
assert('Desktop reminder bridge uses shared reminder rules and platform rescheduleAll',
    desktopReminders.includes('TimeWhereReminders.computeAggregatedReminder')
    && desktopReminders.includes('TimeWherePlatform.reminderRuntime.rescheduleAll')
    && desktopReminders.includes('TimeWhereReminders.buildReminderNotificationPayload')
    && desktopReminders.includes('desktop_work_reminder_state_v1')
    && desktopReminders.includes('renotify_waiting')
    && desktopReminders.includes('execution_check_waiting')
    && desktopReminders.includes('acknowledgeNotificationClick')
    && desktopReminders.includes('handleNotificationClosed')
    && desktopReminders.includes('stopCurrentReminder')
    && desktopReminders.includes('RENOTIFY_COOLDOWN_MS = 60 * 1000')
    && desktopReminders.includes('EXECUTION_CHECK_MS = 30 * 60 * 1000')
    && desktopReminders.includes('items: reminder.items || []')
    && desktopReminders.includes("route: 'pages/focus/focus.html'")
    && desktopReminders.includes("global.TimeWherePlatform?.name === 'desktop-electron'"));
assert('Electron main implements app-running reminder timers and notification click routing',
    desktopMain.includes('const reminderTimers = new Map()')
    && desktopMain.includes('const pendingNotificationClicks = []')
    && desktopMain.includes('const pendingNotificationCloses = []')
    && desktopMain.includes('function scheduleReminder')
    && desktopMain.includes('timewhere-platform:window-activated')
    && desktopMain.includes('notification.consumePendingClicks')
    && desktopMain.includes('notification.consumePendingCloses')
    && desktopMain.includes("notification.on('close'")
    && desktopMain.includes("method === 'reminderRuntime.rescheduleAll'")
    && desktopMain.includes('sendNotificationClick(payload)')
    && desktopMain.includes('Notification.isSupported'));

function createDesktopReminderHarness() {
    let tasks = [task({ id: 'task-1', schedule_time: '20:00' })];
    let clickHandler = null;
    let closeHandler = null;
    let scheduled = [];
    const settings = {};
    const context = {
        console,
        setInterval: () => 1,
        clearInterval: () => {},
        CustomEvent: function CustomEvent(name, init) {
            return { type: name, detail: init?.detail };
        },
        dispatchEvent: () => {},
        localStorage: {
            getItem(key) {
                return Object.prototype.hasOwnProperty.call(settings, key) ? JSON.stringify(settings[key]) : null;
            },
            setItem(key, value) {
                settings[key] = JSON.parse(value);
            }
        },
        TimeWhereReminders: Reminders,
        TimeWhereScheduling: Scheduling,
        TimeWhereDB: {
            getSetting: async key => settings[key] || null,
            setSetting: async (key, value) => {
                settings[key] = value;
            },
            getSettings: async () => ({ notification_enabled: true }),
            getAllTasks: async () => tasks,
            getContainers: async () => [container()]
        },
        TimeWherePlatform: {
            name: 'desktop-electron',
            notification: {
                onClick(callback) {
                    clickHandler = callback;
                    return () => { clickHandler = null; };
                },
                onClose(callback) {
                    closeHandler = callback;
                    return () => { closeHandler = null; };
                }
            },
            reminderRuntime: {
                rescheduleAll: async reminders => {
                    scheduled = reminders;
                    return { status: 'ok', reminders };
                }
            }
        }
    };
    vm.createContext(context);
    vm.runInContext(desktopReminders, context);
    return {
        api: context.TimeWhereDesktopReminders,
        setTasks(nextTasks) {
            tasks = nextTasks;
        },
        click(payload) {
            if (clickHandler) clickHandler(payload);
        },
        close(payload) {
            if (closeHandler) closeHandler(payload);
        },
        get scheduled() {
            return scheduled;
        },
        get settings() {
            return settings;
        }
    };
}

async function runDesktopAcknowledgementTests() {
    const harness = createDesktopReminderHarness();
    const first = await harness.api.collectDueReminders(at('20:00'));
    assertEqual('desktop reminder sends first due scheduled task', first.length, 1);
    assertEqual('desktop reminder stores visible work reminder session',
        (await harness.api.readReminderState()).status,
        'notification_visible');

    const afterOneMinute = await harness.api.collectDueReminders(at('20:01'));
    assertEqual('desktop visible notification does not repeat without close or click', afterOneMinute.length, 0);

    await harness.api.handleNotificationClosed({
        key: first[0].key,
        id: first[0].key,
        bucket: first[0].bucket,
        task_ids: first[0].task_ids
    }, atExact('20:00:20'));
    assertEqual('desktop notification close stores one-minute renotify wait',
        (await harness.api.readReminderState()).status,
        'renotify_waiting');
    const beforeCooldown = await harness.api.collectDueReminders(atExact('20:01:10'));
    assertEqual('desktop closed notification does not repeat before one-minute cooldown', beforeCooldown.length, 0);
    const afterCooldown = await harness.api.collectDueReminders(atExact('20:01:21'));
    assertEqual('desktop closed notification repeats after one-minute cooldown', afterCooldown.length, 1);
    assertEqual('desktop renotify keeps same current-work reminder key', afterCooldown[0]?.key, first[0]?.key);

    await harness.api.acknowledgeNotificationClick({
        key: afterCooldown[0].key,
        id: afterCooldown[0].key,
        bucket: afterCooldown[0].bucket,
        task_ids: afterCooldown[0].task_ids,
        items: afterCooldown[0].items,
        total_count: afterCooldown[0].total_count
    }, at('20:02'));
    const afterClick = await harness.api.collectDueReminders(at('20:15'));
    assertEqual('desktop click handling suppresses reminders until execution check', afterClick.length, 0);
    assertEqual('desktop click creates 30-minute execution check state',
        (await harness.api.readReminderState()).status,
        'execution_check_waiting');
    const executionCheck = await harness.api.collectDueReminders(at('20:32'));
    assertEqual('desktop execution check reminds again when work remains unfinished', executionCheck.length, 1);

    harness.setTasks([task({ id: 'task-1', schedule_time: '20:00', progress: 'completed' })]);
    const completed = await harness.api.collectDueReminders(at('20:33'));
    assertEqual('desktop completed task clears active work reminder session', completed.length, 0);
    assertEqual('desktop completed task leaves reminder state idle',
        (await harness.api.readReminderState()).status,
        'idle');

    const stopHarness = createDesktopReminderHarness();
    const stopFirst = await stopHarness.api.collectDueReminders(at('20:00'));
    await stopHarness.api.stopCurrentReminder(at('20:01'));
    const stoppedSameBucket = await stopHarness.api.collectDueReminders(at('20:03'));
    assertEqual('desktop stop current reminder suppresses same due session', stoppedSameBucket.length, 0);
    const stoppedNextBucket = await stopHarness.api.collectDueReminders(at('20:15'));
    assertEqual('desktop stopped reminder can resume in next due bucket', stoppedNextBucket.length, 1);
    assert('desktop stop test sent initial reminder before suppression', stopFirst.length === 1);

    const clickHarness = createDesktopReminderHarness();
    clickHarness.api.start();
    await new Promise(resolve => setTimeout(resolve, 5));
    clickHarness.click({
        key: 'reminder:aggregate:scheduled-repeat:2026-05-16:0',
        id: 'reminder:aggregate:scheduled-repeat:2026-05-16:0',
        bucket: '2026-05-16:0'
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const clickState = await clickHarness.api.readReminderState();
    assert('desktop notification click handler records execution check state',
        clickState.status === 'execution_check_waiting' && Boolean(clickState.execution_check_at));
    clickHarness.close({
        key: 'reminder:aggregate:scheduled-repeat:2026-05-16:0',
        id: 'reminder:aggregate:scheduled-repeat:2026-05-16:0',
        bucket: '2026-05-16:0'
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    assertEqual('desktop notification close after click does not undo handled state',
        (await clickHarness.api.readReminderState()).status,
        'execution_check_waiting');
    clickHarness.api.stop();
}

runDesktopAcknowledgementTests()
    .catch(error => {
        failed++;
        console.log(`  FAIL desktop acknowledgement async tests threw ${error?.message || error}`);
    })
    .finally(() => {
        console.log('\n' + '='.repeat(40));
        console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
        if (failed > 0) process.exit(1);
    });
