/**
 * TimeWhere Background Service Worker
 * 版本: v2.0
 * 日期: 2026-04-02
 */

importScripts('shared/js/scheduling.js', 'shared/js/reminders.js');

const TASK_REMINDER_ALARM = 'timewhere-task-reminder-tick';
const TASK_REMINDER_SENT_KEY = 'timewhere_task_reminder_sent';
const TASK_REMINDER_ALARM_PERIOD_MINUTES = 1;
const TASK_REMINDER_DEBUG_NOTIFICATIONS = false;
const TASK_REMINDER_DIAGNOSTIC_ALARM = 'timewhere-task-reminder-diagnostic';
const TASK_REMINDER_DIAGNOSTIC_DELAY_MINUTES = 0.5;
const TASK_REMINDER_DIAGNOSTIC_STATE_KEY = 'timewhere_task_reminder_diagnostic_state';
const TIMEWHERE_DB_VERSION = 5;
const DAILY_JOURNAL_SNAPSHOT_ALARM = 'timewhere-daily-journal-snapshot';
const DAILY_JOURNAL_PROMPT_ALARM = 'timewhere-daily-journal-prompt';
const DAILY_JOURNAL_SNAPSHOT_HOUR = 6;
const DAILY_JOURNAL_PROMPT_HOUR = 21;
const DAILY_JOURNAL_PROMPT_MINUTE = 30;

chrome.runtime.onInstalled.addListener(async (details) => {
    await configureSidePanel();
    await bootstrapTaskReminders();
    await bootstrapDailyJournal();
    if (details.reason === 'install') {
        await initializeOnFirstInstall();
    }
});

chrome.runtime.onStartup.addListener(() => {
    configureSidePanel();
    bootstrapTaskReminders();
    bootstrapDailyJournal();
});

configureSidePanel();
bootstrapTaskReminders();
bootstrapDailyJournal();

async function configureSidePanel() {
    if (!chrome.sidePanel?.setPanelBehavior) return;
    try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (error) {
        console.warn('TimeWhere: side panel behavior setup skipped', error);
    }
}

async function initializeOnFirstInstall() {
    try {
        const response = await fetch(chrome.runtime.getURL('shared/js/db.js'));
        if (response.ok) {
            console.log('TimeWhere: Extension installed successfully');
        }
    } catch (e) {
        console.error('TimeWhere: Failed to initialize', e);
    }
}

async function ensureTaskReminderAlarm() {
    if (!chrome.alarms) return;
    await createAlarm(TASK_REMINDER_ALARM, {
        delayInMinutes: TASK_REMINDER_ALARM_PERIOD_MINUTES,
        periodInMinutes: TASK_REMINDER_ALARM_PERIOD_MINUTES
    });
    const alarm = await getAlarm(TASK_REMINDER_ALARM);
    if (!alarm) throw new Error('Task reminder alarm was not registered');
    return normalizeAlarm(alarm);
}

async function bootstrapTaskReminders() {
    try {
        await ensureTaskReminderAlarm();
        await runTaskReminderTick();
    } catch (error) {
        console.warn('TimeWhere: task reminder bootstrap skipped', error);
    }
}

async function bootstrapDailyJournal() {
    try {
        await ensureDailyJournalAlarms();
        await ensureTodayDailyJournalSnapshot();
    } catch (error) {
        console.warn('TimeWhere: daily journal bootstrap skipped', error);
    }
}

function readChromeLastError() {
    return chrome.runtime?.lastError?.message || '';
}

function createAlarm(name, alarmInfo) {
    return new Promise((resolve, reject) => {
        chrome.alarms.create(name, alarmInfo, () => {
            const error = readChromeLastError();
            if (error) reject(new Error(error));
            else resolve();
        });
    });
}

function getAlarm(name) {
    return new Promise((resolve, reject) => {
        chrome.alarms.get(name, alarm => {
            const error = readChromeLastError();
            if (error) reject(new Error(error));
            else resolve(alarm || null);
        });
    });
}

function getAllAlarms() {
    return new Promise((resolve, reject) => {
        chrome.alarms.getAll(alarms => {
            const error = readChromeLastError();
            if (error) reject(new Error(error));
            else resolve(alarms || []);
        });
    });
}

function nextDailyAlarmTime(hour, minute = 0, now = new Date()) {
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime();
}

