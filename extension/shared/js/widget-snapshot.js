// TimeWhere macOS widget snapshot builder.
// Produces a small display-only JSON document for native WidgetKit surfaces.
(function initTimeWhereWidgetSnapshot(global) {
    'use strict';

    const WIDGET_SNAPSHOT_SCHEMA = 'timewhere-widget-v1';
    const WIDGET_SNAPSHOT_MAX_TASKS = 3;

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function formatDateISO(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    function isCompleted(task = {}) {
        return task.progress === 'completed' || task.status === 'completed';
    }

    function isCompletedToday(task = {}, todayStr) {
        if (!isCompleted(task)) return false;
        const completedAt = task.completed_at || task.completedAt || task.updated_at || '';
        return String(completedAt).slice(0, 10) === todayStr;
    }

    function getTodayContainers(containers = [], now, scheduling) {
        const todayStr = scheduling?.formatDateISO ? scheduling.formatDateISO(now) : formatDateISO(now);
        const dateObj = new Date(`${todayStr}T00:00:00`);
        const dow = dateObj.getDay();
        const isWeekday = dow >= 1 && dow <= 5;
        const isWeekend = dow === 0 || dow === 6;
        return (containers || [])
            .filter(container => container.enabled !== false)
            .filter(container => scheduling?.containerAppliesToDate?.(container, dateObj, todayStr, dow, isWeekday, isWeekend));
    }

    function buildTaskPool(tasks = [], now, scheduling) {
        if (scheduling?.buildDailyTaskPool) return scheduling.buildDailyTaskPool(tasks || [], now);
        const todayStr = formatDateISO(now);
        return (tasks || []).filter(task => {
            if (isCompleted(task)) return false;
            const effectiveStartDate = task.arranged_date || task.start_date || null;
            if (effectiveStartDate && effectiveStartDate > todayStr) return false;
            if (task.deferred_until && new Date(task.deferred_until) > now) return false;
            return true;
        });
    }

    function summarizeTask(task = {}) {
        const assignment = task.assignment || {};
        return {
            id: String(task.id || ''),
            title: String(task.title || '无标题任务'),
            plan_name: task.plan_name || task.planName || '',
            schedule_time: task.schedule_time || null,
            duration: Number(task.duration) || 45,
            priority: task.priority || 'medium',
            progress: task.progress || task.status || 'not_started',
            assignment_label: assignment.label || assignment.container_name || assignment.status || ''
        };
    }

    function selectCurrentTasks(displayTasks = []) {
        const current = (displayTasks || []).filter(task => task?.assignment?.status === 'current');
        const pool = current.length ? current : (displayTasks || []);
        const inProgress = pool.filter(task => task.progress === 'in_progress');
        const ordered = inProgress.length ? [...inProgress, ...pool.filter(task => task.progress !== 'in_progress')] : pool;
        const seen = new Set();
        return ordered
            .filter(task => {
                const id = String(task?.id || '');
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return !isCompleted(task);
            })
            .slice(0, WIDGET_SNAPSHOT_MAX_TASKS)
            .map(summarizeTask);
    }

    function buildWidgetSnapshot({ tasks = [], containers = [], now = new Date(), scheduling = null, completedToday = null } = {}) {
        const todayStr = scheduling?.formatDateISO ? scheduling.formatDateISO(now) : formatDateISO(now);
        const taskPool = buildTaskPool(tasks, now, scheduling);
        const todayContainers = getTodayContainers(containers, now, scheduling);
        const settle = scheduling?.dailySettle
            ? scheduling.dailySettle(taskPool, todayContainers, now)
            : { displayTasks: taskPool };
        const displayTasks = settle?.displayTasks || settle?.currentTasks || taskPool;
        const hasCompletedTodayOverride = completedToday !== null && completedToday !== undefined && completedToday !== '';
        const completedCount = hasCompletedTodayOverride && Number.isFinite(Number(completedToday))
            ? Number(completedToday)
            : (tasks || []).filter(task => isCompletedToday(task, todayStr)).length;

        return {
            schema: WIDGET_SNAPSHOT_SCHEMA,
            generated_at: now.toISOString(),
            counts: {
                completed_today: completedCount,
                pending_today: taskPool.length
            },
            current_tasks: selectCurrentTasks(displayTasks)
        };
    }

    const api = {
        WIDGET_SNAPSHOT_SCHEMA,
        WIDGET_SNAPSHOT_MAX_TASKS,
        buildWidgetSnapshot,
        selectCurrentTasks,
        summarizeTask
    };

    global.TimeWhereWidgetSnapshot = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
