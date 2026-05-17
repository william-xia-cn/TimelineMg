// ============================================================
// Focus Dashboard — script.js
// 4 列数据加载：当前任务 | 日历 | 本周进度 | 消息流
// ============================================================

const PX_PER_HOUR = 40;

function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    await initApp();
    setupEventListeners();
    // 每 60 秒更新当前时间红线
    setInterval(updateCurrentTimeLine, 60000);
    // 每 10 分钟重新执行 Daily Settle
    setInterval(() => { loadTaskColumn(); }, 10 * 60 * 1000);
});

async function initApp() {
    try {
        await TimeWhereDB.initDefaultSettings();
    } catch(e) {
        console.error('initDefaultSettings failed:', e);
    }
    // 确保默认容器存在
    try {
        await TimeWhereScheduling.initDefaultContainers(TimeWhereDB);
    } catch(e) {
        console.error('initDefaultContainers failed:', e);
    }
    await loadDashboardData();
    runManagementReviewCheck();
    runGoogleSyncCheck();
    openJournalFromUrl();
}

async function runGoogleSyncCheck() {
    if (typeof TimeWhereGoogleSync === 'undefined' || typeof TimeWhereDB === 'undefined') return;
    TimeWhereGoogleSync.runPageAutoSync(TimeWhereDB).catch(error => {
        console.warn('Google auto sync check failed:', error);
    });
}

async function getTaskArrangeReviewLog() {
    return await TimeWhereTaskArrangeAuto.getTaskArrangeReviewLog(TimeWhereDB);
}

async function saveTaskArrangeReviewLog(log) {
    await TimeWhereTaskArrangeAuto.saveTaskArrangeReviewLog(TimeWhereDB, log);
}

async function refreshTaskArrangeReviewEntry() {
    const badge = document.getElementById('taskArrangeReviewBadge');
    const status = document.getElementById('taskArrangeReviewStatus');
    if (!badge || !status || !window.TimeWhereDB) return;
    const log = await getTaskArrangeReviewLog();
    const unread = log.filter(record => !record.viewed_at);
    const unreadChanges = unread.reduce((total, record) => total + (record.changes?.length || 0), 0);
    if (unreadChanges > 0) {
        badge.hidden = false;
        badge.textContent = `${unreadChanges} 项调整`;
        status.textContent = `${unread.length} 次自动调整未查看`;
        return;
    }
    badge.hidden = true;
    badge.textContent = '0 项调整';
    status.textContent = '暂无新的自动调整';
}

async function runManagementReviewCheck() {
    if (!window.TimeWhereTaskArrangeAuto?.runTaskArrangeAutoReview || !window.TimeWhereDB) return;
    try {
        const result = await TimeWhereTaskArrangeAuto.runTaskArrangeAutoReview(TimeWhereDB, { source: 'dashboard_auto' });
        await refreshTaskArrangeReviewEntry();
        if (result?.ran && !result.no_changes) {
            await loadTaskColumn();
            await loadCalendarColumn();
        }
    } catch (error) {
        console.warn('[Focus] Task Arrange check skipped:', error);
    }
}

async function loadDashboardData() {
    if (typeof TimeWhereDB === 'undefined') {
        console.warn('TimeWhereDB not loaded');
        return;
    }
    try {
        await Promise.all([
            loadTaskColumn(),
            loadCalendarColumn(),
            loadWeeklyProgress(),
            loadFeedColumn(),
            refreshTaskArrangeReviewEntry()
        ]);
    } catch(e) {
        console.error('loadDashboardData failed:', e);
    }
}

// ============================================================
// 工具函数
// ============================================================

// 从 shared/js/scheduling.js 导入调度相关函数
const { timeToMinutes, prioritySortValue, priorityLabel, priorityClass,
        containerAppliesToDate, getContainerLayer, dailySettle,
        buildDailyTaskPool, escapeHTML, escapeAttribute, _nthWeekdayOfMonth } = window.TimeWhereScheduling;

function formatDate(dateStr) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayStr = formatDateISO(today);
    const tomorrowStr = formatDateISO(tomorrow);

    if (dateStr === todayStr) return '今天';
    if (dateStr === tomorrowStr) return '明天';
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function relativeTime(isoString) {
    if (!isoString) return '';
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚才';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}小时前`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return '昨天';
    return `${diffD}天前`;
}

function darkenColor(hex, amount) {
    hex = (hex || '#4A90D9').replace('#', '');
    const r = Math.max(0, parseInt(hex.substring(0, 2), 16) * (1 - amount));
    const g = Math.max(0, parseInt(hex.substring(2, 4), 16) * (1 - amount));
    const b = Math.max(0, parseInt(hex.substring(4, 6), 16) * (1 - amount));
    return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

function formatTime(timeStr) {
    const [h, m] = String(timeStr || '').split(':').map(Number);
    if (Number.isNaN(h)) return '';
    const minute = m > 0 ? String(m).padStart(2, '0') : '';
    if (h < 12) return `上午${h}点${minute}`;
    if (h === 12) return `下午12点${minute}`;
    return `下午${h - 12}点${minute}`;
}

function getWeekBounds() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    // Monday-based week
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMon);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return {
        start: formatDateISO(monday),
        end: formatDateISO(sunday),
        startDate: monday,
        endDate: sunday
    };
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// ============================================================
// 第 1 列：当前任务
// ============================================================