async function ensureDailyJournalAlarms() {
    if (!chrome.alarms) return {};
    await createAlarm(DAILY_JOURNAL_SNAPSHOT_ALARM, {
        when: nextDailyAlarmTime(DAILY_JOURNAL_SNAPSHOT_HOUR),
        periodInMinutes: 24 * 60
    });
    await createAlarm(DAILY_JOURNAL_PROMPT_ALARM, {
        when: nextDailyAlarmTime(DAILY_JOURNAL_PROMPT_HOUR, DAILY_JOURNAL_PROMPT_MINUTE),
        periodInMinutes: 24 * 60
    });
    return {
        snapshot: normalizeAlarm(await getAlarm(DAILY_JOURNAL_SNAPSHOT_ALARM)),
        prompt: normalizeAlarm(await getAlarm(DAILY_JOURNAL_PROMPT_ALARM))
    };
}

function normalizeAlarm(alarm) {
    if (!alarm) return null;
    return {
        name: alarm.name,
        scheduledTime: alarm.scheduledTime,
        periodInMinutes: alarm.periodInMinutes
    };
}

async function getTaskReminderStatus() {
    const alarm = chrome.alarms ? await getAlarm(TASK_REMINDER_ALARM) : null;
    const allAlarms = chrome.alarms ? await getAllAlarms() : [];
    const diagnostic = chrome.storage?.local
        ? (await chrome.storage.local.get(TASK_REMINDER_DIAGNOSTIC_STATE_KEY))[TASK_REMINDER_DIAGNOSTIC_STATE_KEY] || null
        : null;
    return {
        alarm: normalizeAlarm(alarm),
        alarms: allAlarms.map(normalizeAlarm),
        diagnostic,
        alarmName: TASK_REMINDER_ALARM,
        periodInMinutes: TASK_REMINDER_ALARM_PERIOD_MINUTES
    };
}

function openTimeWhereDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('TimeWhere', TIMEWHERE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('daily_journals')) {
                const store = db.createObjectStore('daily_journals', { keyPath: 'date' });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('updated_at', 'updated_at', { unique: false });
                store.createIndex('submitted_at', 'submitted_at', { unique: false });
                store.createIndex('snapshot_at', 'snapshot_at', { unique: false });
            }
        };
        request.onerror = () => reject(request.error || new Error('Failed to open TimeWhere DB'));
        request.onsuccess = () => resolve(request.result);
    });
}

async function openExistingTimeWhereDB() {
    if (typeof indexedDB.databases === 'function') {
        const databases = await indexedDB.databases();
        if (!databases.some(database => database.name === 'TimeWhere')) return null;
    }
    try {
        return await openTimeWhereDB();
    } catch (error) {
        if (String(error?.name || error?.message || '').includes('Version')) {
            return await new Promise((resolve, reject) => {
                const request = indexedDB.open('TimeWhere');
                request.onerror = () => reject(request.error || new Error('Failed to open TimeWhere DB'));
                request.onsuccess = () => resolve(request.result);
            });
        }
        throw error;
    }
}

function getAllFromStore(db, storeName) {
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(storeName)) {
            resolve([]);
            return;
        }
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).getAll();
        request.onerror = () => reject(request.error || new Error(`Failed to read ${storeName}`));
        request.onsuccess = () => resolve(request.result || []);
    });
}

function getFromStore(db, storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains(storeName)) {
            resolve(null);
            return;
        }
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(key);
        request.onerror = () => reject(request.error || new Error(`Failed to read ${storeName}`));
        request.onsuccess = () => resolve(request.result || null);
    });
}

function putToStore(db, storeName, value) {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains(storeName)) {
            resolve(false);
            return;
        }
        const tx = db.transaction(storeName, 'readwrite');
        const request = tx.objectStore(storeName).put(value);
        request.onerror = () => reject(request.error || new Error(`Failed to write ${storeName}`));
        request.onsuccess = () => resolve(true);
    });
}

async function readReminderData() {
    if (typeof indexedDB.databases === 'function') {
        const databases = await indexedDB.databases();
        if (!databases.some(database => database.name === 'TimeWhere')) {
            return { tasks: [], containers: [] };
        }
    }
    const db = await openExistingTimeWhereDB();
    if (!db) return { tasks: [], containers: [], settings: {} };
    try {
        const [tasks, containers, plans, settingsRows] = await Promise.all([
            getAllFromStore(db, 'tasks'),
            getAllFromStore(db, 'containers'),
            getAllFromStore(db, 'plans'),
            getAllFromStore(db, 'settings')
        ]);
        const planById = new Map((plans || []).map(plan => [plan.id, plan]));
        const enrichedTasks = (tasks || []).map(task => ({
            ...task,
            plan_name: planById.get(task.plan_id)?.name || task.plan_name || null
        }));
        const settings = Object.fromEntries((settingsRows || []).map(row => [row.key, row.value]));
        return { tasks: enrichedTasks, containers, settings };
    } finally {
        db.close();
    }
}

