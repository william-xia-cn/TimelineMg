// ============================================================
// TimeWhere Reminders — system notification reminder rules
// ============================================================

(function (global) {
    'use strict';

    const REMINDER_ADVANCE_MINUTES = 1;
    const REMINDER_REPEAT_MINUTES = 15;
    const DEFAULT_TASK_DURATION_MINUTES = 45;
    const REMINDER_TYPE_RANK = {
        'scheduled-start': 0,
        'scheduled-repeat': 1,
        'container-repeat': 2
    };
    const PRIORITY_RANK = {
        urgent: 0,
        p1: 0,
        important: 1,
        p2: 1,
        medium: 2,
        p3: 2,
        low: 3,
        p4: 3
    };

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function formatDateISO(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    function formatMinuteKey(date) {
        return `${formatDateISO(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }

    function timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = String(timeStr).split(':').map(Number);
        return (hours || 0) * 60 + (minutes || 0);
    }

    function getScheduledStartAt(task, now) {
        if (!task?.schedule_time) return null;
        const [hours, minutes] = String(task.schedule_time).split(':').map(Number);
        if (!Number.isFinite(hours)) return null;
        const startAt = new Date(now);
        startAt.setHours(hours || 0, minutes || 0, 0, 0);
        return startAt;
    }

    function isTaskCompleted(task) {
        return task?.progress === 'completed' || task?.status === 'completed';
    }

    function isTaskEligibleToday(task, now) {
        if (!task || isTaskCompleted(task)) return false;
        const todayStr = formatDateISO(now);
        const effectiveStartDate = task.arranged_date || task.start_date || null;
            if (effectiveStartDate && effectiveStartDate > todayStr) return false;
        if (task.deferred_until && new Date(task.deferred_until) > now) return false;
        return true;
    }

    function makeReminderKey(taskId, type, bucket) {
        return `reminder:${taskId}:${type}:${bucket}`;
    }

    function computeScheduledTaskReminder(task, now, sentState = {}) {
        if (!isTaskEligibleToday(task, now) || !task.schedule_time) return null;
        const startAt = getScheduledStartAt(task, now);
        if (!startAt) return null;
        const startMin = timeToMinutes(task.schedule_time);
        const duration = Number(task.duration) || DEFAULT_TASK_DURATION_MINUTES;
        const secondsUntilStart = Math.floor((startAt.getTime() - now.getTime()) / 1000);
        const elapsedSeconds = Math.floor((now.getTime() - startAt.getTime()) / 1000);
        const taskId = task.id;

        if (secondsUntilStart > 0 && secondsUntilStart <= REMINDER_ADVANCE_MINUTES * 60) {
            const bucket = `${formatDateISO(now)}:${taskId}:advance:${startMin}`;
            const key = makeReminderKey(taskId, 'scheduled-start', bucket);
            if (sentState[key]) return null;
            return {
                task,
                task_id: taskId,
                type: 'scheduled-start',
                bucket,
                key,
                reason: '任务即将开始',
                scheduled_time: task.schedule_time
            };
        }

        if (elapsedSeconds >= 0 && elapsedSeconds <= duration * 60) {
            const bucket = `${formatDateISO(now)}:${Math.floor(elapsedSeconds / (REMINDER_REPEAT_MINUTES * 60))}`;
            const key = makeReminderKey(taskId, 'scheduled-repeat', bucket);
            if (sentState[key]) return null;
            return {
                task,
                task_id: taskId,
                type: 'scheduled-repeat',
                bucket,
                key,
                reason: '任务仍未完成',
                scheduled_time: task.schedule_time
            };
        }

        return null;
    }

    function computeContainerTaskReminders(tasks, containers, now, scheduling, sentState = {}) {
        if (!scheduling?.dailySettle) return [];
        const taskPool = scheduling.buildDailyTaskPool
            ? scheduling.buildDailyTaskPool(tasks || [], now)
            : (tasks || []).filter(task => isTaskEligibleToday(task, now));
        const todayContainers = scheduling.containerAppliesOn
            ? (containers || []).filter(container => scheduling.containerAppliesOn(container, now))
            : (containers || []);
        const settle = scheduling.dailySettle(taskPool, todayContainers, now);
        const activeContainer = settle.activeContainer;
        if (!activeContainer) return [];

        const nowMin = now.getHours() * 60 + now.getMinutes();
        const startMin = scheduling.timeToMinutes
            ? scheduling.timeToMinutes(activeContainer.time_start)
            : timeToMinutes(activeContainer.time_start);
        if (nowMin < startMin) return [];
        const elapsed = nowMin - startMin;

        const bucket = `${formatDateISO(now)}:${activeContainer.id}:${Math.floor(elapsed / REMINDER_REPEAT_MINUTES)}`;
        return (settle.currentTasks || [])
            .filter(task => !task.schedule_time)
            .filter(task => isTaskEligibleToday(task, now))
            .map(task => {
                const key = makeReminderKey(task.id, 'container-repeat', bucket);
                if (sentState[key]) return null;
                return {
                    task,
                    task_id: task.id,
                    type: 'container-repeat',
                    bucket,
                    key,
                    reason: `${activeContainer.name || '当前时间容器'} 内任务仍未完成`,
                    container_id: activeContainer.id,
                    container_name: activeContainer.name || ''
                };
            })
            .filter(Boolean);
    }

    function computeTaskReminders(tasks, containers, now, scheduling, sentState = {}) {
        const scheduled = (tasks || [])
            .map(task => computeScheduledTaskReminder(task, now, sentState))
            .filter(Boolean);
        const scheduledIds = new Set(scheduled.map(item => item.task_id));
        const containerTasks = (tasks || []).map(task => (
            task.schedule_time ? { ...task, __skip_container_reminder: true } : task
        ));
        const container = computeContainerTaskReminders(containerTasks, containers, now, scheduling, sentState)
            .filter(item => !scheduledIds.has(item.task_id));
        return [...scheduled, ...container];
    }

    function prioritySortValue(value) {
        const key = String(value || 'medium').trim().toLowerCase();
        return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, key) ? PRIORITY_RANK[key] : PRIORITY_RANK.medium;
    }

    function dueDateSortValue(value) {
        return value ? String(value) : '9999-12-31';
    }

    function reminderScheduleSortValue(reminder = {}) {
        const time = reminder.scheduled_time || reminder.task?.schedule_time || '';
        return time ? timeToMinutes(time) : 24 * 60 + 1;
    }

    function compareReminders(a = {}, b = {}) {
        const typeA = REMINDER_TYPE_RANK[a.type] ?? 99;
        const typeB = REMINDER_TYPE_RANK[b.type] ?? 99;
        if (typeA !== typeB) return typeA - typeB;

        const timeA = reminderScheduleSortValue(a);
        const timeB = reminderScheduleSortValue(b);
        if (timeA !== timeB) return timeA - timeB;

        const priorityA = prioritySortValue(a.task?.priority);
        const priorityB = prioritySortValue(b.task?.priority);
        if (priorityA !== priorityB) return priorityA - priorityB;

        const dueA = dueDateSortValue(a.task?.due_date || a.task?.deadline);
        const dueB = dueDateSortValue(b.task?.due_date || b.task?.deadline);
        if (dueA !== dueB) return dueA.localeCompare(dueB);

        return String(a.task_id || a.task?.id || '').localeCompare(String(b.task_id || b.task?.id || ''));
    }

    function selectPrimaryReminder(reminders = []) {
        const list = Array.isArray(reminders) ? reminders.filter(Boolean) : [];
        if (list.length === 0) return null;
        return [...list].sort(compareReminders)[0] || null;
    }

    function summarizeReminderItem(reminder = {}) {
        const task = reminder.task || {};
        return {
            title: truncate(task.title || '无标题任务', 28),
            scheduled_time: reminder.scheduled_time || task.schedule_time || null,
            plan_name: task.plan_name || task.planName || '',
            type: reminder.type || null,
            priority: task.priority || 'medium'
        };
    }

    function getAggregateReminderBucket(primary = {}, now = new Date()) {
        if (primary.type === 'scheduled-start') {
            const startMin = timeToMinutes(primary.scheduled_time || primary.task?.schedule_time || '');
            return `${formatDateISO(now)}:advance:${startMin}`;
        }
        return primary.bucket || `${formatDateISO(now)}:${primary.type || 'task'}`;
    }

    function computeAggregatedReminder(tasks, containers, now, scheduling, sentState = {}) {
        const reminders = computeTaskReminders(tasks, containers, now, scheduling, {});
        if (reminders.length === 0) return null;
        const sortedReminders = [...reminders].sort(compareReminders);
        const primary = sortedReminders[0] || null;
        if (!primary) return null;
        const bucket = getAggregateReminderBucket(primary, now);
        const key = makeReminderKey('aggregate', primary.type || 'task', bucket);
        if (sentState[key]) return null;
        const taskIds = Array.from(new Set(sortedReminders
            .map(reminder => reminder.task_id || reminder.task?.id)
            .filter(id => id != null)
            .map(id => String(id))));
        return {
            ...primary,
            key,
            bucket,
            primary_key: primary.key,
            primary_bucket: primary.bucket,
            total_count: reminders.length,
            overflow_count: Math.max(0, reminders.length - 1),
            task_ids: taskIds,
            items: sortedReminders.slice(0, 3).map(summarizeReminderItem)
        };
    }

    function truncate(value, max = 48) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    }

    function formatReminderListItem(item = {}, index = 0) {
        const title = truncate(item.title || '无标题任务', 28);
        const meta = item.scheduled_time || item.plan_name || '';
        return `${index + 1}. ${title}${meta ? ` ${truncate(meta, 16)}` : ''}`;
    }

    function buildReminderNotificationPayload(reminder) {
        const task = reminder?.task || {};
        const taskTitle = task.title || '无标题任务';
        const planName = task.plan_name || task.planName || '未归属 Plan';
        const duration = Number(task.duration) || DEFAULT_TASK_DURATION_MINUTES;
        const details = truncate(task.notes || task.description || '');
        const detailText = details ? ` · ${details}` : '';
        const totalCount = Number(reminder?.total_count) || 1;
        let title;
        let message;

        if (Array.isArray(reminder?.items) && reminder.items.length > 0) {
            title = `当前有 ${totalCount} 个任务待处理`;
            const listText = reminder.items
                .slice(0, 3)
                .map(formatReminderListItem)
                .join('；');
            const hiddenCount = Math.max(0, totalCount - reminder.items.length);
            message = hiddenCount > 0 ? `${listText} · 另有 ${hiddenCount} 项` : listText;
            return {
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title,
                message,
                priority: 2,
                requireInteraction: true
            };
        }

        if (reminder?.type === 'scheduled-start') {
            title = `即将开始：${taskTitle}`;
            message = `${reminder.scheduled_time} · ${planName} · ${duration}分钟${detailText}`;
        } else if (reminder?.type === 'scheduled-repeat') {
            title = `仍未完成：${taskTitle}`;
            message = `已到 ${reminder.scheduled_time} · ${planName} · 点击打开 Dashboard${detailText}`;
        } else {
            title = `当前任务提醒：${taskTitle}`;
            message = `${reminder?.container_name || '当前时间容器'} · ${planName} · 已在当前时间段${detailText}`;
        }

        return {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title,
            message,
            priority: 2,
            requireInteraction: true
        };
    }

    const api = {
        REMINDER_ADVANCE_MINUTES,
        REMINDER_REPEAT_MINUTES,
        DEFAULT_TASK_DURATION_MINUTES,
        formatDateISO,
        formatMinuteKey,
        timeToMinutes,
        getScheduledStartAt,
        isTaskEligibleToday,
        makeReminderKey,
        computeScheduledTaskReminder,
        computeContainerTaskReminders,
        computeTaskReminders,
        selectPrimaryReminder,
        computeAggregatedReminder,
        summarizeReminderItem,
        buildReminderNotificationPayload,
        truncate
    };

    global.TimeWhereReminders = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
