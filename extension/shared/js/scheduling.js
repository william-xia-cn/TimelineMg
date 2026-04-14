// ============================================================
// TimeWhere Scheduling — 共享调度逻辑
// 提供给 Focus / Calendar / Popup 等模块使用的纯函数集合
// ============================================================

(function (global) {
    'use strict';

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
        const dateStr = date.toISOString().split('T')[0];
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
        const todayStr = now.toISOString().split('T')[0];
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
        // 3b: 溢出 — 先向前（早的 L2），再向后（晚的 L2）
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
        dailySettle,
        _nthWeekdayOfMonth
    };
})(typeof window !== 'undefined' ? window : this);
