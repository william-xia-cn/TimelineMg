// ============================================================
// Focus Dashboard — script.js
// 4 列数据加载：当下任务 | 日历 | 本周进度 | 消息流
// ============================================================

const PX_PER_HOUR = 40;

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
            loadFeedColumn()
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
        _nthWeekdayOfMonth } = window.TimeWhereScheduling;

function formatDate(dateStr) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

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
        start: monday.toISOString().split('T')[0],
        end: sunday.toISOString().split('T')[0],
        startDate: monday,
        endDate: sunday
    };
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// ============================================================
// 第 1 列：当下任务
// ============================================================

async function loadTaskColumn() {
    const section = document.querySelector('.column-now .column-content');
    if (!section) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // 构建当日任务池：start_date <= today 或 null，且未完成
    const allTasks = await TimeWhereDB.getAllTasks();
    const taskPool = allTasks.filter(t =>
        t.progress !== 'completed' &&
        (t.start_date == null || t.start_date <= todayStr)
    );

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
            <div class="empty-state">
                <span class="material-symbols-outlined" style="font-size: 48px;">check_circle</span>
                <p>${settle.activeContainer ? '当前容器无任务' : '暂无待办任务'}</p>
                <button class="add-task-btn" onclick="openAddTaskModal()">
                    <span class="material-symbols-outlined">add</span> 添加任务
                </button>
            </div>`;
        return;
    }

    // 渲染任务卡片
    let html = '';
    const isContainerView = !!settle.activeContainer;
    settle.currentTasks.forEach((task, index) => {
        const isFirst = index === 0;
        const dueDate = task.due_date || task.deadline || '';
        const isOverdue = dueDate && dueDate < todayStr;
        const isDueToday = dueDate === todayStr;
        const isTimed = !!task.schedule_time;
        const isInProgress = task.progress === 'in_progress';

        html += createTaskCard(task, {
            expanded: isFirst || isInProgress,
            isOverdue,
            isDueToday,
            isTimed,
            isInProgress,
            isContainerView,
            containerOvertime: isContainerView && settle.containerInfo.used > settle.containerInfo.capacity
        });
    });
    section.innerHTML = html;
}

function createTaskCard(task, opts = {}) {
    const { expanded, isOverdue, isDueToday, isTimed, isInProgress } = opts;
    const openAttr = expanded ? ' open' : '';
    const title = task.title || '无标题任务';
    const pLabel = priorityLabel(task.priority);
    const pClass = priorityClass(task.priority);
    const durationText = `${task.duration || 45}min`;
    const dueDate = task.due_date || task.deadline;
    const deadlineText = dueDate ? formatDate(dueDate) : '';

    const dotClass = isInProgress ? 'pulsing' : 'pending';

    // 标签
    let tagsHtml = '';
    if (isOverdue) tagsHtml += '<span class="tag tag-overdue">逾期</span>';
    if (isDueToday) tagsHtml += '<span class="tag tag-due-today">今日截止</span>';
    if (isTimed) tagsHtml += `<span class="tag tag-timed">${task.schedule_time}</span>`;

    // 操作按钮
    const progressBtns = isInProgress
        ? `<button class="btn-micro" onclick="pauseTask('${task.id}')">暂停</button>
           <button class="btn-micro primary" onclick="completeTaskNow('${task.id}')">完成</button>`
        : `<button class="btn-micro primary" onclick="startTaskNow('${task.id}')">开始</button>
           <button class="btn-micro" onclick="completeTaskNow('${task.id}')">完成</button>`;

    const deferHtml = `
        <div class="defer-row">
            <span class="defer-label">延后</span>
            <button class="btn-defer" onclick="deferTask('${task.id}', 1)">1天</button>
            <button class="btn-defer" onclick="deferTask('${task.id}', 3)">3天</button>
            <button class="btn-defer" onclick="deferTask('${task.id}', 7)">7天</button>
        </div>`;

    return `
        <div class="accordion-task${isOverdue ? ' task-overdue' : ''}">
            <details${openAttr}>
                <summary>
                    <div class="task-title">
                        <span class="status-dot ${dotClass}"></span>
                        <h4>${title}</h4>
                    </div>
                    <span class="material-symbols-outlined expand-icon">expand_more</span>
                </summary>
                <div class="task-details">
                    ${task.notes || task.description ? `<p>${task.notes || task.description}</p>` : ''}
                    <div class="task-meta-tags">
                        <span class="priority-badge ${pClass}">${pLabel}</span>
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
    await TimeWhereDB.startTask(taskId);
    await loadDashboardData();
    showToast('任务已开始', 'info');
}