function createJournalTaskSnapshot(task) {
    return {
        id: task.id,
        title: task.title || '',
        plan_id: task.plan_id || null,
        bucket_id: task.bucket_id || null,
        subject: task.subject || null,
        start_date: task.start_date || null,
        due_date: task.due_date || task.deadline || null,
        progress: task.progress || task.status || 'not_started',
        priority: task.priority || 'medium',
        completed_at: task.completed_at || null,
        source: task.source || null,
        source_uid: task.source_uid || null,
        duration: task.duration || null,
        schedule_time: task.schedule_time || null
    };
}

function buildDailyJournalPoolSnapshot(tasks, date, now) {
    return (tasks || [])
        .filter(task => task.progress !== 'completed')
        .filter(task => task.start_date == null || task.start_date <= date)
        .filter(task => task.deferred_until == null || new Date(task.deferred_until) <= now)
        .map(createJournalTaskSnapshot);
}

async function ensureTodayDailyJournalSnapshot(now = new Date()) {
    if (now.getHours() < DAILY_JOURNAL_SNAPSHOT_HOUR) {
        return { status: 'too_early' };
    }
    const date = formatDateISOFallback(now);
    const db = await openExistingTimeWhereDB();
    if (!db) return { status: 'no_db' };
    try {
        const existing = await getFromStore(db, 'daily_journals', date);
        if (existing?.snapshot_at && Array.isArray(existing.planned_task_snapshots)) {
            return { status: 'exists', journal: existing };
        }
        const tasks = await getAllFromStore(db, 'tasks');
        const nowISO = now.toISOString();
        const journal = {
            ...(existing || {}),
            date,
            status: existing?.status || 'snapshot',
            planned_task_snapshots: tasks
                .filter(task => task.start_date === date)
                .map(createJournalTaskSnapshot),
            daily_pool_snapshots: buildDailyJournalPoolSnapshot(tasks, date, now),
            completed_task_snapshots: existing?.completed_task_snapshots || [],
            delayed_task_snapshots: existing?.delayed_task_snapshots || [],
            extra_done_task_snapshots: existing?.extra_done_task_snapshots || [],
            planned_notes: existing?.planned_notes || '',
            delayed_notes: existing?.delayed_notes || '',
            extra_done_notes: existing?.extra_done_notes || '',
            general_notes: existing?.general_notes || '',
            snapshot_at: nowISO,
            created_at: existing?.created_at || nowISO,
            updated_at: nowISO,
            submitted_at: existing?.submitted_at || null
        };
        await putToStore(db, 'daily_journals', journal);
        return { status: 'created', journal };
    } finally {
        db.close();
    }
}

async function createDailyJournalPromptNotification(now = new Date()) {
    if (!chrome.notifications) return { sent: false, reason: 'notifications_unavailable' };
    const date = formatDateISOFallback(now);
    const db = await openExistingTimeWhereDB();
    if (!db) return { sent: false, reason: 'no_db' };
    try {
        const settingsRows = await getAllFromStore(db, 'settings');
        const settings = Object.fromEntries((settingsRows || []).map(row => [row.key, row.value]));
        if (settings?.notification_enabled === false) return { sent: false, reason: 'disabled' };
        const journal = await getFromStore(db, 'daily_journals', date);
        if (journal?.status === 'submitted') return { sent: false, reason: 'submitted' };
        const payload = {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            priority: 1,
            requireInteraction: true,
            title: 'TimeWhere 今日总结',
            message: '整理今天计划完成、实际完成和延误说明。'
        };
        await chrome.notifications.create(`timewhere-daily-journal:${date}`, payload);
        return { sent: true, date };
    } finally {
        db.close();
    }
}

function getTodayContainers(containers, now) {
    const S = globalThis.TimeWhereScheduling;
    const todayStr = S.formatDateISO ? S.formatDateISO(now) : formatDateISOFallback(now);
    const dateObj = new Date(`${todayStr}T00:00:00`);
    const dow = dateObj.getDay();
    const isWeekday = dow >= 1 && dow <= 5;
    const isWeekend = dow === 0 || dow === 6;
    return (containers || [])
        .filter(container => container.enabled !== false)
        .filter(container => S.containerAppliesToDate(container, dateObj, todayStr, dow, isWeekday, isWeekend));
}

