// Desktop reminder bridge. Chrome keeps using background alarms; Electron uses
// the shared reminder rules and schedules notifications through TimeWherePlatform.
(function initDesktopReminders(global) {
    'use strict';

    const SENT_STATE_KEY = 'timewhere_desktop_reminder_sent_v1';
    const POLL_MS = 60 * 1000;
    let timer = null;
    let running = false;

    function isDesktopPlatform() {
        return global.TimeWherePlatform?.name === 'desktop-electron';
    }

    function readSentState() {
        try {
            return JSON.parse(global.localStorage?.getItem(SENT_STATE_KEY) || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function writeSentState(state) {
        try {
            global.localStorage?.setItem(SENT_STATE_KEY, JSON.stringify(state || {}));
        } catch (_) {
            // Reminder dedupe is best-effort when localStorage is unavailable.
        }
    }

    function pruneSentState(state, now) {
        const today = global.TimeWhereReminders?.formatDateISO?.(now);
        if (!today) return state;
        const next = {};
        for (const [key, value] of Object.entries(state || {})) {
            if (String(key).includes(today)) next[key] = value;
        }
        return next;
    }

    async function collectDueReminders(now = new Date()) {
        if (!isDesktopPlatform() || !global.TimeWhereDB || !global.TimeWhereReminders || !global.TimeWhereScheduling) {
            return [];
        }
        const settings = typeof global.TimeWhereDB.getSettings === 'function'
            ? await global.TimeWhereDB.getSettings()
            : {};
        if (settings?.notification_enabled === false) return [];
        const tasks = await global.TimeWhereDB.getAllTasks?.() || [];
        const containers = await global.TimeWhereDB.getContainers?.() || [];
        const sentState = pruneSentState(readSentState(), now);
        const reminders = global.TimeWhereReminders.computeTaskReminders(
            tasks,
            containers,
            now,
            global.TimeWhereScheduling,
            sentState
        );
        for (const reminder of reminders) sentState[reminder.key] = now.toISOString();
        writeSentState(sentState);
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
        rescheduleNow().catch(error => console.warn('Desktop reminder bridge failed:', error));
        timer = global.setInterval(() => {
            rescheduleNow().catch(error => console.warn('Desktop reminder bridge failed:', error));
        }, POLL_MS);
        return { status: 'started' };
    }

    function stop() {
        if (timer) global.clearInterval(timer);
        timer = null;
        return { status: 'stopped' };
    }

    global.TimeWhereDesktopReminders = { start, stop, rescheduleNow, collectDueReminders };

    if (global.document) {
        global.document.addEventListener('DOMContentLoaded', () => {
            start();
        });
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