async function pauseTask(taskId) {
    await TimeWhereDB.updateTask(taskId, { progress: 'not_started' });
    await loadDashboardData();
    showToast('任务已暂停', 'info');
}

async function completeTaskNow(taskId) {
    await TimeWhereDB.completeTask(taskId);
    await loadDashboardData();
    showToast('任务已完成！', 'success');
}

async function deferTask(taskId, days) {
    const today = new Date();
    const target = new Date(today);
    target.setDate(today.getDate() + days);
    const targetStr = target.toISOString().split('T')[0];
    await TimeWhereDB.updateTask(taskId, { start_date: targetStr });
    await loadDashboardData();
    showToast(`任务已延后 ${days} 天`, 'info');
}

// ============================================================
// 第 2-3 列：日历视图（今日 & 明日）
// ============================================================

async function loadCalendarColumn() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

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

    // 渲染两天
    const todayCol = document.getElementById('gcal-today');
    const tomorrowCol = document.getElementById('gcal-tomorrow');

    if (todayCol) renderDayColumn(todayCol, today, todayStr, allContainers, dbEvents, true);
    if (tomorrowCol) renderDayColumn(tomorrowCol, tomorrow, tomorrowStr, allContainers, dbEvents, false);

    // 自动滚动到当前时间附近
    const gcalBody = document.querySelector('.gcal-body');
    if (gcalBody) {
        const currentMinutes = today.getHours() * 60 + today.getMinutes();
        const scrollTarget = Math.max(0, (currentMinutes * PX_PER_HOUR / 60) - 100);
        gcalBody.scrollTop = scrollTarget;
    }
}