async function loadTaskColumn() {
    const section = document.querySelector('.column-now .column-content');
    if (!section) return;

    const now = new Date();
    const todayStr = formatDateISO(now);

    // 构建当日任务池：start_date <= today 或 null，且未完成，且未延后到未来
    const allTasks = await TimeWhereDB.getAllTasks();
    const taskPool = buildDailyTaskPool(allTasks, now);

    // 获取今日容器
    const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
    const dateObj = new Date(todayStr + 'T00:00:00');
    const dow = dateObj.getDay();
    const isWeekday = dow >= 1 && dow <= 5;
    const isWeekend = dow === 0 || dow === 6;
    const todayContainers = allContainers.filter(c =>
        containerAppliesToDate(c, dateObj, todayStr, dow, isWeekday, isWeekend)
    );

    // 执行 Daily Settle
    const settle = dailySettle(taskPool, todayContainers, now);
    const journalEntryHTML = await renderTodayJournalEntry(todayStr, now);

    // 更新 header badge — 容器状态 or 任务计数
    const badge = document.querySelector('.column-now .badge');
    if (badge) {
        if (settle.activeContainer) {
            const remainMin = Math.max(0, timeToMinutes(settle.activeContainer.time_end) - (now.getHours() * 60 + now.getMinutes()));
            badge.textContent = `${settle.activeContainer.name} · ${remainMin}min`;
            badge.className = 'badge container-active';
            badge.style.cssText = `background:${settle.activeContainer.color}20; color:${settle.activeContainer.color};`;
        } else {
            const count = settle.currentTasks.length;
            badge.textContent = count > 0 ? `${count} 项待办` : '无任务';
            badge.className = count > 0 ? 'badge red' : 'badge';
            badge.style.cssText = '';
        }
    }

    // 空状态
    if (settle.currentTasks.length === 0) {
        section.innerHTML = `
            <div class="current-task-scroll-body custom-scrollbar">
                <div class="empty-state">
                    <span class="material-symbols-outlined" style="font-size: 48px;">check_circle</span>
                    <p>${settle.activeContainer ? '当前容器无任务' : '暂无待办任务'}</p>
                    <button class="add-task-btn" data-action="add-task">
                        <span class="material-symbols-outlined">add</span> 添加任务
                    </button>
                </div>
            </div>
            ${journalEntryHTML}`;
        return;
    }

    // 渲染任务卡片
    let html = '';
    const isContainerView = !!settle.activeContainer;
    const targetTaskId = new URLSearchParams(window.location.search).get('task_id');
    settle.currentTasks.forEach((task, index) => {
        const isFirst = index === 0;
        const dueDate = task.due_date || task.deadline || '';
        const isOverdue = dueDate && dueDate < todayStr;
        const isDueToday = dueDate === todayStr;
        const isTimed = !!task.schedule_time;
        const isInProgress = task.progress === 'in_progress';

        html += createTaskCard(task, {
            expanded: task.id === targetTaskId || isFirst || isInProgress,
            isOverdue,
            isDueToday,
            isTimed,
            isInProgress,
            isContainerView,
            containerOvertime: isContainerView && settle.containerInfo.used > settle.containerInfo.capacity
        });
    });
    section.innerHTML = `
        <div class="current-task-scroll-body custom-scrollbar">
            ${html}
        </div>
        ${journalEntryHTML}`;
    if (targetTaskId) {
        section.querySelector(`[data-task-card-id="${CSS.escape(targetTaskId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

async function renderTodayJournalEntry(todayStr, now = new Date()) {
    if (TimeWhereDB.ensureDailyJournalSnapshot && now.getHours() >= 6) {
        await TimeWhereDB.ensureDailyJournalSnapshot(todayStr, now).catch(error => {
            console.warn('[Focus] Daily journal snapshot skipped:', error);
        });
    }
    const journal = TimeWhereDB.getDailyJournal ? await TimeWhereDB.getDailyJournal(todayStr) : null;
    const status = journal?.status || (journal?.snapshot_at ? 'snapshot' : 'none');
    const labelMap = {
        none: '未生成计划快照',
        snapshot: '待整理',
        draft: '草稿',
        submitted: '已提交'
    };
    const buttonText = status === 'submitted' ? '查看今日总结' : '整理今日总结';
    return `
        <div class="daily-journal-entry" data-journal-date="${escapeAttribute(todayStr)}">
            <div class="daily-journal-main">
                <div class="daily-journal-icon"><span class="material-symbols-outlined">edit</span></div>
                <div class="daily-journal-copy">
                    <h3>今日总结</h3>
                    <p>${escapeHTML(formatDate(todayStr))} · ${escapeHTML(labelMap[status] || labelMap.none)}</p>
                </div>
            </div>
            <button class="btn-micro primary" data-action="open-today-journal" data-journal-date="${escapeAttribute(todayStr)}">${buttonText}</button>
        </div>`;
}

function createTaskCard(task, opts = {}) {
    const { expanded, isOverdue, isDueToday, isTimed, isInProgress } = opts;
    const openAttr = expanded ? ' open' : '';
    const title = escapeHTML(task.title || '无标题任务');
    const notes = escapeHTML(task.notes || task.description || '');
    const taskId = escapeAttribute(task.id);
    const pLabel = priorityLabel(task.priority);
    const pClass = priorityClass(task.priority);
    const durationText = `${task.duration || 45}min`;
    const startDate = task.start_date;
    const startDateText = startDate ? formatDate(startDate) : '';
    const dueDate = task.due_date || task.deadline;
    const deadlineText = dueDate ? formatDate(dueDate) : '';
    const isManageBacSource = TimeWhereDB.isManageBacSourceTask?.(task) === true;

    const dotClass = isInProgress ? 'pulsing' : 'pending';

    // 标签
    let tagsHtml = '';
    if (isOverdue) tagsHtml += '<span class="tag tag-overdue">逾期</span>';
    if (isDueToday) tagsHtml += '<span class="tag tag-due-today">今日截止</span>';
    if (isTimed) tagsHtml += `<span class="tag tag-timed">${escapeHTML(task.schedule_time)}</span>`;

    // 操作按钮
    const progressBtns = isInProgress
        ? `<button class="btn-micro" data-action="pause" data-task-id="${taskId}">暂停</button>
           <button class="btn-micro primary" data-action="complete" data-task-id="${taskId}">完成</button>`
        : `<button class="btn-micro primary" data-action="start" data-task-id="${taskId}">开始</button>
           <button class="btn-micro" data-action="complete" data-task-id="${taskId}">完成</button>`;

    const deferHtml = isManageBacSource ? `
        <div class="defer-row">
            <span class="defer-label">延后</span>
            <span class="defer-blocked-text">ManageBac 来源任务不能延后</span>
        </div>` : `
        <div class="defer-row">
            <span class="defer-label">延后</span>
            <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="1">1天</button>
            <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="3">3天</button>
            <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="7">7天</button>
        </div>`;

    return `
        <div class="accordion-task${isOverdue ? ' task-overdue' : ''}" data-task-card-id="${taskId}">
            <details${openAttr}>
                <summary>
                    <div class="task-title">
                        <span class="status-dot ${dotClass}"></span>
                        <h4>${title}</h4>
                    </div>
                    <span class="material-symbols-outlined expand-icon">expand_more</span>
                </summary>
                <div class="task-details">
                    ${notes ? `<p>${notes}</p>` : ''}
                    <div class="task-meta-tags">
                        <span class="priority-badge ${pClass}">${pLabel}</span>
                        ${startDateText ? `<span class="meta-item start-date-item"><span class="material-symbols-outlined">play_arrow</span>开始 ${startDateText}</span>` : ''}
                        <span class="meta-item"><span class="material-symbols-outlined">schedule</span>${durationText}</span>
                        ${deadlineText ? `<span class="meta-item deadline-item">截止 ${deadlineText}</span>` : ''}
                        ${tagsHtml}
                    </div>
                    <div class="task-action-row">${progressBtns}</div>
                    ${deferHtml}
                </div>
            </details>
        </div>`;
}

async function startTaskNow(taskId) {
    try {
        await TimeWhereDB.updateTask(taskId, { progress: 'in_progress' });
        await loadDashboardData();
        showToast('任务已开始', 'info');
    } catch (error) {
        showToast(`开始任务失败：${error.message}`, 'error');
    }
}

async function pauseTask(taskId) {
    try {
        await TimeWhereDB.updateTask(taskId, { progress: 'not_started' });
        await loadDashboardData();
        showToast('任务已暂停', 'info');
    } catch (error) {
        showToast(`暂停任务失败：${error.message}`, 'error');
    }
}

async function completeTaskNow(taskId) {
    try {
        await TimeWhereDB.updateTask(taskId, {
            progress: 'completed',
            completed_at: new Date().toISOString()
        });
        await loadDashboardData();
        showToast('任务已完成！', 'success');
    } catch (error) {
        showToast(`完成任务失败：${error.message}`, 'error');
    }
}

async function deferTask(taskId, days) {
    try {
        const task = await TimeWhereDB.getTaskById(taskId);
        if (TimeWhereDB.isManageBacSourceTask?.(task)) {
            showToast('ManageBac 来源任务不能延后', 'error');
            return;
        }
        const today = new Date();
        const baseDate = task?.due_date || task?.deadline || formatDateISO(today);
        const target = new Date(baseDate + 'T00:00:00');
        target.setDate(target.getDate() + days);
        const targetStr = formatDateISO(target);
        await TimeWhereDB.updateTask(taskId, { due_date: targetStr });
        await loadDashboardData();
        showToast(`任务已延后 ${days} 天`, 'info');
    } catch (error) {
        showToast(`延后任务失败：${error.message}`, 'error');
    }
}

// ============================================================
// 第 2-3 列：日历视图（今日 & 明日）
// ============================================================

async function loadCalendarColumn() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const todayStr = formatDateISO(today);
    const tomorrowStr = formatDateISO(tomorrow);

    // 更新日期头部
    const dateDisplay = document.getElementById('cal-date-range');
    if (dateDisplay) {
        dateDisplay.textContent = `${today.getMonth() + 1}月${today.getDate()}日 - ${tomorrow.getMonth() + 1}月${tomorrow.getDate()}日`;
    }

    // 更新日期列头
    const dayHeaders = document.querySelectorAll('.gcal-day-header');
    if (dayHeaders.length >= 2) {
        dayHeaders[0].querySelector('.day-name').textContent = WEEKDAY_NAMES[today.getDay()];
        dayHeaders[0].querySelector('.day-num').textContent = today.getDate();
        dayHeaders[0].classList.add('active');
        dayHeaders[1].querySelector('.day-name').textContent = WEEKDAY_NAMES[tomorrow.getDay()];
        dayHeaders[1].querySelector('.day-num').textContent = tomorrow.getDate();
        dayHeaders[1].classList.remove('active');
    }

    // 加载数据
    const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
    const dbEvents = (await TimeWhereDB.getEventsByDateRange(todayStr, tomorrowStr)) || [];
    const allTasks = (await TimeWhereDB.getAllTasks()) || [];

    // 渲染两天
    const todayCol = document.getElementById('gcal-today');
    const tomorrowCol = document.getElementById('gcal-tomorrow');

    if (todayCol) renderDayColumn(todayCol, today, todayStr, allContainers, dbEvents, allTasks, true);
    if (tomorrowCol) renderDayColumn(tomorrowCol, tomorrow, tomorrowStr, allContainers, dbEvents, allTasks, false);

    // 自动滚动到当前时间附近
    const gcalBody = document.querySelector('.gcal-body');
    if (gcalBody) {
        const currentMinutes = today.getHours() * 60 + today.getMinutes();
        const scrollTarget = Math.max(0, (currentMinutes * PX_PER_HOUR / 60) - 100);
        gcalBody.scrollTop = scrollTarget;
    }
}

function getDateTasksForDisplay(tasks, dateStr) {
    const items = [];
    (tasks || []).forEach(task => {
        if (!task || task.progress === 'completed' || task.status === 'completed') return;
        const dueDate = task.due_date || task.deadline || null;
        if (dueDate === dateStr) {
            items.push({ ...task, calendar_item_type: 'due' });
        } else if (task.start_date === dateStr) {
            items.push({ ...task, calendar_item_type: 'start' });
        }
    });
    return items.sort((a, b) => {
        if (a.calendar_item_type !== b.calendar_item_type) return a.calendar_item_type === 'due' ? -1 : 1;
        return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

function focusTaskMatchesContainer(task, container) {
    if (!task?.schedule_time || !container?.time_start || !container?.time_end) return false;
    const taskMin = timeToMinutes(task.schedule_time);
    return taskMin >= timeToMinutes(container.time_start) && taskMin < timeToMinutes(container.time_end);
}

function assignDateTasksToContainers(tasks, containers) {
    const sortedContainers = [...(containers || [])].sort((a, b) =>
        String(a.time_start || '').localeCompare(String(b.time_start || ''))
    );
    const assignments = new Map(sortedContainers.map(container => [container.id, []]));
    const firstLayerOne = sortedContainers.find(container => getContainerLayer(container) === 1);
    const fallbackContainer = firstLayerOne || sortedContainers[0] || null;
    (tasks || []).forEach(task => {
        const target = task.schedule_time
            ? sortedContainers.find(container => focusTaskMatchesContainer(task, container))
            : fallbackContainer;
        if (target && assignments.has(target.id)) assignments.get(target.id).push(task);
    });
    return assignments;
}

function renderDayColumn(col, dateObj, dateStr, allContainers, allDbEvents, allTasks, isToday) {
    col.innerHTML = '';

    const dayOfWeek = dateObj.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // 处理 override / skip
    const dayEvents = allDbEvents.filter(e => e.date === dateStr);
    const overriddenIds = new Set(dayEvents.filter(e => e.source === 'container_override').map(e => e.container_id));
    const skippedIds = new Set(dayEvents.filter(e => e.source === 'container_skip').map(e => e.container_id));

    const dayContainers = allContainers
        .filter(c => {
            if (skippedIds.has(c.id) || overriddenIds.has(c.id)) return false;
            return containerAppliesToDate(c, dateObj, dateStr, dayOfWeek, isWeekday, isWeekend);
        });

    const dateTasks = getDateTasksForDisplay(allTasks, dateStr);
    const taskAssignments = assignDateTasksToContainers(dateTasks, dayContainers);

    // 容器 → 事件格式
    const containerEvents = dayContainers
        .map(c => ({
            title: c.name,
            time_start: c.time_start,
            time_end: c.time_end,
            color: c.color || '#4A90D9',
            type: 'container',
            source: 'container',
            id: c.id,
            layer: getContainerLayer(c),
            isContainer: true,
            tasks: taskAssignments.get(c.id) || []
        }));

    // 普通事件（非 skip）
    const regularEvents = dayEvents
        .filter(e => e.source !== 'container_skip' && e.time_start && e.time_end)
        .map(e => ({
            title: e.title,
            time_start: e.time_start,
            time_end: e.time_end,
            color: e.color || '#3b82f6',
            type: 'event',
            source: e.source || 'manual',
            id: e.id,
            isContainer: false
        }));

    const allItems = [...containerEvents, ...regularEvents].sort((a, b) =>
        timeToMinutes(a.time_start) - timeToMinutes(b.time_start)
    );

    // 渲染事件块
    allItems.forEach(item => {
        const startMin = timeToMinutes(item.time_start);
        const endMin = timeToMinutes(item.time_end);
        const durationMin = endMin - startMin;
        if (durationMin <= 0) return;

        const top = startMin * (PX_PER_HOUR / 60);
        const height = Math.max(durationMin * (PX_PER_HOUR / 60), 16);

        const div = createFocusCalendarCard(item, top, height);
        col.appendChild(div);
    });

    // 当前时间红线（仅今日）
    if (isToday) {
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const timeLine = document.createElement('div');
        timeLine.className = 'gcal-current-time';
        timeLine.id = 'gcal-time-indicator';
        timeLine.style.top = `${nowMin * (PX_PER_HOUR / 60)}px`;
        col.appendChild(timeLine);
    }

    // 如果没有任何事件，显示提示
    if (allItems.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);';
        empty.innerHTML = '<p style="font-size: 12px; color: #94a3b8;">暂无日程</p>';
        col.appendChild(empty);
    }
}

function createFocusCalendarCard(item, top, height) {
    const div = document.createElement('div');
    const color = item.color || '#4A90D9';
    const source = item.source || (item.isContainer ? 'container' : 'manual');
    const layer = item.layer ?? 2;
    div.className = 'gcal-event';
    div.dataset.type = item.type || (item.isContainer ? 'container' : 'event');
    if (item.id) div.dataset.id = String(item.id);
    div.dataset.source = source;
    div.style.top = `${top}px`;
    div.style.height = `${height}px`;

    if (source === 'container') {
        div.dataset.layer = String(layer);
        if (layer === 1) {
            div.className = 'gcal-event layer-1';
            div.style.backgroundColor = color + '40';
            div.style.border = `2px dashed ${darkenColor(color, 0.15)}`;
            div.style.color = darkenColor(color, 0.35);
        } else {
            div.className = 'gcal-event layer-2';
            div.style.backgroundColor = color + '25';
            div.style.border = `2px dashed ${color}`;
            div.style.color = darkenColor(color, 0.35);
        }
    } else if (source === 'manual') {
        div.style.backgroundColor = color;
        div.style.borderLeft = '3px solid rgba(255,255,255,0.4)';
    } else {
        div.style.backgroundColor = color;
        div.style.borderLeft = `3px solid ${darkenColor(color, 0.3)}`;
    }

    const startTime = formatTime(item.time_start);
    const endTime = formatTime(item.time_end);
    div.innerHTML = `<h4>${escapeHTML(item.title)}</h4><span>${escapeHTML(startTime)} - ${escapeHTML(endTime)}</span>${item.isContainer ? renderContainerTasks(item.tasks) : ''}`;
    return div;
}

function updateCurrentTimeLine() {
    const indicator = document.getElementById('gcal-time-indicator');
    if (!indicator) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    indicator.style.top = `${nowMin * (PX_PER_HOUR / 60)}px`;
}

// ============================================================
// 第 4 列：本周进度
// ============================================================

async function loadWeeklyProgress() {
    const { start, end, startDate } = getWeekBounds();
    const allTasks = await TimeWhereDB.getAllTasks();

    // 统计
    const completedThisWeek = allTasks.filter(t =>
        t.progress === 'completed' && t.completed_at && t.completed_at.split('T')[0] >= start && t.completed_at.split('T')[0] <= end
    );
    const inProgressTasks = allTasks.filter(t => t.progress === 'in_progress');
    const notStartedTasks = allTasks.filter(t => t.progress === 'not_started');

    const completedCount = completedThisWeek.length;
    const inProgressCount = inProgressTasks.length;
    const notStartedCount = notStartedTasks.length;
    const totalCount = completedCount + inProgressCount + notStartedCount;

    // 更新饼图
    const pieChart = document.querySelector('.pie-chart');
    if (pieChart) {
        if (totalCount === 0) {
            pieChart.style.background = 'conic-gradient(#e2e8f0 0% 100%)';
        } else {
            const cp = (completedCount / totalCount) * 100;
            const ip = cp + (inProgressCount / totalCount) * 100;
            pieChart.style.background = `conic-gradient(var(--green) 0% ${cp}%, var(--orange) ${cp}% ${ip}%, var(--red) ${ip}% 100%)`;
        }
    }

    // 更新数字
    const totalEl = document.querySelector('.pie-total-num');
    if (totalEl) totalEl.textContent = totalCount;

    const legendCompleted = document.getElementById('legend-completed');
    const legendInProgress = document.getElementById('legend-in-progress');
    const legendNotStarted = document.getElementById('legend-not-started');
    if (legendCompleted) legendCompleted.textContent = completedCount;
    if (legendInProgress) legendInProgress.textContent = inProgressCount;
    if (legendNotStarted) legendNotStarted.textContent = notStartedCount;

    // 本周重点任务列表（有 due_date 在本周的 + 未完成的）
    const weekTasks = allTasks.filter(t => {
        if (t.progress === 'completed') return false;
        const dd = t.due_date || t.deadline;
        if (!dd) return false;
        return dd >= start && dd <= end;
    }).sort((a, b) => {
        const aDate = a.due_date || a.deadline || '';
        const bDate = b.due_date || b.deadline || '';
        return aDate.localeCompare(bDate) || prioritySortValue(a.priority) - prioritySortValue(b.priority);
    }).slice(0, 8);

    const taskList = document.querySelector('.week-tasks-section .simple-task-list');
    if (!taskList) return;

    if (weekTasks.length === 0) {
        taskList.innerHTML = '<div class="empty-state" style="padding: 16px;"><p style="font-size: 12px;">本周暂无截止任务</p></div>';
        await renderWeeklyJournalSummary(startDate);
        return;
    }

    taskList.innerHTML = weekTasks.map(task => `
        <button class="simple-task-item week-task-link" data-action="open-task-detail" data-task-id="${escapeAttribute(task.id)}">
            <span class="material-symbols-outlined">open_in_new</span>
            <div class="task-desc">${escapeHTML(task.title || '无标题')}</div>
        </button>`).join('');

    await renderWeeklyJournalSummary(startDate);
}

async function renderWeeklyJournalSummary(weekStartDate) {
    const grid = document.querySelector('.weekly-journal-grid');
    if (!grid) return;

    const todayStr = formatDateISO(new Date());
    const journals = TimeWhereDB.listDailyJournals ? await TimeWhereDB.listDailyJournals() : [];
    const journalByDate = new Map(journals.map(journal => [journal.date, journal]));
    const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    grid.innerHTML = weekLabels.map((label, index) => {
        const date = new Date(weekStartDate);
        date.setDate(weekStartDate.getDate() + index);
        const dateStr = formatDateISO(date);
        const journal = journalByDate.get(dateStr);
        const state = journal?.status === 'submitted'
            ? 'submitted'
            : (dateStr < todayStr ? 'overdue' : 'pending');
        const titleMap = {
            submitted: '已提交总结',
            overdue: '到期未提交',
            pending: '未到期'
        };

        return `
            <button class="weekly-journal-day ${state}" data-action="open-today-journal" data-journal-date="${escapeAttribute(dateStr)}" title="${escapeAttribute(titleMap[state])}">
                <span class="weekly-journal-weekday">${escapeHTML(label)}</span>
                <strong>${date.getDate()}</strong>
            </button>`;
    }).join('');
}

function openTaskDetailInPlanner(taskId) {
    if (!taskId) return;
    window.location.href = `../tasks/tasks.html?task_id=${encodeURIComponent(taskId)}`;
}

function renderContainerTasks(tasks) {
    if (!tasks || tasks.length === 0) return '';
    return `<div class="container-tasks">` + tasks.map(task => {
        const type = task.calendar_item_type === 'due' ? 'due' : 'start';
        const label = type === 'due' ? '结束' : '开始';
        return `<div class="container-task-item ${type}">
            <span class="task-item-title">${escapeHTML(task.title || '无标题')}</span>
            <span class="task-item-type task-item-${type}">${label}</span>
        </div>`;
    }).join('') + `</div>`;
}

// ============================================================
// 第 5 列：消息流
// ============================================================

async function loadFeedColumn() {
    const section = document.querySelector('.column-feed .column-content');
    if (!section) return;

    const today = new Date();
    const todayStr = formatDateISO(today);
    const tomorrowStr = formatDateISO(new Date(today.getTime() + 86400000));
    const dayOfWeek = today.getDay();

    const allTasks = await TimeWhereDB.getAllTasks();
    const todayEvents = (await TimeWhereDB.getEventsByDateRange(todayStr, todayStr)) || [];
    const allHabits = await TimeWhereDB.getHabits();

    // 过滤今日习惯
    const todayHabits = allHabits.filter(h => {
        if (h.frequency === 'daily') return true;
        if (h.frequency === 'custom' && h.repeat_days && h.repeat_days.includes(dayOfWeek)) return true;
        if (h.frequency === 'weekly') return true;
        return false;
    });

    const feedItems = [];

    // 过期任务
    allTasks.filter(t => {
        const dd = t.due_date || t.deadline;
        return dd && dd < todayStr && t.progress !== 'completed';
    }).forEach(t => {
        feedItems.push({
            type: 'alert',
            icon: 'error',
            title: '已过期',
            body: `${t.title} (截止 ${formatDate(t.due_date || t.deadline)})`,
            sortKey: 0,
            time: t.due_date || t.deadline
        });
    });

    // 今日到期
    allTasks.filter(t => {
        const dd = t.due_date || t.deadline;
        return dd === todayStr && t.progress !== 'completed';
    }).forEach(t => {
        feedItems.push({
            type: 'alert',
            icon: 'warning',
            title: '今日截止',
            body: t.title,
            sortKey: 1,
            time: todayStr
        });
    });

    // 明日到期
    allTasks.filter(t => {
        const dd = t.due_date || t.deadline;
        return dd === tomorrowStr && t.progress !== 'completed';
    }).forEach(t => {
        feedItems.push({
            type: 'note',
            icon: 'schedule',
            title: '明日截止',
            body: t.title,
            sortKey: 2,
            time: tomorrowStr
        });
    });

    // 即将到来的事件（2h 内）
    const nowMin = today.getHours() * 60 + today.getMinutes();
    todayEvents
        .filter(e => e.time_start && e.source !== 'container_skip')
        .filter(e => {
            const eventMin = timeToMinutes(e.time_start);
            return eventMin > nowMin && eventMin <= nowMin + 120;
        })
        .forEach(e => {
            feedItems.push({
                type: 'note',
                icon: 'event',
                title: '即将开始',
                body: `${e.title} (${e.time_start})`,
                sortKey: 3,
                time: todayStr + 'T' + e.time_start
            });
        });

    // 最近完成（24h 内）
    const oneDayAgo = new Date(today.getTime() - 86400000).toISOString();
    allTasks.filter(t => t.completed_at && t.completed_at > oneDayAgo).forEach(t => {
        feedItems.push({
            type: 'mention',
            icon: 'check_circle',
            title: '已完成',
            body: t.title,
            sortKey: 4,
            time: t.completed_at
        });
    });

    // 排序 & 限制
    feedItems.sort((a, b) => a.sortKey - b.sortKey);
    const limited = feedItems.slice(0, 20);

    let html = '';

    // 习惯区块
    if (todayHabits.length > 0) {
        html += `<div class="habits-section">
            <h3 class="habits-title"><span class="material-symbols-outlined">fitness_center</span> 今日习惯</h3>
            <div class="habit-list">`;
        for (const h of todayHabits) {
            const isDone = h.status_today === 'done';
            html += `
                <div class="habit-item" data-habit-id="${h.id}">
                    <button class="habit-check ${isDone ? 'done' : ''}" data-habit-id="${h.id}">
                        <span class="material-symbols-outlined">${isDone ? 'check' : 'circle'}</span>
                    </button>
                    <div class="habit-info">
                        <span class="habit-title ${isDone ? 'done' : ''}">${escapeHTML(h.title)}</span>
                        <span class="habit-streak">${h.streak || 0} 天连胜</span>
                    </div>
                </div>`;
        }
        html += '</div></div>';
    }

    if (limited.length === 0) {
        if (todayHabits.length === 0) {
            html += `
                <div class="empty-state">
                    <span class="material-symbols-outlined" style="font-size: 48px;">notifications_none</span>
                    <p>一切就绪，暂无提醒</p>
                </div>`;
        }
    } else {
        html += `<div class="feed-list">${limited.map(item => createFeedItem(item)).join('')}</div>`;
    }

    section.innerHTML = html;
}

function createFeedItem({ type, icon, title, body, time }) {
    const iconBgMap = { alert: 'background: #fee2e2; color: var(--red);', note: 'background: #e0e7ff; color: var(--accent);', mention: 'background: #d1fae5; color: var(--green);' };
    const iconStyle = iconBgMap[type] || iconBgMap.note;
    const timeText = relativeTime(time) || formatDate(time) || '';

    return `
        <div class="feed-item ${type}">
            <div class="feed-icon" style="${iconStyle}">
                <span class="material-symbols-outlined">${escapeHTML(icon)}</span>
            </div>
            <div class="feed-text">
                <p><strong>${escapeHTML(title)}</strong>: ${escapeHTML(body)}</p>
                <span class="feed-time">${escapeHTML(timeText)}</span>
            </div>
        </div>`;
}

// ============================================================
// 事件监听 & Modal
// ============================================================

function setupEventListeners() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const href = item.getAttribute('href');
            if (href === '#' || href === '' || href === null) {
                e.preventDefault();
            }
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });

    document.addEventListener('click', handleFocusDelegatedClick);
    document.addEventListener('change', handleFocusDelegatedChange);

    // Habit check buttons (delegated)
    const feedColumn = document.querySelector('.column-feed');
    if (feedColumn) {
        feedColumn.addEventListener('click', async (e) => {
            const habitBtn = e.target.closest('.habit-check');
            if (habitBtn) {
                e.stopPropagation();
                const habitId = habitBtn.dataset.habitId;
                await completeHabitNow(habitId);
                return;
            }
        });
    }
}

async function runFocusAction(control, action) {
    if (control?.dataset?.busy === 'true') return;
    if (control) {
        control.dataset.busy = 'true';
        control.disabled = true;
    }
    try {
        await action();
    } catch (error) {
        showToast(`操作失败：${error.message}`, 'error');
    } finally {
        if (control && document.body.contains(control)) {
            control.dataset.busy = 'false';
            control.disabled = false;
        }
    }
}

function handleFocusDelegatedClick(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const { action, taskId } = actionEl.dataset;
    if (action === 'add-task') {
        e.preventDefault();
        openAddTaskModal();
        return;
    }
    if (action === 'open-task-detail') {
        e.preventDefault();
        openTaskDetailInPlanner(taskId);
        return;
    }
    if (action === 'open-today-journal') {
        e.preventDefault();
        runFocusAction(actionEl, async () => {
            await openDailyJournalModal(actionEl.dataset.journalDate || formatDateISO(new Date()));
        });
        return;
    }
    if (action === 'open-task-arrange-review') {
        e.preventDefault();
        runFocusAction(actionEl, openTaskArrangeReviewModal);
        return;
    }
    if (action === 'close-modal') {
        e.preventDefault();
        closeAddTaskModal();
        closeDailyJournalModal();
        closeTaskArrangeReviewModal();
        return;
    }
    if (action === 'close-task-arrange-review') {
        e.preventDefault();
        closeTaskArrangeReviewModal();
        return;
    }
    if (action === 'close-daily-journal') {
        e.preventDefault();
        closeDailyJournalModal();
        return;
    }
    if (action === 'save-modal') {
        e.preventDefault();
        runFocusAction(actionEl, saveNewTask);
        return;
    }
    if (action === 'save-daily-journal-draft') {
        e.preventDefault();
        runFocusAction(actionEl, async () => saveDailyJournalFromModal(false));
        return;
    }
    if (action === 'submit-daily-journal') {
        e.preventDefault();
        runFocusAction(actionEl, async () => saveDailyJournalFromModal(true));
        return;
    }
    if (['start', 'pause', 'complete', 'defer'].includes(action)) {
        e.preventDefault();
        runFocusAction(actionEl, async () => {
            if (action === 'start') await startTaskNow(taskId);
            if (action === 'pause') await pauseTask(taskId);
            if (action === 'complete') await completeTaskNow(taskId);
            if (action === 'defer') await deferTask(taskId, parseInt(actionEl.dataset.days || '1', 10));
        });
    }
}

function handleFocusDelegatedChange() {}

function renderTaskArrangeReviewRows(records) {
    const rows = (records || []).flatMap(record => (record.changes || []).map(change => ({ record, change })));
    if (rows.length === 0) {
        return `<div class="arrange-review-empty">暂无新的自动调整。</div>`;
    }
    return `
        <div class="arrange-review-table-wrap">
            <table class="arrange-review-table">
                <thead>
                    <tr>
                        <th>Task</th>
                        <th>开始日期变化</th>
                        <th>优先级变化</th>
                        <th>来源</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(({ record, change }) => {
                        const startChange = change.from_start_date === change.to_start_date
                            ? '不变'
                            : `${change.from_start_date || '未设置'} → ${change.to_start_date || '未设置'}`;
                        const priorityChange = change.from_priority === change.to_priority
                            ? '不变'
                            : `${change.from_priority || 'medium'} → ${change.to_priority || 'medium'}`;
                        const statusClass = change.status === 'failed' ? 'failed' : 'applied';
                        const statusText = change.status === 'failed' ? `失败：${change.error || '未知错误'}` : '已自动应用';
                        return `
                            <tr class="${statusClass}">
                                <td>
                                    <strong>${escapeHTML(change.title || change.task_id || 'Untitled task')}</strong>
                                    <small>${escapeHTML(relativeTime(record.created_at) || formatDate(record.created_at) || '')}</small>
                                    <em>${escapeHTML(statusText)}</em>
                                </td>
                                <td>${escapeHTML(startChange)}</td>
                                <td>${escapeHTML(priorityChange)}</td>
                                <td>${escapeHTML(change.source === 'managebac' ? 'ManageBac' : change.source || 'TimeWhere')}</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

async function markUnreadTaskArrangeReviewsViewed(records) {
    const unreadIds = new Set((records || []).filter(record => !record.viewed_at).map(record => record.id));
    if (unreadIds.size === 0) return;
    const now = new Date().toISOString();
    const log = await getTaskArrangeReviewLog();
    const updated = log.map(record => unreadIds.has(record.id) ? { ...record, viewed_at: now } : record);
    await saveTaskArrangeReviewLog(updated);
}

async function openTaskArrangeReviewModal() {
    closeTaskArrangeReviewModal();
    const log = await getTaskArrangeReviewLog();
    const unread = log.filter(record => !record.viewed_at);
    const recordsToShow = unread.length > 0 ? unread : log.slice(0, 3);
    const unreadChangeCount = unread.reduce((total, record) => total + (record.changes?.length || 0), 0);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'taskArrangeReviewModal';
    modal.innerHTML = `
        <div class="modal-content task-arrange-review-modal">
            <div class="modal-header">
                <h3>Task Arrange Review</h3>
                <button class="modal-close" data-action="close-task-arrange-review">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="modal-body">
                <div class="arrange-review-summary">
                    <span class="badge ${unreadChangeCount > 0 ? 'red' : ''}">${unreadChangeCount > 0 ? `${unreadChangeCount} 项未读自动调整` : '暂无未读自动调整'}</span>
                    <span>这里展示 Task Arrange 已自动应用的最近结果，不需要手动确认。</span>
                </div>
                ${renderTaskArrangeReviewRows(recordsToShow)}
            </div>
            <div class="modal-footer">
                <button class="btn-primary" data-action="close-task-arrange-review">知道了</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    await markUnreadTaskArrangeReviewsViewed(unread);
    await refreshTaskArrangeReviewEntry();
}

function closeTaskArrangeReviewModal() {
    const modal = document.getElementById('taskArrangeReviewModal');
    if (modal) modal.remove();
}

function openAddTaskModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'addTaskModal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>添加任务</h3>
                <button class="modal-close" data-action="close-modal">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>任务标题</label>
                    <input type="text" id="taskTitle" placeholder="输入任务标题..." autofocus>
                </div>
                <div class="form-group">
                    <label>优先级</label>
                    <select id="taskPriority">
                        <option value="urgent">P1 - 紧急</option>
                        <option value="important">P2 - 重要</option>
                        <option value="medium" selected>P3 - 普通</option>
                        <option value="low">P4 - 低</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>截止日期</label>
                    <input type="date" id="taskDeadline">
                </div>
                <div class="form-group">
                    <label>预计时长（分钟）</label>
                    <input type="number" id="taskDuration" value="30" min="5" max="480">
                </div>
                <div class="form-group">
                    <label>分类</label>
                    <select id="taskBucket">
                        <option value="homework">作业</option>
                        <option value="test">考试</option>
                        <option value="ia">IA/EE</option>
                        <option value="project">项目</option>
                        <option value="notes">笔记</option>
                        <option value="review">复习</option>
                        <option value="other">其他</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" data-action="close-modal">取消</button>
                <button class="btn-primary" data-action="save-modal">保存</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('taskTitle')?.focus(), 100);
}

function closeAddTaskModal() {
    const modal = document.getElementById('addTaskModal');
    if (modal) modal.remove();
}

async function saveNewTask() {
    try {
        const title = document.getElementById('taskTitle').value.trim();
        const priority = document.getElementById('taskPriority').value;
        const deadline = document.getElementById('taskDeadline').value;
        const duration = parseInt(document.getElementById('taskDuration').value);

        if (!title) {
            showToast('请输入任务标题', 'error');
            return;
        }

        const todayStr = formatDateISO(new Date());
        await TimeWhereDB.addTask({
            title,
            priority,
            due_date: deadline || null,
            start_date: todayStr,
            duration: duration || 30,
            progress: 'not_started'
        });

        closeAddTaskModal();
        await loadDashboardData();
        showToast('任务已添加', 'success');
    } catch (error) {
        showToast(`添加任务失败：${error.message}`, 'error');
    }
}

function openJournalFromUrl() {
    const date = new URLSearchParams(window.location.search).get('journal_date');
    if (!date) return;
    openDailyJournalModal(date).catch(error => {
        showToast(`打开今日总结失败：${error.message}`, 'error');
    });
}

function renderJournalTaskList(tasks, emptyText) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return `<p class="journal-empty">${escapeHTML(emptyText)}</p>`;
    }
    return `<ul class="journal-task-list">${tasks.map(task => `
        <li>
            <span>${escapeHTML(task.title || '无标题任务')}</span>
            ${task.due_date ? `<small>截止 ${escapeHTML(formatDate(task.due_date))}</small>` : ''}
        </li>`).join('')}</ul>`;
}

