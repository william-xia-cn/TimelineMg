/**
 * TimeWhere Background Service Worker
 * 版本: v2.0
 * 日期: 2026-04-02
 */

importScripts('shared/js/scheduling.js', 'shared/js/reminders.js');

const TASK_REMINDER_ALARM = 'timewhere-task-reminder-tick';
const TASK_REMINDER_SENT_KEY = 'timewhere_task_reminder_sent';

chrome.runtime.onInstalled.addListener(async (details) => {
    await bootstrapTaskReminders();
    if (details.reason === 'install') {
        await initializeOnFirstInstall();
    }
});

chrome.runtime.onStartup.addListener(() => {
    bootstrapTaskReminders();
});

bootstrapTaskReminders();

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
    await chrome.alarms.create(TASK_REMINDER_ALARM, { periodInMinutes: 1 });
}

async function bootstrapTaskReminders() {
    try {
        await ensureTaskReminderAlarm();
        await runTaskReminderTick();
    } catch (error) {
        console.warn('TimeWhere: task reminder bootstrap skipped', error);
    }
}

function openTimeWhereDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('TimeWhere');
        request.onerror = () => reject(request.error || new Error('Failed to open TimeWhere DB'));
        request.onsuccess = () => resolve(request.result);
    });
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

async function readReminderData() {
    if (typeof indexedDB.databases === 'function') {
        const databases = await indexedDB.databases();
        if (!databases.some(database => database.name === 'TimeWhere')) {
            return { tasks: [], containers: [] };
        }
    }
    const db = await openTimeWhereDB();
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

async function createTaskReminderTestNotification() {
    const payload = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: '当前任务提醒：测试提醒',
        message: '系统通知测试 · TimeWhere · 点击打开 Dashboard',
        priority: 2
    };
    await chrome.notifications.create(`timewhere-test-reminder:${Date.now()}`, payload);
}

async function runTaskReminderTick(now = new Date()) {
    if (!chrome.notifications || !chrome.storage?.local) return { sent: 0, skipped: true };
    const { tasks, containers, settings } = await readReminderData();
    if (settings?.notification_enabled === false) return { sent: 0, skipped: true, reason: 'disabled' };
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
            .then(() => sendResponse({ ok: true }))
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
    if (!notificationId.startsWith('timewhere-task:')) return;
    const [, taskId] = notificationId.split(':');
    chrome.tabs.create({
        url: `pages/focus/focus.html?task_id=${encodeURIComponent(taskId)}`
    });
});