function renderDayColumn(col, dateObj, dateStr, allContainers, allDbEvents, isToday) {
    col.innerHTML = '';

    const dayOfWeek = dateObj.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // 处理 override / skip
    const dayEvents = allDbEvents.filter(e => e.date === dateStr);
    const overriddenIds = new Set(dayEvents.filter(e => e.source === 'container_override').map(e => e.container_id));
    const skippedIds = new Set(dayEvents.filter(e => e.source === 'container_skip').map(e => e.container_id));

    // 容器 → 事件格式
    const containerEvents = allContainers
        .filter(c => {
            if (skippedIds.has(c.id) || overriddenIds.has(c.id)) return false;
            return containerAppliesToDate(c, dateObj, dateStr, dayOfWeek, isWeekday, isWeekend);
        })
        .map(c => ({
            title: c.name,
            time_start: c.time_start,
            time_end: c.time_end,
            color: c.color || '#4A90D9',
            isContainer: true
        }));

    // 普通事件（非 skip）
    const regularEvents = dayEvents
        .filter(e => e.source !== 'container_skip' && e.time_start && e.time_end)
        .map(e => ({
            title: e.title,
            time_start: e.time_start,
            time_end: e.time_end,
            color: e.color || '#3b82f6',
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

        const div = document.createElement('div');
        div.className = 'gcal-event';
        div.style.cssText = `top: ${top}px; height: ${height}px; background-color: ${item.color}; border-left: 3px solid ${darkenColor(item.color, 0.3)};`;
        if (item.isContainer) div.style.opacity = '0.7';
        div.innerHTML = `<h4>${item.title}</h4><span>${item.time_start} - ${item.time_end}</span>`;
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
    const { start, end } = getWeekBounds();
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
        return;
    }

    taskList.innerHTML = weekTasks.map(task => {
        const checked = task.progress === 'completed' ? ' checked' : '';
        const completedClass = task.progress === 'completed' ? ' completed-text' : '';
        return `
            <label class="simple-task-item">
                <input type="checkbox"${checked} onchange="toggleWeekTask('${task.id}', this.checked)">
                <span class="custom-chk"></span>
                <div class="task-desc${completedClass}">${task.title || '无标题'}</div>
            </label>`;
    }).join('');
}

async function toggleWeekTask(taskId, checked) {
    if (checked) {
        await TimeWhereDB.completeTask(taskId);
    } else {
        await TimeWhereDB.updateTask(taskId, { progress: 'not_started' });
    }
    await loadDashboardData();
}

// ============================================================
// 第 5 列：消息流
// ============================================================

async function loadFeedColumn() {
    const section = document.querySelector('.column-feed .column-content');
    if (!section) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

    const allTasks = await TimeWhereDB.getAllTasks();
    const todayEvents = (await TimeWhereDB.getEventsByDateRange(todayStr, todayStr)) || [];

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

    if (limited.length === 0) {
        section.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined" style="font-size: 48px;">notifications_none</span>
                <p>一切就绪，暂无提醒</p>
            </div>`;
        return;
    }

    section.innerHTML = limited.map(item => createFeedItem(item)).join('');
}

function createFeedItem({ type, icon, title, body, time }) {
    const iconBgMap = { alert: 'background: #fee2e2; color: var(--red);', note: 'background: #e0e7ff; color: var(--accent);', mention: 'background: #d1fae5; color: var(--green);' };
    const iconStyle = iconBgMap[type] || iconBgMap.note;
    const timeText = relativeTime(time) || formatDate(time) || '';

    return `
        <div class="feed-item ${type}">
            <div class="feed-icon" style="${iconStyle}">
                <span class="material-symbols-outlined">${icon}</span>
            </div>
            <div class="feed-text">
                <p><strong>${title}</strong>: ${body}</p>
                <span class="feed-time">${timeText}</span>
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

    document.querySelectorAll('.add-task-btn').forEach(btn => {
        btn.addEventListener('click', openAddTaskModal);
    });
}

function openAddTaskModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'addTaskModal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>添加任务</h3>
                <button class="modal-close" onclick="closeAddTaskModal()">
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
                <button class="btn-secondary" onclick="closeAddTaskModal()">取消</button>
                <button class="btn-primary" onclick="saveNewTask()">保存</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('taskTitle').focus(), 100);
}

function closeAddTaskModal() {
    const modal = document.getElementById('addTaskModal');
    if (modal) modal.remove();
}

async function saveNewTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const priority = document.getElementById('taskPriority').value;
    const deadline = document.getElementById('taskDeadline').value;
    const duration = parseInt(document.getElementById('taskDuration').value);
    const bucket = document.getElementById('taskBucket').value;

    if (!title) {
        showToast('请输入任务标题', 'error');
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    await TimeWhereDB.addTask({
        title,
        priority,
        due_date: deadline || null,
        start_date: todayStr,
        duration: duration || 30,
        bucket_id: bucket,
        bucket,
        progress: 'not_started'
    });

    closeAddTaskModal();
    await loadDashboardData();
    showToast('任务已添加', 'success');
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
// Window exports (for inline onclick handlers)
// ============================================================

window.startTaskNow = startTaskNow;
window.pauseTask = pauseTask;
window.completeTaskNow = completeTaskNow;
window.deferTask = deferTask;
window.toggleWeekTask = toggleWeekTask;
window.openAddTaskModal = openAddTaskModal;
window.closeAddTaskModal = closeAddTaskModal;
window.saveNewTask = saveNewTask;