function formatDateISOFallback(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function getReminderSentState() {
    const result = await chrome.storage.local.get(TASK_REMINDER_SENT_KEY);
    return result[TASK_REMINDER_SENT_KEY] || {};
}

async function saveReminderSentState(sentState, now) {
    const todayPrefix = formatDateISOFallback(now);
    const compact = {};
    for (const [key, value] of Object.entries(sentState || {})) {
        if (String(key).includes(todayPrefix)) compact[key] = value;
    }
    await chrome.storage.local.set({ [TASK_REMINDER_SENT_KEY]: compact });
}

async function createTaskReminderNotification(reminder) {
    const payload = globalThis.TimeWhereReminders.buildReminderNotificationPayload(reminder);
    if (payload.iconUrl && !/^https?:|^chrome-extension:/i.test(payload.iconUrl)) {
        payload.iconUrl = chrome.runtime.getURL(payload.iconUrl);
    }
    const notificationId = `timewhere-task:${reminder.task_id}:${reminder.type}:${reminder.bucket}`;
    await chrome.notifications.create(notificationId, payload);
}

function formatClockTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function createTaskReminderDebugNotification(now, reminders, reason = '') {
    if (!TASK_REMINDER_DEBUG_NOTIFICATIONS || !chrome.notifications) return;
    const checkedAt = formatClockTime(now);
    const payload = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        priority: 1,
        requireInteraction: true,
        title: reminders.length
            ? `TimeWhere 检查：命中 ${reminders.length} 个任务`
            : 'TimeWhere 检查：没有任务提醒',
        message: reminders.length
            ? `${checkedAt} · ${reminders.slice(0, 5).map(reminder => `${reminder.type}：${reminder.task?.title || '无标题任务'}`).join('；')}`
            : `${checkedAt} · ${reason || 'alarm 已触发，但没有符合当前提醒规则的任务。请检查任务是否未完成、start_date 是否为今天或更早、schedule_time 是否在当前提醒窗口。'}`
    };
    await chrome.notifications.create(`timewhere-debug-reminder:${Date.now()}`, payload);
}

async function createTaskReminderAlarmEventNotification(alarm) {
    if (!chrome.notifications) return;
    const payload = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        priority: 2,
        requireInteraction: true,
        title: 'TimeWhere 诊断：alarm 事件已触发',
        message: `${formatClockTime(new Date())} · ${alarm?.name || 'unknown alarm'}`
    };
    await chrome.notifications.create(`timewhere-alarm-event:${Date.now()}`, payload);
}

async function createDiagnosticAlarm() {
    await createAlarm(TASK_REMINDER_DIAGNOSTIC_ALARM, {
        delayInMinutes: TASK_REMINDER_DIAGNOSTIC_DELAY_MINUTES
    });
    const alarm = normalizeAlarm(await getAlarm(TASK_REMINDER_DIAGNOSTIC_ALARM));
    if (chrome.storage?.local) {
        await chrome.storage.local.set({
            [TASK_REMINDER_DIAGNOSTIC_STATE_KEY]: {
                status: 'scheduled',
                scheduledTime: alarm?.scheduledTime || null,
                scheduledAt: new Date().toISOString()
            }
        });
    }
    return alarm;
}

async function createTaskReminderTestNotification() {
    const alarm = await ensureTaskReminderAlarm();
    const diagnosticAlarm = await createDiagnosticAlarm();
    const payload = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: '当前任务提醒：测试提醒',
        message: '系统通知测试 · TimeWhere · 点击打开 Dashboard',
        priority: 2,
        requireInteraction: true
    };
    await chrome.notifications.create(`timewhere-test-reminder:${Date.now()}`, payload);
    return { alarm, diagnosticAlarm };
}

async function runTaskReminderTick(now = new Date()) {
    if (!chrome.notifications || !chrome.storage?.local) return { sent: 0, skipped: true };
    const { tasks, containers, settings } = await readReminderData();
    if (settings?.notification_enabled === false) {
        await createTaskReminderDebugNotification(now, [], '系统任务提醒已关闭');
        return { sent: 0, skipped: true, reason: 'disabled' };
    }
    const todayContainers = getTodayContainers(containers, now);
    const sentState = await getReminderSentState();
    const reminders = globalThis.TimeWhereReminders.computeTaskReminders(
        tasks,
        todayContainers,
        now,
        globalThis.TimeWhereScheduling,
        sentState
    );

    for (const reminder of reminders) {
        await createTaskReminderNotification(reminder);
        sentState[reminder.key] = new Date().toISOString();
    }
    await saveReminderSentState(sentState, now);
    await createTaskReminderDebugNotification(now, reminders);
    return { sent: reminders.length };
}

function isAllowedManageBacIcsUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const host = url.hostname.toLowerCase();
        const isManageBacHost = host === 'managebac.com' ||
            host.endsWith('.managebac.com') ||
            host === 'managebac.cn' ||
            host.endsWith('.managebac.cn');
        return url.protocol === 'https:' &&
            isManageBacHost &&
            /\/student\/events\//i.test(url.pathname);
    } catch (_) {
        return false;
    }
}

async function fetchManageBacIcs(url) {
    if (!isAllowedManageBacIcsUrl(url)) {
        throw new Error('Unsupported ManageBac ICS subscription host or path');
    }
    let response;
    try {
        response = await fetch(url, { cache: 'no-store' });
    } catch (_) {
        throw new Error('无法读取 ManageBac ICS link，请检查链接是否有效、网络是否可访问。');
    }
    if (!response.ok) {
        throw new Error(`ICS request failed: HTTP ${response.status}`);
    }
    return await response.text();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'TIMEWHERE_MANAGEBAC_FETCH_ICS') {
        fetchManageBacIcs(message.url)
            .then(text => sendResponse({ ok: true, text }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message?.type === 'TIMEWHERE_TASK_REMINDER_TEST') {
        createTaskReminderTestNotification()
            .then(status => sendResponse({ ok: true, ...status }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message?.type === 'TIMEWHERE_TASK_REMINDER_ENSURE') {
        ensureTaskReminderAlarm()
            .then(alarm => sendResponse({ ok: true, alarm }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message?.type === 'TIMEWHERE_TASK_REMINDER_STATUS') {
        getTaskReminderStatus()
            .then(status => sendResponse({ ok: true, ...status }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message?.type === 'TIMEWHERE_DAILY_JOURNAL_ENSURE') {
        ensureDailyJournalAlarms()
            .then(status => sendResponse({ ok: true, ...status }))
            .catch(error => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (message.action === 'getStatus') {
        sendResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }

    if (message.action === 'openPage') {
        const page = message.page || 'focus';
        chrome.tabs.create({
            url: `pages/${page}/${page}.html`
        });
        sendResponse({ success: true });
    }
    
    return false;
});

chrome.alarms?.onAlarm.addListener(alarm => {
    if (alarm?.name === TASK_REMINDER_DIAGNOSTIC_ALARM) {
        chrome.storage?.local?.set({
            [TASK_REMINDER_DIAGNOSTIC_STATE_KEY]: {
                status: 'fired',
                alarmName: alarm.name,
                firedAt: new Date().toISOString()
            }
        });
        createTaskReminderAlarmEventNotification(alarm).catch(error => {
            console.error('TimeWhere: diagnostic alarm notification failed', error);
        });
        return;
    }
    if (alarm?.name === DAILY_JOURNAL_SNAPSHOT_ALARM) {
        ensureTodayDailyJournalSnapshot().catch(error => {
            console.error('TimeWhere: daily journal snapshot failed', error);
        });
        return;
    }
    if (alarm?.name === DAILY_JOURNAL_PROMPT_ALARM) {
        ensureTodayDailyJournalSnapshot()
            .then(() => createDailyJournalPromptNotification())
            .catch(error => {
                console.error('TimeWhere: daily journal prompt failed', error);
            });
        return;
    }
    if (alarm?.name !== TASK_REMINDER_ALARM) return;
    runTaskReminderTick().catch(error => {
        console.error('TimeWhere: task reminder tick failed', error);
    });
});

chrome.notifications?.onClicked.addListener(notificationId => {
    if (notificationId.startsWith('timewhere-test-reminder:')) {
        chrome.tabs.create({ url: 'pages/focus/focus.html' });
        return;
    }
    if (notificationId.startsWith('timewhere-daily-journal:')) {
        const [, date] = notificationId.split(':');
        chrome.tabs.create({
            url: `pages/focus/focus.html?journal_date=${encodeURIComponent(date || formatDateISOFallback(new Date()))}`
        });
        return;
    }
    if (!notificationId.startsWith('timewhere-task:')) return;
    const [, taskId] = notificationId.split(':');
    chrome.tabs.create({
        url: `pages/focus/focus.html?task_id=${encodeURIComponent(taskId)}`
    });
});
