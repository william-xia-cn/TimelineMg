// ============================================================
// TimeWhere Scheduling — 共享调度逻辑
// 提供给 Focus / Calendar / Popup 等模块使用的纯函数集合
// ============================================================

(function (global) {
    'use strict';

    function formatDateISO(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = String(timeStr).split(':').map(Number);
        return h * 60 + (m || 0);
    }

    function prioritySortValue(priority) {
        const map = { 'urgent': 0, 'P1': 0, 'important': 1, 'P2': 1, 'medium': 2, 'P3': 2, 'low': 3, 'P4': 3 };
        return map[priority] ?? 2;
    }

    function priorityLabel(priority) {
        const map = { 'urgent': 'P1', 'important': 'P2', 'medium': 'P3', 'low': 'P4', 'P1': 'P1', 'P2': 'P2', 'P3': 'P3', 'P4': 'P4' };
        return map[priority] || 'P3';
    }

    function priorityClass(priority) {
        const label = priorityLabel(priority);
        const map = { 'P1': 'priority-high', 'P2': 'priority-medium', 'P3': 'priority-low', 'P4': 'priority-low' };
        return map[label] || 'priority-low';
    }

    function escapeHTML(value) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return String(value ?? '').replace(/[&<>"']/g, ch => map[ch]);
    }

    function escapeAttribute(value) {
        return escapeHTML(value);
    }

    // 给定 YYYY-MM-DD，计算它是该月第几个星期X
    function _nthWeekdayOfMonth(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = d.getDay();
        const dayOfMonth = d.getDate();
        const nth = Math.ceil(dayOfMonth / 7);
        return { dayOfWeek, nth };
    }

    /**
     * 判断容器是否在指定日期生效
     * @param {Object} c 容器
     * @param {Date} dateObj 日期对象
     * @param {String} dateStr YYYY-MM-DD
     * @param {Number} dayOfWeek 0(Sun)-6(Sat)
     * @param {Boolean} isWeekday 周一至周五
     * @param {Boolean} isWeekend 周六日
     */
    function containerAppliesToDate(c, dateObj, dateStr, dayOfWeek, isWeekday, isWeekend) {
        switch (c.repeat) {
            case 'none':    return false;
            case 'daily':   return true;
            case 'weekday': return isWeekday;
            case 'weekend': return isWeekend;
            case 'weekly':
                return c.repeat_days && c.repeat_days.includes(dayOfWeek);
            case 'monthly_nth': {
                const { dayOfWeek: dow, nth } = _nthWeekdayOfMonth(dateStr);
                return dow === (c.monthly_dow ?? -1) && nth === (c.monthly_week ?? -1);
            }
            case 'yearly': {
                const d = new Date(dateStr + 'T00:00:00');
                return d.getMonth() + 1 === (c.yearly_month ?? -1) && d.getDate() === (c.yearly_dom ?? -1);
            }
            case 'custom':
                return c.repeat_days && c.repeat_days.includes(dayOfWeek);
            case 'once':
                return c.once_date === dateStr;
            default: return false;
        }
    }

    /**
     * 便捷封装：给 Date 对象，内部推导 dateStr/dayOfWeek/isWeekday/isWeekend
     */
    function containerAppliesOn(c, date) {
        const dateStr = formatDateISO(date);
        const dayOfWeek = date.getDay();
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        return containerAppliesToDate(c, date, dateStr, dayOfWeek, isWeekday, isWeekend);
    }

    /**
     * 获取容器的层级：1=学习时间（Layer 1），2=自由时间（Layer 2）
     * 优先读 c.layer 字段；缺省时按名称推导（包含"学习"视为 Layer 1）
     */
    function getContainerLayer(c) {
        if (c && c.layer !== undefined && c.layer !== null) return c.layer;
        if (c && c.name && c.name.includes('学习')) return 1;
        return 2;
    }

    /**
     * 计算容器的容量（分钟数）
     */
    function getContainerCapacity(c) {
        return timeToMinutes(c.time_end) - timeToMinutes(c.time_start);
    }

    function taskMatchesContainerSchedule(task, container) {
        if (!task || !task.schedule_time) return true;
        const taskMin = timeToMinutes(task.schedule_time);
        return taskMin >= timeToMinutes(container.time_start) && taskMin < timeToMinutes(container.time_end);
    }

    function buildDailyTaskPool(tasks, referenceDate) {
        const now = referenceDate || new Date();
        const todayStr = formatDateISO(now);
        return (tasks || []).filter(t =>
            t.progress !== 'completed' &&
            (t.start_date == null || t.start_date <= todayStr) &&
            (t.deferred_until == null || new Date(t.deferred_until) <= now)
        );
    }

    function getDeferredStartDate(days, referenceDate) {
        const date = new Date(referenceDate || new Date());
        date.setDate(date.getDate() + days);
        return formatDateISO(date);
    }

    function parseISODate(dateStr) {
        if (!dateStr) return null;
        return new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    }

    function addDaysISO(dateStr, days) {
        const date = parseISODate(dateStr);
        if (!date) return null;
        date.setDate(date.getDate() + days);
        return formatDateISO(date);
    }

    function daysBetweenISO(startDate, endDate) {
        const start = parseISODate(startDate);
        const end = parseISODate(endDate);
        if (!start || !end) return null;
        return Math.floor((end.getTime() - start.getTime()) / 86400000);
    }

    function isManageBacTask(task) {
        return !!task && (
            task.source === 'managebac' ||
            task.source_type === 'managebac_ics' ||
            (task.readonly === true && !!task.managebac_subject)
        );
    }

    function normalizeText(value) {
        return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function getDefaultStartDate(task, today) {
        const todayStr = typeof today === 'string' ? today : formatDateISO(today || new Date());
        const dueDate = task?.due_date || task?.deadline;
        if (!dueDate) return task?.start_date || todayStr;
        const leadDays = isManageBacTask(task) ? 14 : 7;
        const earlyStart = addDaysISO(dueDate, -leadDays);
        if (!earlyStart) return task?.start_date || todayStr;
        return todayStr > earlyStart ? todayStr : earlyStart;
    }

    function getEscalatedPriority(task, today) {
        const todayStr = typeof today === 'string' ? today : formatDateISO(today || new Date());
        const dueDate = task?.due_date || task?.deadline;
        const current = task?.priority || 'medium';
        if (!dueDate) return current;
        const daysLeft = daysBetweenISO(todayStr, dueDate);
        if (daysLeft === null) return current;

        let floorPriority = current;
        if (daysLeft <= 1) {
            floorPriority = 'urgent';
        } else if (daysLeft <= 3) {
            floorPriority = 'important';
        }
        return prioritySortValue(floorPriority) < prioritySortValue(current) ? floorPriority : current;
    }

    function taskIsUrgentOrOverdue(task, todayStr) {
        const dueDate = task?.due_date || task?.deadline;
        return task?.priority === 'urgent' || (dueDate && dueDate < todayStr);
    }

    function getTaskSubject(task) {
        return normalizeText(task?.subject || task?.plan_subject || task?.plan_name || '');
    }

    function eventMatchesSubject(event, subject) {
        if (!subject) return false;
        const text = normalizeText([
            event?.subject,
            event?.title,
            event?.name,
            event?.description
        ].filter(Boolean).join(' '));
        return !!text && (text.includes(subject) || subject.includes(text));
    }

    function findNextSubjectTimetableDate(task, timetableEvents, todayStr) {
        const subject = getTaskSubject(task);
        if (!subject) return null;
        const minDate = task?.start_date && task.start_date < todayStr ? todayStr : todayStr;
        const dates = (timetableEvents || [])
            .filter(event => event?.source === 'timetable')
            .filter(event => event?.date && event.date >= minDate)
            .filter(event => eventMatchesSubject(event, subject))
            .map(event => event.date)
            .sort();
        return dates[0] || null;
    }

    function arrangeTaskStartDates(tasks, timetableEvents, today) {
        const todayStr = typeof today === 'string' ? today : formatDateISO(today || new Date());
        const arranged = [];
        for (const task of tasks || []) {
            if (!task || task.progress === 'completed' || task.status === 'completed') continue;

            const nextPriority = getEscalatedPriority(task, todayStr);
            const urgentOrOverdue = nextPriority === 'urgent' || taskIsUrgentOrOverdue(task, todayStr);
            let nextStartDate = task.start_date || getDefaultStartDate(task, todayStr);

            if (prioritySortValue(nextPriority) <= prioritySortValue('important')) {
                nextStartDate = todayStr;
            } else if (getTaskSubject(task)) {
                const nextClassDate = findNextSubjectTimetableDate(task, timetableEvents, todayStr);
                if (nextClassDate) {
                    nextStartDate = nextClassDate;
                } else if (urgentOrOverdue) {
                    nextStartDate = todayStr;
                }
            } else if (!task.start_date) {
                nextStartDate = getDefaultStartDate(task, todayStr);
            }

            const updates = {};
            if (nextStartDate && nextStartDate !== task.start_date) updates.start_date = nextStartDate;
            if (nextPriority && nextPriority !== task.priority) updates.priority = nextPriority;
            arranged.push({
                task,
                task_id: task.id,
                start_date: nextStartDate,
                priority: nextPriority,
                updates,
                changed: Object.keys(updates).length > 0
            });
        }
        return arranged;
    }

    function summarizeArrangePlan(plan) {
        const changes = (plan || []).filter(item => item.changed);
        return {
            total_tasks: (plan || []).length,
            changed_tasks: changes.length,
            date_changes: changes.filter(item => Object.prototype.hasOwnProperty.call(item.updates, 'start_date')).length,
            priority_changes: changes.filter(item => Object.prototype.hasOwnProperty.call(item.updates, 'priority')).length,
            managebac_changes: changes.filter(item => isManageBacTask(item.task)).length
        };
    }

    function formatArrangeConfirmation(summary) {
        return [
            'Task Date Arrange 检测到任务日期/优先级调整。',
            '',
            `待调整任务：${summary.changed_tasks}`,
            `日期调整：${summary.date_changes}`,
            `Priority 升级：${summary.priority_changes}`,
            `ManageBac 来源任务：${summary.managebac_changes}`,
            '',
            '确认后才会写入这些本地调度变更。'
        ].join('\n');
    }

    /**
     * Daily Settle — 无状态纯函数
     * 输入：当日任务池 + 当日容器 + 当前时间
     * 输出：每个容器的有序任务列表 + 当前视图任务
     *
     * @param {Array} taskPool - 当日任务池（start_date <= today 且未完成）
     * @param {Array} todayContainers - 今日生效的容器列表
     * @param {Date}  now - 当前时间
     * @returns {{ result, activeContainer, containerInfo, currentTasks, unassigned, sortedPool, allContainers }}
     */
    function dailySettle(taskPool, todayContainers, now) {
        const todayStr = formatDateISO(now);
        const nowMin = now.getHours() * 60 + now.getMinutes();

        // === Step 1: 排序任务池 ===
        const sorted = [...taskPool].sort((a, b) => {
            // 1) 定时任务（未过时间）最高
            const aTimedFuture = a.schedule_time && timeToMinutes(a.schedule_time) >= nowMin;
            const bTimedFuture = b.schedule_time && timeToMinutes(b.schedule_time) >= nowMin;
            if (aTimedFuture !== bTimedFuture) return aTimedFuture ? -1 : 1;

            // 2) priority: urgent(0) > important(1) > medium(2) > low(3)
            const pa = prioritySortValue(a.priority);
            const pb = prioritySortValue(b.priority);
            if (pa !== pb) return pa - pb;

            // 3) 同 priority：overdue 优先
            const aDue = a.due_date || a.deadline || '9999-12-31';
            const bDue = b.due_date || b.deadline || '9999-12-31';
            const aOD = aDue < todayStr;
            const bOD = bDue < todayStr;
            if (aOD !== bOD) return aOD ? -1 : 1;

            // 4) due_date 越近越前
            return aDue.localeCompare(bDue);
        });

        // === Step 2: 容器分层 ===
        const allSorted = [...todayContainers].sort((a, b) =>
            timeToMinutes(a.time_start) - timeToMinutes(b.time_start));

        const layer1 = allSorted.filter(c => getContainerLayer(c) === 1);
        const layer2 = allSorted.filter(c => getContainerLayer(c) !== 1);

        const l1StartMin = layer1.length ? timeToMinutes(layer1[0].time_start) : 1440;
        const l1EndMin = layer1.length ? timeToMinutes(layer1[layer1.length - 1].time_end) : 0;

        const l2Before = layer2.filter(c => timeToMinutes(c.time_end) <= l1StartMin);
        const l2After = layer2.filter(c => timeToMinutes(c.time_start) >= l1EndMin);
        const l2Other = layer2.filter(c => !l2Before.includes(c) && !l2After.includes(c));

        // === Step 3: 容器分配 ===
        const result = new Map();
        allSorted.forEach(c => {
            const cap = getContainerCapacity(c);
            result.set(c.id, { container: c, tasks: [], capacity: cap, used: 0 });
        });

        const remaining = [...sorted];

        function fillContainer(containerId) {
            const info = result.get(containerId);
            const toKeep = [];
            for (const task of remaining) {
                const dur = task.duration || 45;
                if (!taskMatchesContainerSchedule(task, info.container)) {
                    toKeep.push(task);
                    continue;
                }
                // 放入条件：容量未满，或容器还空（允许单个超容量任务）
                if (info.used + dur <= info.capacity || info.used === 0) {
                    info.tasks.push(task);
                    info.used += dur;
                } else {
                    toKeep.push(task);
                }
            }
            remaining.length = 0;
            remaining.push(...toKeep);
        }

        // 3a: 主分配 — Layer 1（学习时间）
        layer1.forEach(c => fillContainer(c.id));
        // 3b: 溢出 — Layer 2 接收所有溢出任务
        [...l2Before, ...l2After, ...l2Other].forEach(c => fillContainer(c.id));

        // === Step 4: 确定当前活跃容器 ===
        let activeContainer = null;
        for (const c of allSorted) {
            if (nowMin >= timeToMinutes(c.time_start) && nowMin < timeToMinutes(c.time_end)) {
                activeContainer = c;
                break;
            }
        }

        let currentTasks, containerInfo = null;
        if (activeContainer) {
            containerInfo = result.get(activeContainer.id);
            currentTasks = containerInfo.tasks;
        } else {
            currentTasks = sorted; // 无容器时段 → 显示完整池
        }

        return {
            result,
            activeContainer,
            containerInfo,
            currentTasks,
            unassigned: [...remaining],
            sortedPool: sorted,
            allContainers: allSorted
        };
    }

    /**
     * 幂等初始化默认容器（仅当容器表为空时写入）
     * 依赖外部传入的 db 对象（TimeWhereDB），避免循环依赖
     * @param {Object} db - TimeWhereDB 实例
     */
    async function initDefaultContainers(db) {
        const containers = await db.getContainers();
        if (containers && containers.length > 0) return;

        await db.addContainer({
            name: '自由时间',
            color: '#7B68EE',
            time_start: '15:30',
            time_end: '18:30',
            repeat: 'daily',
            layer: 2,
            task_types: ['homework', 'test', 'ia', 'notes', 'review', 'project', 'other'],
            defense: 'soft',
            squeezing: 'p1_p2'
        });
        await db.addContainer({
            name: '学习时间',
            color: '#4A90D9',
            time_start: '18:30',
            time_end: '21:30',
            repeat: 'weekday',
            layer: 1,
            task_types: ['homework', 'test', 'ia', 'notes', 'review'],
            defense: 'soft',
            squeezing: 'p1_only'
        });
        await db.addContainer({
            name: '自由时间',
            color: '#7B68EE',
            time_start: '21:30',
            time_end: '22:30',
            repeat: 'daily',
            layer: 2,
            task_types: ['homework', 'test', 'ia', 'notes', 'review', 'project', 'other'],
            defense: 'soft',
            squeezing: 'p1_p2'
        });
    }

    async function arrangeTasks(db, referenceDate, options = {}) {
        const applyChanges = options.apply === true;
        const runAt = referenceDate instanceof Date ? referenceDate : new Date();
        const todayStr = typeof referenceDate === 'string'
            ? referenceDate
            : formatDateISO(referenceDate || new Date());
        if (!db || typeof db.getAllTasks !== 'function') {
            throw new Error('Task Arrange requires a DB with getAllTasks');
        }
        const tasks = await db.getAllTasks();
        const events = typeof db.getEvents === 'function'
            ? await db.getEvents()
            : [];
        const timetableEvents = (events || []).filter(event => event.source === 'timetable');
        const plan = arrangeTaskStartDates(tasks, timetableEvents, todayStr);
        const changes = plan.filter(item => item.changed);
        const summary = summarizeArrangePlan(plan);

        if (!applyChanges) {
            return {
                arranged: 0,
                proposed: changes.length,
                changes,
                summary,
                skipped: plan.length - changes.length,
                errors: [],
                applied: false,
                preview: true,
                today: todayStr,
                disabled: false,
                reason: null
            };
        }

        let arranged = 0;
        const errors = [];
        for (const item of changes) {
            try {
                await db.updateTask(item.task_id, item.updates);
                arranged++;
            } catch (error) {
                errors.push({ task_id: item.task_id, error: error.message || String(error) });
            }
        }
        if (errors.length === 0 && typeof db.setSetting === 'function') {
            await db.setSetting('task_arrange_last_run_at', runAt.toISOString());
        }
        return {
            arranged,
            proposed: changes.length,
            changes,
            summary,
            skipped: plan.length - arranged,
            errors,
            applied: errors.length === 0,
            preview: false,
            today: todayStr,
            disabled: false,
            reason: null
        };
    }

    async function maybeRunTaskArrange(db, options = {}) {
        const now = options.now || new Date();
        const intervalHours = options.intervalHours ?? 6;
        const force = options.force === true;
        const confirmChanges = options.confirmChanges !== false;
        const todayStr = formatDateISO(now);
        if (!force && typeof db.getSetting === 'function') {
            const last = await db.getSetting('task_arrange_last_run_at');
            if (last) {
                const elapsedMs = now.getTime() - new Date(last).getTime();
                if (elapsedMs >= 0 && elapsedMs < intervalHours * 3600000) {
                    return {
                        ran: false,
                        skipped: true,
                        reason: 'fresh',
                        last_run_at: last,
                        today: todayStr
                    };
                }
            }
        }
        const preview = await arrangeTasks(db, now, { apply: false });
        if (preview.proposed === 0) {
            if (typeof db.setSetting === 'function') {
                await db.setSetting('task_arrange_last_run_at', now.toISOString());
            }
            return { ...preview, ran: true, applied: false, no_changes: true };
        }

        if (!confirmChanges) {
            return { ...preview, ran: true, pending_confirmation: true };
        }

        const confirmFn = options.confirmFn || (typeof global.confirm === 'function' ? global.confirm.bind(global) : null);
        if (!confirmFn) {
            return { ...preview, ran: true, pending_confirmation: true, reason: 'confirm_unavailable' };
        }

        const confirmed = await confirmFn(formatArrangeConfirmation(preview.summary), preview);
        if (!confirmed) {
            return { ...preview, ran: true, cancelled: true, applied: false };
        }

        const result = await arrangeTasks(db, now, { apply: true });
        return { ...result, ran: true };
    }

    // 导出
    global.TimeWhereScheduling = {
        timeToMinutes,
        prioritySortValue,
        priorityLabel,
        priorityClass,
        containerAppliesToDate,
        containerAppliesOn,
        getContainerLayer,
        getContainerCapacity,
        getDefaultStartDate,
        getEscalatedPriority,
        arrangeTaskStartDates,
        summarizeArrangePlan,
        formatArrangeConfirmation,
        buildDailyTaskPool,
        getDeferredStartDate,
        dailySettle,
        initDefaultContainers,
        arrangeTasks,
        maybeRunTaskArrange,
        escapeHTML,
        escapeAttribute,
        _nthWeekdayOfMonth
    };
})(typeof window !== 'undefined' ? window : this);
