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
assert('background handles notification click to Dashboard task expansion',
    background.includes('chrome.notifications?.onClicked.addListener')
    && background.includes('focus.html?task_id='));
assert('background respects notification_enabled setting',
    background.includes("settings?.notification_enabled === false"));
assert('background exposes manual test notification message',
    background.includes('TIMEWHERE_TASK_REMINDER_TEST')
    && background.includes('timewhere-test-reminder:'));
assert('background emits debug notification on every reminder tick',
    background.includes('TASK_REMINDER_DEBUG_NOTIFICATIONS')
    && background.includes('TimeWhere 检查：没有任务提醒')
    && background.includes('createTaskReminderDebugNotification(now, reminders)')
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
    desktopReminders.includes('TimeWhereReminders.computeTaskReminders')
    && desktopReminders.includes('TimeWherePlatform.reminderRuntime.rescheduleAll')
    && desktopReminders.includes('TimeWhereReminders.buildReminderNotificationPayload')
    && desktopReminders.includes('ack_at')
    && desktopReminders.includes('acknowledgeNotificationClick')
    && desktopReminders.includes("global.TimeWherePlatform?.name === 'desktop-electron'"));
assert('Electron main implements app-running reminder timers and notification click routing',
    desktopMain.includes('const reminderTimers = new Map()')
    && desktopMain.includes('const pendingNotificationClicks = []')
    && desktopMain.includes('function scheduleReminder')
    && desktopMain.includes('notification.consumePendingClicks')
    && desktopMain.includes("method === 'reminderRuntime.rescheduleAll'")
    && desktopMain.includes('sendNotificationClick(payload)')
    && desktopMain.includes('Notification.isSupported'));

function createDesktopReminderHarness() {
    let tasks = [task({ id: 'task-1', schedule_time: '20:00' })];
    let clickHandler = null;
    let scheduled = [];
    const storage = {};
    const context = {
        console,
        setInterval: () => 1,
        clearInterval: () => {},
        localStorage: {
            getItem(key) {
                return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
            },
            setItem(key, value) {
                storage[key] = String(value);
            }
        },
        TimeWhereReminders: Reminders,
        TimeWhereScheduling: Scheduling,
        TimeWhereDB: {
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
        get scheduled() {
            return scheduled;
        }
    };
}

async function runDesktopAcknowledgementTests() {
    const harness = createDesktopReminderHarness();
    const first = await harness.api.collectDueReminders(at('20:00'));
    assertEqual('desktop reminder sends first due scheduled task', first.length, 1);

    const sameBucket = await harness.api.collectDueReminders(at('20:01'));
    assertEqual('desktop reminder repeats every minute while notification is unclicked', sameBucket.length, 1);
    assertEqual('desktop minute repeat keeps same 15-minute reminder key', sameBucket[0]?.key, first[0]?.key);

    harness.api.acknowledgeNotificationClick({
        key: first[0].key,
        id: first[0].key,
        task_id: first[0].task_id,
        type: first[0].type,
        bucket: first[0].bucket
    }, at('20:02'));
    const afterAck = await harness.api.collectDueReminders(at('20:03'));
    assertEqual('desktop reminder stops in same bucket after notification click acknowledgement', afterAck.length, 0);

    const nextBucket = await harness.api.collectDueReminders(at('20:15'));
    assertEqual('desktop reminder resumes in next 15-minute bucket if task remains unfinished', nextBucket.length, 1);
    assert('desktop next bucket uses a new acknowledgement key', nextBucket[0]?.key !== first[0]?.key);

    harness.setTasks([task({ id: 'task-1', schedule_time: '20:00', progress: 'completed' })]);
    const completed = await harness.api.collectDueReminders(at('20:16'));
    assertEqual('desktop completed task does not send acknowledgement repeats', completed.length, 0);

    const clickHarness = createDesktopReminderHarness();
    clickHarness.api.start();
    clickHarness.click({
        key: 'reminder:task-1:scheduled-repeat:2026-05-16:0',
        id: 'reminder:task-1:scheduled-repeat:2026-05-16:0',
        task_id: 'task-1',
        type: 'scheduled-repeat',
        bucket: '2026-05-16:0'
    });
    const ackState = clickHarness.api.readAckState();
    assert('desktop notification click handler records acknowledgement state',
        Boolean(ackState['reminder:task-1:scheduled-repeat:2026-05-16:0']?.ack_at));
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