function renderJournalPlannedTaskReview(draft) {
    const planned = Array.isArray(draft.planned_task_snapshots) ? draft.planned_task_snapshots : [];
    if (planned.length === 0) {
        return `<p class="journal-empty">今天没有冻结的计划任务。</p>`;
    }

    const completedIds = new Set((draft.completed_task_snapshots || []).map(task => String(task.id)));
    const delayedIds = new Set((draft.delayed_task_snapshots || []).map(task => String(task.id)));

    return `<ul class="journal-task-list journal-review-task-list">${planned.map(task => {
        const taskId = String(task.id);
        let statusClass = 'pending';
        let statusIcon = 'help';
        let statusLabel = '待确认';
        if (completedIds.has(taskId)) {
            statusClass = 'completed';
            statusIcon = 'check_circle';
            statusLabel = '任务完成';
        } else if (delayedIds.has(taskId)) {
            statusClass = 'delayed';
            statusIcon = 'close';
            statusLabel = '任务延误';
        }

        return `
            <li class="journal-task-status ${statusClass}">
                <span class="journal-task-status-main">
                    <span class="material-symbols-outlined journal-task-status-icon">${statusIcon}</span>
                    <span>${escapeHTML(task.title || '无标题任务')}</span>
                </span>
                <small>${escapeHTML(statusLabel)}</small>
            </li>`;
    }).join('')}</ul>`;
}

