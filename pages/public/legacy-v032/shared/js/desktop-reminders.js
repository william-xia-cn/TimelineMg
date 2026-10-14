// Desktop work reminder bridge. Chrome keeps using background alarms; Electron
// uses shared due-work rules plus a Desktop-only reminder session state machine.
(function initDesktopReminders(global) {
    'use strict';

    const STATE_KEY = 'desktop_work_reminder_state_v1';
    const POLL_MS = 60 * 1000;
    const RENOTIFY_COOLDOWN_MS = 60 * 1000;
    const EXECUTION_CHECK_MS = 30 * 60 * 1000;

    let timer = null;
    let running = false;
    let unsubscribeNotificationClick = null;
    let unsubscribeNotificationClose = null;

    function isDesktopPlatform() {
        return global.TimeWherePlatform?.name === 'desktop-electron';
    }

    function nowISO(now = new Date()) {
        return now.toISOString();
    }

    function parseTime(value) {
        if (!value) return null;
        const time = new Date(value).getTime();
        return Number.isFinite(time) ? time : null;
    }

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function createSessionId(now = new Date()) {
        const randomPart = Math.random().toString(36).slice(2, 8);
        return `desktop-work-reminder:${now.getTime()}:${randomPart}`;
    }

    function getReminderKey(payload = {}) {
        return payload.key || payload.id || payload.due_key || '';
    }

    function isReminderPayload(payload = {}) {
        return String(getReminderKey(payload)).startsWith('reminder:');
    }

    function getTaskIdsSignature(taskIds = []) {
        return (taskIds || [])
            .map(id => String(id))
            .filter(Boolean)
            .sort()
            .join('|');
    }

    function normalizeState(value = {}) {
        const state = value && typeof value === 'object' ? clone(value) : {};
        return {
            schema: STATE_KEY,
            session_id: state.session_id || null,
            status: state.status || 'idle',
            due_key: state.due_key || null,
            bucket: state.bucket || null,
            phase: state.phase || null,
            created_at: state.created_at || null,
            last_notified_at: state.last_notified_at || null,
            notification_closed_at: state.notification_closed_at || null,
            handled_at: state.handled_at || null,
            execution_check_at: state.execution_check_at || null,
            task_ids: Array.isArray(state.task_ids) ? state.task_ids.map(id => String(id)) : [],
            items: Array.isArray(state.items) ? state.items : [],
            total_count: Number(state.total_count) || 0,
            cooldown_until: state.cooldown_until || null,
            stopped_at: state.stopped_at || null,
            stop_reason: state.stop_reason || null
        };
    }

    async function readReminderState() {
        try {
            if (typeof global.TimeWhereDB?.getSetting === 'function') {
                const dbValue = await global.TimeWhereDB.getSetting(STATE_KEY);
                if (dbValue != null) return normalizeState(dbValue);
            }
        } catch (_) {
            // Fall through to localStorage as a best-effort fallback.
        }
        try {
            return normalizeState(JSON.parse(global.localStorage?.getItem(STATE_KEY) || '{}') || {});
        } catch (_) {
            return normalizeState();
        }
    }

    function emitReminderState(state) {
        try {
            global.dispatchEvent?.(new CustomEvent('timewhere-desktop-reminder-state', {
                detail: { state: clone(state) }
            }));
        } catch (_) {
            // UI hints are best-effort; persisted state remains authoritative.
        }
    }

    async function writeReminderState(state) {
        const normalized = normalizeState(state);
        try {
            if (typeof global.TimeWhereDB?.setSetting === 'function') {
                await global.TimeWhereDB.setSetting(STATE_KEY, normalized);
                emitReminderState(normalized);
                return normalized;
            }
        } catch (_) {
            // Fall through to localStorage when DB is temporarily unavailable.
        }
        try {
            global.localStorage?.setItem(STATE_KEY, JSON.stringify(normalized));
        } catch (_) {
            // Reminder state is best-effort when local storage is unavailable.
        }
        emitReminderState(normalized);
        return normalized;
    }

    function buildIdleState(now = new Date(), reason = 'no_due_work') {
        return {
            schema: STATE_KEY,
            status: 'idle',
            session_id: null,
            due_key: null,
            bucket: null,
            phase: null,
            created_at: null,
            last_notified_at: null,
            notification_closed_at: null,
            handled_at: null,
            execution_check_at: null,
            task_ids: [],
            items: [],
            total_count: 0,
            cooldown_until: null,
            stopped_at: null,
            stop_reason: reason,
            updated_at: nowISO(now)
        };
    }

    function buildNotificationState(previousState, reminder, now = new Date(), phase = 'due') {
        const previous = normalizeState(previousState);
        const taskIds = (reminder.task_ids || [])
            .map(id => String(id))
            .filter(Boolean);
        const createdAt = previous.session_id ? previous.created_at : nowISO(now);
        return {
            ...previous,
            schema: STATE_KEY,
            session_id: previous.session_id || createSessionId(now),
            status: 'notification_visible',
            due_key: reminder.key || null,
            bucket: reminder.bucket || null,
            phase,
            created_at: createdAt,
            last_notified_at: nowISO(now),
            notification_closed_at: null,
            handled_at: null,
            execution_check_at: null,
            task_ids: taskIds,
            items: Array.isArray(reminder.items) ? reminder.items : [],
            total_count: Number(reminder.total_count) || taskIds.length || 1,
            cooldown_until: null,
            stopped_at: null,
            stop_reason: null,
            updated_at: nowISO(now)
        };
    }

    function isSameDueKey(state, reminder) {
        return Boolean(state?.due_key && reminder?.key && String(state.due_key) === String(reminder.key));
    }

    function isSameTaskSet(state, reminder) {
        return getTaskIdsSignature(state?.task_ids) === getTaskIdsSignature(reminder?.task_ids);
    }

    async function acknowledgeNotificationClick(payload = {}, now = new Date()) {
        if (!isDesktopPlatform()) return { status: 'not_supported' };
        if (!isReminderPayload(payload)) return { status: 'ignored' };
        const state = await readReminderState();
        const key = getReminderKey(payload);
        const taskIds = Array.isArray(payload.task_ids) && payload.task_ids.length
            ? payload.task_ids.map(id => String(id))
            : state.task_ids;
        const next = {
            ...state,
            schema: STATE_KEY,
            session_id: state.session_id || createSessionId(now),
            status: 'execution_check_waiting',
            due_key: state.due_key || key,
            bucket: state.bucket || payload.bucket || null,
            phase: 'execution_check_waiting',
            created_at: state.created_at || nowISO(now),
            handled_at: nowISO(now),
            execution_check_at: new Date(now.getTime() + EXECUTION_CHECK_MS).toISOString(),
            notification_closed_at: null,
            cooldown_until: null,
            task_ids: taskIds,
            items: Array.isArray(payload.items) && payload.items.length ? payload.items : state.items,
            total_count: Number(payload.total_count) || state.total_count || taskIds.length || 1,
            updated_at: nowISO(now)
        };
        await writeReminderState(next);
        return { status: 'handled', key: next.due_key, execution_check_at: next.execution_check_at };
    }

    async function handleNotificationClosed(payload = {}, now = new Date()) {
        if (!isDesktopPlatform()) return { status: 'not_supported' };
        if (!isReminderPayload(payload)) return { status: 'ignored' };
        const state = await readReminderState();
        const key = getReminderKey(payload);
        if (state.status !== 'notification_visible') return { status: 'ignored', reason: 'not_visible' };
        if (state.due_key && key && String(state.due_key) !== String(key)) {
            return { status: 'ignored', reason: 'stale_notification' };
        }
        const next = {
            ...state,
            status: 'renotify_waiting',
            phase: state.phase || 'due',
            notification_closed_at: nowISO(now),
            cooldown_until: new Date(now.getTime() + RENOTIFY_COOLDOWN_MS).toISOString(),
            updated_at: nowISO(now)
        };
        await writeReminderState(next);
        return { status: 'closed', key: state.due_key, cooldown_until: next.cooldown_until };
    }

    async function stopCurrentReminder(now = new Date(), reason = 'user_stopped') {
        if (!isDesktopPlatform()) return { status: 'not_supported' };
        const state = await readReminderState();
        if (!state.session_id && state.status === 'idle') {
            return { status: 'no_active_reminder' };
        }
        const next = {
            ...state,
            status: 'stopped',
            phase: 'stopped',
            stopped_at: nowISO(now),
            stop_reason: reason,
            cooldown_until: null,
            notification_closed_at: null,
            updated_at: nowISO(now)
        };
        await writeReminderState(next);
        return { status: 'stopped', session_id: next.session_id };
    }

    function ensureNotificationHandlers() {
        if (!unsubscribeNotificationClick && typeof global.TimeWherePlatform?.notification?.onClick === 'function') {
            unsubscribeNotificationClick = global.TimeWherePlatform.notification.onClick(payload => {
                acknowledgeNotificationClick(payload).catch(error => {
                    console.warn('Desktop reminder click handling failed:', error);
                });
            });
        }
        if (!unsubscribeNotificationClose && typeof global.TimeWherePlatform?.notification?.onClose === 'function') {
            unsubscribeNotificationClose = global.TimeWherePlatform.notification.onClose(payload => {
                handleNotificationClosed(payload).catch(error => {
                    console.warn('Desktop reminder close handling failed:', error);
                });
            });
        }
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

    async function computeCurrentAggregate(now = new Date()) {
        const tasks = await global.TimeWhereDB.getAllTasks?.() || [];
        const containers = await global.TimeWhereDB.getContainers?.() || [];
        await writeWidgetSnapshot(tasks, containers, now);
        const reminder = global.TimeWhereReminders.computeAggregatedReminder(
            tasks,
            containers,
            now,
            global.TimeWhereScheduling,
            {}
        );
        return { reminder, tasks, containers };
    }

    async function collectDueReminders(now = new Date()) {
        if (!isDesktopPlatform() || !global.TimeWhereDB || !global.TimeWhereReminders || !global.TimeWhereScheduling) {
            return [];
        }
        const settings = typeof global.TimeWhereDB.getSettings === 'function'
            ? await global.TimeWhereDB.getSettings()
            : {};
        const { reminder } = await computeCurrentAggregate(now);
        if (settings?.notification_enabled === false) return [];

        const state = await readReminderState();
        if (!reminder) {
            if (state.status !== 'idle') await writeReminderState(buildIdleState(now));
            return [];
        }

        if (state.status === 'execution_check_waiting') {
            const checkAt = parseTime(state.execution_check_at);
            if (checkAt && now.getTime() < checkAt) return [];
            const next = buildNotificationState(state, reminder, now, 'execution_check');
            await writeReminderState(next);
            return [reminder];
        }

        if (state.status === 'notification_visible') {
            return [];
        }

        if (state.status === 'renotify_waiting') {
            const cooldownUntil = parseTime(state.cooldown_until);
            if (cooldownUntil && now.getTime() < cooldownUntil) return [];
            const next = buildNotificationState(state, reminder, now, state.phase || 'due');
            await writeReminderState(next);
            return [reminder];
        }

        if (state.status === 'stopped' && isSameDueKey(state, reminder) && isSameTaskSet(state, reminder)) {
            return [];
        }

        const next = buildNotificationState(
            state.status === 'idle' ? {} : state,
            reminder,
            now,
            'due'
        );
        await writeReminderState(next);
        return [reminder];
    }

    function toScheduledReminder(reminder) {
        const notification = global.TimeWhereReminders.buildReminderNotificationPayload(reminder);
        return {
            id: reminder.key,
            when: Date.now() + 250,
            title: notification.title,
            message: notification.message,
            notification,
            key: reminder.key,
            type: 'work-reminder',
            reminder_type: reminder.type,
            bucket: reminder.bucket,
            total_count: reminder.total_count || 1,
            task_ids: reminder.task_ids || [],
            items: reminder.items || [],
            route: 'pages/focus/focus.html'
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
        ensureNotificationHandlers();
        rescheduleNow().catch(error => console.warn('Desktop reminder bridge failed:', error));
        timer = global.setInterval(() => {
            rescheduleNow().catch(error => console.warn('Desktop reminder bridge failed:', error));
        }, POLL_MS);
        return { status: 'started' };
    }

    function stop() {
        if (timer) global.clearInterval(timer);
        if (unsubscribeNotificationClick) unsubscribeNotificationClick();
        if (unsubscribeNotificationClose) unsubscribeNotificationClose();
        unsubscribeNotificationClick = null;
        unsubscribeNotificationClose = null;
        timer = null;
        return { status: 'stopped' };
    }

    global.TimeWhereDesktopReminders = {
        STATE_KEY,
        POLL_MS,
        RENOTIFY_COOLDOWN_MS,
        EXECUTION_CHECK_MS,
        start,
        stop,
        rescheduleNow,
        collectDueReminders,
        acknowledgeNotificationClick,
        handleNotificationClosed,
        stopCurrentReminder,
        writeWidgetSnapshot,
        readReminderState,
        writeReminderState
    };

    if (global.document) {
        global.document.addEventListener('DOMContentLoaded', () => {
            start();
        });
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
