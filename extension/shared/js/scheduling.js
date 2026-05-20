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

    function normalizeSubjectKey(value) {
        return normalizeText(value)
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
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

    function normalizeTaskDate(value) {
        return value ? String(value).slice(0, 10) : null;
    }

    function hasExplicitStartDateWindow(task) {
        const startDate = normalizeTaskDate(task?.start_date);
        const dueDate = normalizeTaskDate(task?.due_date || task?.deadline);
        return !!startDate && !!dueDate && startDate !== dueDate;
    }

    function getArrangeBaseStartDate(task, today) {
        const startDate = normalizeTaskDate(task?.start_date);
        const dueDate = normalizeTaskDate(task?.due_date || task?.deadline);
        if (!dueDate) return startDate || normalizeTaskDate(today || new Date());
        if (!startDate || startDate === dueDate) return getDefaultStartDate(task, today);
        return startDate;
    }

    function constrainArrangeStartDate(task, candidateDate, today, baseStartDate = null) {
        const nextDate = normalizeTaskDate(candidateDate);
        if (!nextDate) return nextDate;

        const dueDate = normalizeTaskDate(task?.due_date || task?.deadline);
        const startDate = normalizeTaskDate(baseStartDate) || getArrangeBaseStartDate(task, today);
        const todayStr = normalizeTaskDate(today || new Date());
        if (startDate > dueDate) return dueDate;
        let constrained = nextDate;
        if (startDate && constrained < startDate) constrained = startDate;
        if (dueDate && constrained > dueDate) constrained = dueDate;
        if (todayStr && startDate && todayStr > startDate && (!dueDate || todayStr <= dueDate)) {
            constrained = todayStr > constrained ? todayStr : constrained;
        }
        return constrained;
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
        return normalizeSubjectKey(task?.subject || task?.plan_subject || '');
    }

    function getTaskSubjectInMatrixView(task) {
        return normalizeSubjectKey(task?.subject_in_matrixview || task?.plan_subject_in_matrixview || '');
    }

    function getEventSubjectInMatrixView(event) {
        return normalizeSubjectKey(event?.subject_in_matrixview || '');
    }

    function eventSubjectCandidates(event) {
        return [
            { value: event?.subject_in_matrixview, trusted: true },
            { value: event?.subject, trusted: true },
            { value: event?.title, trusted: false },
            { value: event?.name, trusted: false },
            { value: event?.description, trusted: false }
        ].map(candidate => ({
            value: normalizeSubjectKey(candidate.value),
            trusted: Boolean(candidate.trusted)
        })).filter(candidate => candidate.value);
    }

    function isSpecificSubjectCandidate(candidate) {
        if (!candidate) return false;
        const tokens = candidate.split(/\s+/).filter(Boolean);
        return candidate.length >= 16 || tokens.length >= 3;
    }

    function eventMatchesSubject(event, subject) {
        if (!subject) return false;
        const candidates = eventSubjectCandidates(event);
        if (!candidates.length) return false;
        if (candidates.some(candidate => candidate.value === subject)) return true;
        return candidates.some(candidate => {
            if (candidate.value.includes(subject)) return true;
            return candidate.trusted
                && isSpecificSubjectCandidate(candidate.value)
                && subject.includes(candidate.value);
        });
    }

    function findNextSubjectTimetableDate(task, timetableEvents, minDate) {
        const subject = getTaskSubject(task);
        const subjectInMatrixView = getTaskSubjectInMatrixView(task);
        if (!subject && !subjectInMatrixView) return null;
        const normalizedMin = normalizeTaskDate(minDate);
        const dates = (timetableEvents || [])
            .filter(event => event?.source === 'timetable')
            .filter(event => event?.date && (!normalizedMin || event.date >= normalizedMin))
            .filter(event => {
                if (subjectInMatrixView) {
                    return getEventSubjectInMatrixView(event) === subjectInMatrixView;
                }
                return eventMatchesSubject(event, subject);
            })
            .map(event => event.date)
            .sort();
        return dates[0] || null;
    }

    function findNextAnyTimetableDate(timetableEvents, minDate) {
        const normalizedMin = normalizeTaskDate(minDate);
        const dates = (timetableEvents || [])
            .filter(event => event?.source === 'timetable')
            .filter(event => event?.date && (!normalizedMin || event.date > normalizedMin))
            .map(event => event.date)
            .sort();
        return dates[0] || null;
    }

    function getNoTimetableFallbackStartDate(task, baseStartDate) {
        const dueDate = normalizeTaskDate(task?.due_date || task?.deadline);
        const startDate = normalizeTaskDate(baseStartDate);
        if (!dueDate || !startDate) return startDate;
        const spanDays = daysBetweenISO(startDate, dueDate);
        if (spanDays === null) return startDate;
        const offsetDays = spanDays >= 3 ? -3 : -1;
        return addDaysISO(dueDate, offsetDays) || startDate;
    }

    function arrangeTaskStartDates(tasks, timetableEvents, today) {
        const todayStr = typeof today === 'string' ? today : formatDateISO(today || new Date());
        const arranged = [];
        for (const task of tasks || []) {
            if (!task || task.progress === 'completed' || task.status === 'completed') continue;
            if (task.plan_subject_active === false) continue;
            const dueDate = normalizeTaskDate(task.due_date || task.deadline);
            if (!dueDate || dueDate < todayStr) continue;

            const nextPriority = getEscalatedPriority(task, todayStr);
            const baseStartDate = getArrangeBaseStartDate(task, todayStr);
            let nextStartDate = null;
            const nextClassDate = getTaskSubject(task)
                ? findNextSubjectTimetableDate(task, timetableEvents, baseStartDate)
                : null;
            const isUrgent = nextPriority === 'urgent';

            if (isUrgent) {
                nextStartDate = todayStr;
            } else if (nextClassDate) {
                nextStartDate = nextClassDate;
            } else {
                nextStartDate = findNextAnyTimetableDate(timetableEvents, baseStartDate)
                    || getNoTimetableFallbackStartDate(task, baseStartDate);
            }
            nextStartDate = constrainArrangeStartDate(task, nextStartDate, todayStr, baseStartDate);

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

    function resolvePlanSubjectInMatrixView(plan, matrixMappings) {
        if (plan?.subject_in_matrixview) return plan.subject_in_matrixview;
        const subjectKey = normalizeSubjectKey(plan?.subject || plan?.name || '');
        if (!subjectKey) return null;
        const matched = (matrixMappings || []).find(mapping => {
            const mappingSubject = normalizeSubjectKey(mapping.subject || mapping.plan_name || '');
            const mappingPlanName = normalizeSubjectKey(mapping.plan_name || '');
            return mappingSubject === subjectKey || mappingPlanName === subjectKey;
        });
        return matched?.subject_in_matrixview || null;
    }

    function subjectIdSegments(value) {
        const raw = String(value || '');
        const candidates = new Set();
        const dashParts = raw.split(/\s+[-–—|]\s+/).map(part => part.trim()).filter(Boolean);
        for (let i = 0; i < dashParts.length; i++) {
            candidates.add(normalizeSubjectKey(dashParts.slice(i).join(' ')));
        }
        for (const part of raw.split(/\s+[-–—|]\s+|\s*:\s*/)) {
            candidates.add(normalizeSubjectKey(part));
        }
        return Array.from(candidates).filter(Boolean);
    }

    function subjectIdMatchesPlan(subjectInMatrixView, plan) {
        const matrixKey = normalizeSubjectKey(subjectInMatrixView);
        if (!matrixKey || !plan) return false;
        const planKeys = [
            normalizeSubjectKey(plan.subject),
            normalizeSubjectKey(plan.name)
        ].filter(Boolean);
        if (!planKeys.length) return false;
        const segments = subjectIdSegments(subjectInMatrixView);
        return planKeys.some(planKey => matrixKey === planKey || segments.includes(planKey));
    }

    function resolvePlanSubjectInMatrixViewFromEvents(plan, timetableEvents) {
        if (!plan) return null;
        const candidates = Array.from(new Set((timetableEvents || [])
            .map(event => event.subject_in_matrixview)
            .filter(Boolean)));
        return candidates.find(subjectInMatrixView => subjectIdMatchesPlan(subjectInMatrixView, plan)) || null;
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
     * @returns {{ result, activeContainer, containerInfo, currentContainerInfo, currentTasks, displayTasks, unassigned, sortedPool, allContainers }}
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

        const assignableContainers = allSorted.filter(c => timeToMinutes(c.time_end) > nowMin);
        const layer1 = assignableContainers.filter(c => getContainerLayer(c) === 1);
        const layer2 = assignableContainers.filter(c => getContainerLayer(c) !== 1);

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

        let currentTasks, containerInfo = null, currentContainerInfo = null;
        if (activeContainer) {
            containerInfo = result.get(activeContainer.id);
            if (containerInfo.tasks.length > 0) {
                currentContainerInfo = containerInfo;
                currentTasks = containerInfo.tasks;
            } else {
                currentContainerInfo = allSorted
                    .map(c => result.get(c.id))
                    .find(info => info && info.tasks.length > 0 && timeToMinutes(info.container.time_end) > nowMin) || null;
                currentTasks = currentContainerInfo ? currentContainerInfo.tasks : sorted;
            }
        } else {
            currentTasks = sorted; // 无容器时段 → 显示完整池
        }

        const assignmentByTaskId = new Map();
        for (const info of result.values()) {
            for (const task of info.tasks) {
                const isCurrent = activeContainer && info.container.id === activeContainer.id;
                assignmentByTaskId.set(task.id, {
                    status: isCurrent ? 'current' : 'upcoming',
                    label: isCurrent ? '当前' : '后续',
                    container_id: info.container.id,
                    container_name: info.container.name || '',
                    time_start: info.container.time_start || '',
                    time_end: info.container.time_end || '',
                    color: info.container.color || '',
                    capacity: info.capacity,
                    used: info.used
                });
            }
        }
        const displayRank = { current: 0, upcoming: 1, unassigned: 2 };
        const displayTasks = sorted
            .map((task, index) => {
                const assignment = assignmentByTaskId.get(task.id) || {
                    status: 'unassigned',
                    label: '当前未分配',
                    reason: '当前未分配'
                };
                return { ...task, assignment, __dailySettleOrder: index };
            })
            .sort((a, b) => {
                const ar = displayRank[a.assignment?.status] ?? 2;
                const br = displayRank[b.assignment?.status] ?? 2;
                if (ar !== br) return ar - br;
                return a.__dailySettleOrder - b.__dailySettleOrder;
            })
            .map(task => {
                const { __dailySettleOrder, ...cleanTask } = task;
                return cleanTask;
            });

        return {
            result,
            activeContainer,
            containerInfo,
            currentContainerInfo,
            currentTasks,
            displayTasks,
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
        const plans = typeof db.getPlans === 'function' ? await db.getPlans() : [];
        const matrixMappings = typeof db.getSetting === 'function'
            ? await db.getSetting('matrixview_subject_mappings')
            : [];
        const events = typeof db.getEvents === 'function'
            ? await db.getEvents()
            : [];
        const timetableEvents = (events || []).filter(event => event.source === 'timetable');
        const plansById = new Map((plans || []).map(plan => [String(plan.id), plan]));
        const enrichedTasks = (tasks || []).map(task => {
            const plan = plansById.get(String(task.plan_id));
            if (!plan) return task;
            const subjectInMatrixView = task.subject_in_matrixview
                || resolvePlanSubjectInMatrixView(plan, matrixMappings)
                || resolvePlanSubjectInMatrixViewFromEvents(plan, timetableEvents);
            return {
                ...task,
                subject: plan.subject || null,
                subject_in_matrixview: subjectInMatrixView,
                plan_subject_active: plan.subject ? plan.subject_active !== false : null
            };
        });
        const plan = arrangeTaskStartDates(enrichedTasks, timetableEvents, todayStr);
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
                await db.updateTask(item.task_id, item.updates, { skipTaskArrangeDirty: true });
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
        const confirmChanges = options.confirmChanges !== false;
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
