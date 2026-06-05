// Desktop reminder bridge. Chrome keeps using background alarms; Electron uses
// the shared reminder rules and schedules notifications through TimeWherePlatform.
(function initDesktopReminders(global) {
    'use strict';

    const ACK_STATE_KEY = 'timewhere_desktop_reminder_ack_v1';
    const POLL_MS = 60 * 1000;
    let timer = null;
    let running = false;
    let unsubscribeNotificationClick = null;

    function isDesktopPlatform() {
        return global.TimeWherePlatform?.name === 'desktop-electron';
    }

    function readAckState() {
        try {
            return JSON.parse(global.localStorage?.getItem(ACK_STATE_KEY) || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function writeAckState(state) {
        try {
            global.localStorage?.setItem(ACK_STATE_KEY, JSON.stringify(state || {}));
        } catch (_) {
            // Reminder dedupe is best-effort when localStorage is unavailable.
        }
    }

    function pruneAckState(state, now, tasks = []) {
        const today = global.TimeWhereReminders?.formatDateISO?.(now);
        if (!today) return state;
        const eligibleTaskIds = new Set((tasks || [])
            .filter(task => global.TimeWhereReminders?.isTaskEligibleToday?.(task, now))
            .map(task => String(task.id)));
        const next = {};
        for (const [key, value] of Object.entries(state || {})) {
            if (!String(key).includes(today)) continue;
            const taskId = value?.task_id || String(key).split(':')[1];
            if (taskId && !eligibleTaskIds.has(String(taskId))) continue;
            next[key] = value;
        }
        return next;
    }

    function buildAckedSentState(state) {
        const sentState = {};
        for (const [key, value] of Object.entries(state || {})) {
            if (value?.ack_at) sentState[key] = value.ack_at;
        }
        return sentState;
    }

    function recordReminderSent(state, reminder, now) {
        const key = reminder?.key;
        if (!key) return state;
        state[key] = {
            ...(state[key] || {}),
            key,
            task_id: reminder.task_id || reminder.task?.id || null,
            type: reminder.type || null,
            bucket: reminder.bucket || null,
            sent_at: now.toISOString(),
            ack_at: state[key]?.ack_at || null
        };
        return state;
    }

    function acknowledgeNotificationClick(payload = {}, now = new Date()) {
        if (!isDesktopPlatform()) return { status: 'not_supported' };
        const key = payload.key || payload.id;
        if (!key || !String(key).startsWith('reminder:')) return { status: 'ignored' };
        const state = readAckState();
        state[key] = {
            ...(state[key] || {}),
            key,
            task_id: payload.task_id || state[key]?.task_id || null,
            type: payload.type || state[key]?.type || null,
            bucket: payload.bucket || state[key]?.bucket || null,
            sent_at: state[key]?.sent_at || null,
            ack_at: now.toISOString()
        };
        writeAckState(state);
        return { status: 'acknowledged', key };
    }

    function ensureNotificationClickHandler() {
        if (unsubscribeNotificationClick || typeof global.TimeWherePlatform?.notification?.onClick !== 'function') return;
        unsubscribeNotificationClick = global.TimeWherePlatform.notification.onClick(payload => {
            acknowledgeNotificationClick(payload);
        });
    }

    async function writeWidgetSnapshot(tasks = [], containers = [], now = new Date()) {
        if (!global.TimeWhereWidgetSnapshot?.buildWidgetSnapshot || typeof global.TimeWherePlatform?.system?.writeWidgetSnapshot !== 'function') {
            return { status: 'not_supported' };
        }
        let completedToday = null;
        try {
            if (typeof global.TimeWhereDB?.getTodayCompletedCount === 'function') {
                completedToday = await global.TimeWhereDB.getTodayCompletedCount();
            }
        } catch (_) {
            completedToday = null;
        }
        const snapshot = global.TimeWhereWidgetSnapshot.buildWidgetSnapshot({
            tasks,
            containers,
            now,
            scheduling: global.TimeWhereScheduling,
            completedToday
        });
        return await global.TimeWherePlatform.system.writeWidgetSnapshot(snapshot);
    }

    async function collectDueReminders(now = new Date()) {
        if (!isDesktopPlatform() || !global.TimeWhereDB || !global.TimeWhereReminders || !global.TimeWhereScheduling) {
            return [];
        }
        const settings = typeof global.TimeWhereDB.getSettings === 'function'
            ? await global.TimeWhereDB.getSettings()
            : {};
        const tasks = await global.TimeWhereDB.getAllTasks?.() || [];
        const containers = await global.TimeWhereDB.getContainers?.() || [];
        await writeWidgetSnapshot(tasks, containers, now);
        if (settings?.notification_enabled === false) return [];
        const ackState = pruneAckState(readAckState(), now, tasks);
        const sentState = buildAckedSentState(ackState);
        const reminders = global.TimeWhereReminders.computeTaskReminders(
            tasks,
            containers,
            now,
            global.TimeWhereScheduling,
            sentState
        );
        for (const reminder of reminders) recordReminderSent(ackState, reminder, now);
        writeAckState(ackState);
        return reminders;
    }

    function toScheduledReminder(reminder) {
        const notification = global.TimeWhereReminders.buildReminderNotificationPayload(reminder);
        const taskId = reminder?.task_id || reminder?.task?.id || null;
        return {
            id: reminder.key,
            when: Date.now() + 250,
            title: notification.title,
            message: notification.message,
            notification,
            key: reminder.key,
            type: reminder.type,
            bucket: reminder.bucket,
            task_id: taskId,
            route: taskId ? `pages/focus/focus.html?task_id=${encodeURIComponent(taskId)}` : 'pages/focus/focus.html'
        };
    }

    async function rescheduleNow() {
        if (!isDesktopPlatform() || running) return { status: 'not_supported' };
        running = true;
        try {
            const due = await collectDueReminders(new Date());
            const scheduled = due.map(toScheduledReminder);
            if (global.TimeWherePlatform?.reminderRuntime?.rescheduleAll) {
                return await global.TimeWherePlatform.reminderRuntime.rescheduleAll(scheduled);
            }
            return { status: 'not_supported' };
        } finally {
            running = false;
        }
    }

    function start() {
        if (!isDesktopPlatform() || timer) return { status: 'not_started' };
        ensureNotificationClickHandler();
        rescheduleNow().catch(error => console.warn('Desktop reminder bridge failed:', error));
        timer = global.setInterval(() => {
            rescheduleNow().catch(error => console.warn('Desktop reminder bridge failed:', error));
        }, POLL_MS);
        return { status: 'started' };
    }

    function stop() {
        if (timer) global.clearInterval(timer);
        if (unsubscribeNotificationClick) unsubscribeNotificationClick();
        unsubscribeNotificationClick = null;
        timer = null;
        return { status: 'stopped' };
    }

    global.TimeWhereDesktopReminders = {
        start,
        stop,
        rescheduleNow,
        collectDueReminders,
        acknowledgeNotificationClick,
        writeWidgetSnapshot,
        readAckState
    };

    if (global.document) {
        global.document.addEventListener('DOMContentLoaded', () => {
            start();
        });
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