function journalTextarea(name, label, value) {
    return `
        <label class="journal-note-card">
            <span class="journal-note-title">${escapeHTML(label)}</span>
            <textarea data-journal-field="${escapeAttribute(name)}" rows="3" aria-label="${escapeAttribute(label)}" placeholder="补充说明...">${escapeHTML(value || '')}</textarea>
        </label>`;
}

async function openDailyJournalModal(date = formatDateISO(new Date())) {
    closeDailyJournalModal();
    const today = new Date(`${date}T12:00:00`);
    if (TimeWhereDB.ensureDailyJournalSnapshot && new Date().getHours() >= 6) {
        await TimeWhereDB.ensureDailyJournalSnapshot(date, new Date()).catch(error => {
            console.warn('[Focus] Daily journal snapshot skipped:', error);
        });
    }
    const draft = await TimeWhereDB.buildDailyJournalDraft(date, new Date());
    const statusText = draft.status === 'submitted' ? '已提交' : draft.status === 'draft' ? '草稿' : draft.snapshot_at ? '待整理' : '未生成计划快照';
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'dailyJournalModal';
    modal.dataset.journalDate = date;
    modal.innerHTML = `
        <div class="modal-content daily-journal-modal">
            <div class="modal-header">
                <h3>今日总结 · ${escapeHTML(formatDateISO(today))}</h3>
                <button class="modal-close" data-action="close-daily-journal">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="modal-body">
                <div class="journal-status-row">
                    <span class="badge">${escapeHTML(statusText)}</span>
                    <span>${escapeHTML(draft.snapshot_at ? `计划快照 ${relativeTime(draft.snapshot_at)}` : '6 点后首次可用时生成计划快照')}</span>
                </div>
                <div class="journal-review-layout">
                    <section class="journal-section">
                        <h4>今日任务 <strong>${draft.planned_task_snapshots?.length || 0}</strong></h4>
                        ${renderJournalPlannedTaskReview(draft)}
                    </section>
                    ${journalTextarea('delayed_notes', '计划延误说明', draft.delayed_notes)}
                    <section class="journal-section">
                        <h4>计划外完成 <strong>${draft.extra_done_task_snapshots?.length || 0}</strong></h4>
                        ${renderJournalTaskList(draft.extra_done_task_snapshots, '没有计划外完成任务。')}
                    </section>
                    ${journalTextarea('extra_done_notes', '计划外完成说明', draft.extra_done_notes)}
                    <div class="journal-summary-field">
                    ${journalTextarea('general_notes', '今日总结', draft.general_notes)}
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" data-action="close-daily-journal">取消</button>
                <button class="btn-secondary" data-action="save-daily-journal-draft">保存草稿</button>
                <button class="btn-primary" data-action="submit-daily-journal">提交总结</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function closeDailyJournalModal() {
    const modal = document.getElementById('dailyJournalModal');
    if (modal) modal.remove();
}

async function saveDailyJournalFromModal(submit) {
    const modal = document.getElementById('dailyJournalModal');
    if (!modal) return;
    const date = modal.dataset.journalDate || formatDateISO(new Date());
    const payload = {};
    modal.querySelectorAll('[data-journal-field]').forEach(field => {
        payload[field.dataset.journalField] = field.value || '';
    });
    if (submit) {
        await TimeWhereDB.submitDailyJournal(date, payload);
        showToast('今日总结已提交', 'success');
    } else {
        await TimeWhereDB.saveDailyJournalDraft(date, payload);
        showToast('今日总结草稿已保存', 'success');
    }
    closeDailyJournalModal();
    await loadTaskColumn();
}

// ============================================================
// Toast
// ============================================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================
// Habit
// ============================================================

async function completeHabitNow(habitId) {
    try {
        await TimeWhereDB.completeHabit(habitId);
        await loadFeedColumn();
        showToast('习惯已完成', 'success');
    } catch (e) {
        showToast('操作失败：' + e.message, 'error');
    }
}
