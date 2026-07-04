// ============================================================
// Focus Dashboard — script.js
// 4 列数据加载：当前任务 | 日历 | 本周进度 | 消息流
// ============================================================

const PX_PER_HOUR = 40;
const DASHBOARD_QUICK_ADD_DEFAULT_PLAN_KEYWORD = 'English';
const DASHBOARD_QUICK_ADD_BUCKET_NAME = '作业';
const DASHBOARD_SUBJECT_BUCKET_TEMPLATE = ['上课', '作业', '单元测试', '阶段考试'];
const DASHBOARD_OTHER_SCHOOL_BUCKET_TEMPLATE = ['事项', '活动', '申请', '其他'];
const PARTIAL_COMPLETION_RATIOS = [10, 20, 30, 50, 70, 80, 90];
const DASHBOARD_DETAIL_PRIORITIES = [
    { key: 'urgent', label: 'Urgent', color: '#ef4444', bgColor: '#fef2f2' },
    { key: 'important', label: 'Important', color: '#f59e0b', bgColor: '#fffbeb' },
    { key: 'medium', label: 'Medium', color: '#1d8cf8', bgColor: '#eff6ff' },
    { key: 'low', label: 'Low', color: '#64748b', bgColor: '#f8fafc' }
];
let dashboardCurrentTaskExpandedTaskId = null;

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
    globalThis.TimeWhereGoogleSyncStatusUI?.init?.();
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
    }).finally(() => {
        globalThis.TimeWhereGoogleSyncStatusUI?.refreshAll?.();
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
        buildDailyTaskPool, escapeHTML, escapeAttribute, _nthWeekdayOfMonth,
        expandEventsForDateRange, buildCalendarDayProjection,
        getCalendarTasksForDate, assignCalendarTasksToContainers } = window.TimeWhereScheduling;

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
    const quickAddHTML = renderCurrentTaskQuickAdd(todayStr);
    const footerActionsHTML = renderDashboardFooterActions(quickAddHTML, journalEntryHTML);

    // 更新 header badge — 容器状态 or 任务计数
    const badge = document.querySelector('.column-now .badge');
    if (badge) {
        const displayContainer = settle.currentContainerInfo?.container || null;
        if (displayContainer) {
            const displayStart = timeToMinutes(displayContainer.time_start);
            const displayEnd = timeToMinutes(displayContainer.time_end);
            const nowMin = now.getHours() * 60 + now.getMinutes();
            const isActiveDisplay = settle.activeContainer?.id === displayContainer.id;
            const remainMin = isActiveDisplay
                ? Math.max(0, displayEnd - nowMin)
                : Math.max(0, displayStart - nowMin);
            badge.textContent = isActiveDisplay
                ? `${displayContainer.name} · ${remainMin}min`
                : `下一段 ${displayContainer.name} · ${remainMin}min`;
            badge.className = 'badge container-active';
            badge.style.cssText = `background:${displayContainer.color}20; color:${displayContainer.color};`;
        } else {
            const count = (settle.displayTasks || settle.currentTasks || []).length;
            badge.textContent = count > 0 ? `${count} 项待办` : '无任务';
            badge.className = count > 0 ? 'badge red' : 'badge';
            badge.style.cssText = '';
        }
    }

    // 空状态
    const displayTasks = settle.displayTasks || settle.currentTasks || [];
    if (displayTasks.length === 0) {
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
            ${footerActionsHTML}`;
        return;
    }

    // 渲染任务卡片
    let html = '';
    const targetTaskId = new URLSearchParams(window.location.search).get('task_id');
    const requestedExpandedTaskId = targetTaskId || dashboardCurrentTaskExpandedTaskId;
    const hasExpandedTask = requestedExpandedTaskId
        ? displayTasks.some(task => String(task.id) === String(requestedExpandedTaskId))
        : false;
    if (dashboardCurrentTaskExpandedTaskId && !hasExpandedTask && !targetTaskId) {
        dashboardCurrentTaskExpandedTaskId = null;
    }
    const requestedExpandedIndex = hasExpandedTask
        ? displayTasks.findIndex(task => String(task.id) === String(requestedExpandedTaskId))
        : -1;
    const inProgressIndex = displayTasks.findIndex(task => task.progress === 'in_progress');
    const expandedIndex = requestedExpandedIndex >= 0 ? requestedExpandedIndex : (inProgressIndex >= 0 ? inProgressIndex : 0);
    displayTasks.forEach((task, index) => {
        const dueDate = task.due_date || task.deadline || '';
        const isOverdue = dueDate && dueDate < todayStr;
        const isDueToday = dueDate === todayStr;
        const isTimed = !!task.schedule_time;
        const isInProgress = task.progress === 'in_progress';
        const assignment = task.assignment || { status: 'unassigned', label: '当前未分配' };

        html += createTaskCard(task, {
            expanded: index === expandedIndex,
            isOverdue,
            isDueToday,
            isTimed,
            isInProgress,
            isContainerView: assignment.status !== 'unassigned',
            assignment,
            containerOvertime: assignment.status !== 'unassigned' && assignment.used > assignment.capacity
        });
    });
    section.innerHTML = `
        <div class="current-task-scroll-body custom-scrollbar">
            ${html}
        </div>
        ${footerActionsHTML}`;
    if (targetTaskId) {
        section.querySelector(`[data-task-card-id="${CSS.escape(targetTaskId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

async function renderDesktopWorkReminderBanner() {
    const reminderRuntime = globalThis.TimeWherePlatform?.reminderRuntime;
    if (typeof reminderRuntime?.getWorkReminderState !== 'function') return '';
    let state = null;
    try {
        const result = await reminderRuntime.getWorkReminderState();
        state = result?.state || result;
    } catch (_) {
        return '';
    }
    if (!state || state.status === 'idle' || !state.session_id) return '';
    const statusTextMap = {
        notification_visible: '任务提醒已发出',
        renotify_waiting: '通知已关闭，稍后再次提醒',
        execution_check_waiting: '本次提醒已处理',
        stopped: '本次提醒已停止'
    };
    const detailTextMap = {
        notification_visible: '系统通知仍在等待处理。',
        renotify_waiting: state.cooldown_until ? `${formatReminderClock(state.cooldown_until)} 后再次提醒。` : '稍后再次提醒。',
        execution_check_waiting: state.execution_check_at ? `${formatReminderClock(state.execution_check_at)} 后检查是否仍有工作待处理。` : '稍后检查是否仍有工作待处理。',
        stopped: '当前这轮工作提醒不会继续弹出。'
    };
    const countText = Number(state.total_count) > 0 ? `${Number(state.total_count)} 项待处理` : '当前工作提醒';
    const itemsText = (state.items || [])
        .slice(0, 3)
        .map(item => item.title)
        .filter(Boolean)
        .join('、');
    const canStop = state.status !== 'stopped';
    return `
        <div class="desktop-work-reminder-banner ${escapeAttribute(state.status)}" data-desktop-work-reminder>
            <div class="desktop-work-reminder-icon"><span class="material-symbols-outlined">notifications</span></div>
            <div class="desktop-work-reminder-copy">
                <strong>${escapeHTML(statusTextMap[state.status] || '任务提醒')}</strong>
                <span>${escapeHTML(countText)}${itemsText ? ` · ${escapeHTML(itemsText)}` : ''}</span>
                <small>${escapeHTML(detailTextMap[state.status] || '')}</small>
            </div>
            ${canStop ? '<button class="btn-micro secondary" type="button" data-action="stop-desktop-work-reminder">停止本次提醒</button>' : ''}
        </div>`;
}

function formatReminderClock(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function stopDesktopWorkReminder() {
    const result = await globalThis.TimeWherePlatform?.reminderRuntime?.stopCurrentWorkReminder?.();
    await loadFeedColumn();
    showToast(result?.status === 'stopped' ? '本次提醒已停止' : '当前没有进行中的提醒', 'info');
}

function renderDashboardFooterActions(quickAddHTML, journalEntryHTML) {
    return `<div class="dashboard-footer-actions">${quickAddHTML}${journalEntryHTML}</div>`;
}

function renderCurrentTaskQuickAdd(todayStr) {
    return `
        <button class="current-task-quick-add dashboard-footer-action" type="button" data-action="quick-add-current-task" data-quick-add-date="${escapeAttribute(todayStr)}" aria-label="临时添加任务">
            <span class="current-task-quick-add-icon"><span class="material-symbols-outlined">playlist_add</span></span>
            <span class="current-task-quick-add-copy">
                <span class="dashboard-footer-action-title">临时添加</span>
            </span>
        </button>`;
}

async function renderTodayJournalEntry(todayStr, now = new Date()) {
    if (TimeWhereDB.ensureDailyJournalSnapshot) {
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
    const statusLabel = labelMap[status] || labelMap.none;
    return `
        <button class="daily-journal-entry dashboard-footer-action daily-journal-status-${escapeAttribute(status)}" type="button" data-action="open-today-journal" data-journal-date="${escapeAttribute(todayStr)}" title="今日总结：${escapeAttribute(statusLabel)}" aria-label="今日总结，${escapeAttribute(statusLabel)}">
            <span class="daily-journal-icon" aria-hidden="true"><span class="material-symbols-outlined">edit</span></span>
            <span class="daily-journal-copy">
                <span class="dashboard-footer-action-title">今日总结</span>
            </span>
        </button>`;
}

function createTaskCard(task, opts = {}) {
    const { expanded, isOverdue, isDueToday, isTimed, isInProgress, assignment = task.assignment || null } = opts;
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
    const statusLabel = getTaskStatusLabel(task.progress);
    const checklistHtml = renderTaskChecklist(task);

    // 标签
    let tagsHtml = '';
    if (isOverdue) tagsHtml += '<span class="tag tag-overdue">逾期</span>';
    if (isDueToday) tagsHtml += '<span class="tag tag-due-today">今日截止</span>';
    if (isTimed) tagsHtml += `<span class="tag tag-timed">${escapeHTML(task.schedule_time)}</span>`;
    if (assignment?.status === 'unassigned') {
        tagsHtml += '<span class="tag tag-unassigned">当前未分配</span>';
    } else if (assignment?.status === 'current' || assignment?.status === 'upcoming') {
        const label = `${assignment.label || '后续'} ${assignment.container_name || ''}`.trim();
        tagsHtml += `<span class="tag tag-assigned">${escapeHTML(label)}</span>`;
    }

    // 操作按钮
    const partialCompleteToggleHtml = `<button class="btn-micro" data-action="toggle-partial-complete-menu" data-task-id="${taskId}" aria-expanded="false">部分完成</button>`;
    const checklist = Array.isArray(task.checklist) ? task.checklist : [];
    const partialGroup = findPartialCompletionGroup(checklist);
    const partialCompleteMenuHtml = `<div class="partial-complete-panel" data-partial-complete-menu-for="${taskId}" hidden>
            ${partialGroup || checklist.length === 0
                ? renderPartialCompleteRatioBody(taskId, partialGroup)
                : renderPartialCompleteChecklistBody(taskId, checklist)}
        </div>`;
    const progressBtns = isInProgress
        ? `<button class="btn-micro" data-action="pause" data-task-id="${taskId}">暂停</button>
           ${partialCompleteToggleHtml}
           <button class="btn-micro" data-action="complete" data-task-id="${taskId}">完成</button>`
        : `<button class="btn-micro" data-action="start" data-task-id="${taskId}">开始</button>
           ${partialCompleteToggleHtml}
           <button class="btn-micro" data-action="complete" data-task-id="${taskId}">完成</button>`;

    const deferBlockedHtml = isManageBacSource
        ? `<span class="defer-blocked-text">ManageBac 来源任务不能延后</span>`
        : '';
    const deferToggleHtml = !isManageBacSource
        ? `<button class="btn-micro" data-action="toggle-defer-menu" data-task-id="${taskId}" aria-expanded="false">延后</button>`
        : '';
    const deferMenuHtml = !isManageBacSource
        ? `<div class="defer-options-panel" data-defer-menu-for="${taskId}" hidden>
            <p class="defer-hint">延后会向后修改任务截止日期</p>
            <div class="defer-options" aria-label="选择延后天数">
                <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="1">1天</button>
                <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="3">3天</button>
                <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="7">7天</button>
            </div>
        </div>`
        : '';
    return `
        <div class="accordion-task${isOverdue ? ' task-overdue' : ''}${assignment?.status === 'unassigned' ? ' task-unassigned' : ''}" data-task-card-id="${taskId}">
            <details${openAttr}>
                <summary>
                    <div class="task-title" data-task-id="${taskId}">
                        <span class="status-dot ${dotClass}"></span>
                        <h4>${title}</h4>
                        <span class="task-status-label ${statusLabel.className}">${statusLabel.text}</span>
                    </div>
                    <span class="material-symbols-outlined expand-icon">expand_more</span>
                </summary>
                <div class="task-details">
                    <div class="task-detail-open-zone" data-action="open-current-task-detail" data-task-id="${taskId}" title="打开任务详情">
                        ${notes ? `<p>${notes}</p>` : ''}
                        ${checklistHtml}
                        <div class="task-meta-tags">
                            <span class="priority-badge ${pClass}">${pLabel}</span>
                            ${startDateText ? `<span class="meta-item start-date-item"><span class="material-symbols-outlined">play_arrow</span>开始 ${startDateText}</span>` : ''}
                            <span class="meta-item"><span class="material-symbols-outlined">schedule</span>${durationText}</span>
                            ${deadlineText ? `<span class="meta-item deadline-item">截止 ${deadlineText}</span>` : ''}
                            ${tagsHtml}
                        </div>
                    </div>
                    <div class="task-action-row">
                        <div class="task-action-left">${deferBlockedHtml}</div>
                        <div class="task-action-stack">
                            <div class="task-action-controls">
                                ${progressBtns}
                                ${deferToggleHtml}
                            </div>
                            ${partialCompleteMenuHtml}
                            ${deferMenuHtml}
                        </div>
                    </div>
                </div>
            </details>
        </div>`;
}

function getTaskStatusLabel(progress) {
    if (progress === 'completed') return { text: '已完成', className: 'completed' };
    if (progress === 'in_progress') return { text: '进行中', className: 'in-progress' };
    return { text: '未开始', className: 'not-started' };
}

function sanitizeDebugTask(task) {
    if (!task) return null;
    return {
        id: task.id,
        title: task.title || '',
        progress: task.progress || task.status || 'not_started',
        priority: task.priority || 'medium',
        plan_id: task.plan_id || null,
        bucket_id: task.bucket_id || null,
        start_date: task.start_date || null,
        arranged_date: task.arranged_date || null,
        due_date: task.due_date || task.deadline || null,
        schedule_time: task.schedule_time || null,
        duration: task.duration || null,
        source: task.source || task.source_type || null,
        subject: task.subject || task.plan_subject || null,
        subject_in_matrixview: task.subject_in_matrixview || task.plan_subject_in_matrixview || null,
        checklist: Array.isArray(task.checklist)
            ? task.checklist.map(item => ({ id: item.id || null, title: item.title || '', checked: !!item.checked }))
            : [],
        assignment: task.assignment ? { ...task.assignment } : null
    };
}

function sanitizeDebugContainer(container) {
    if (!container) return null;
    return {
        id: container.id,
        name: container.name || '',
        type: container.type || null,
        layer: container.layer ?? null,
        enabled: container.enabled !== false,
        date: container.date || null,
        repeat: container.repeat || null,
        repeat_days: container.repeat_days || null,
        time_start: container.time_start || null,
        time_end: container.time_end || null,
        color: container.color || null
    };
}

function sanitizeDebugEvent(event) {
    if (!event) return null;
    return {
        id: event.id,
        title: event.title || event.name || '',
        source: event.source || null,
        type: event.type || null,
        date: event.date || null,
        time_start: event.time_start || null,
        time_end: event.time_end || null,
        subject: event.subject || null,
        subject_in_matrixview: event.subject_in_matrixview || null,
        repeat: event.repeat || null,
        repeat_days: event.repeat_days || null
    };
}

function serializeSettleResult(settle) {
    const result = {};
    for (const [id, info] of settle.result.entries()) {
        result[id] = {
            container: sanitizeDebugContainer(info.container),
            capacity: info.capacity,
            used: info.used,
            tasks: (info.tasks || []).map(sanitizeDebugTask)
        };
    }
    return result;
}

async function buildFocusDebugSnapshot() {
    const now = new Date();
    const todayStr = formatDateISO(now);
    const allTasks = await TimeWhereDB.getAllTasks();
    const plans = TimeWhereDB.getPlans ? await TimeWhereDB.getPlans() : [];
    const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
    const events = TimeWhereDB.getEvents ? await TimeWhereDB.getEvents() : [];
    const matrixMappings = TimeWhereDB.getSetting
        ? (await TimeWhereDB.getSetting('matrixview_subject_mappings') || [])
        : [];
    const dateObj = new Date(todayStr + 'T00:00:00');
    const dow = dateObj.getDay();
    const isWeekday = dow >= 1 && dow <= 5;
    const isWeekend = dow === 0 || dow === 6;
    const todayContainers = allContainers.filter(c =>
        containerAppliesToDate(c, dateObj, todayStr, dow, isWeekday, isWeekend)
    );
    const taskPool = buildDailyTaskPool(allTasks, now);
    const settle = dailySettle(taskPool, todayContainers, now);
    let arrangePreview = null;
    try {
        if (window.TimeWhereScheduling?.arrangeTasks) {
            const preview = await window.TimeWhereScheduling.arrangeTasks(TimeWhereDB, now, { apply: false });
            arrangePreview = {
                proposed: preview.proposed,
                summary: preview.summary,
                changes: (preview.changes || []).map(change => ({
                    task_id: change.task_id,
                    title: change.task?.title || '',
                    source: change.task?.source || change.task?.source_type || null,
                    old_start_date: change.task?.start_date || null,
                    new_start_date: change.start_date || null,
                    updates: change.updates || {}
                }))
            };
        }
    } catch (error) {
        arrangePreview = { error: error.message };
    }
    const safeSettings = {};
    for (const key of ['task_arrange_dirty_at', 'task_arrange_last_checked_at', 'task_arrange_last_run_at']) {
        safeSettings[key] = TimeWhereDB.getSetting ? await TimeWhereDB.getSetting(key) : null;
    }
    return {
        schema: 'timewhere-focus-debug-v1',
        generated_at: now.toISOString(),
        page: {
            url: location.href,
            title: document.title,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            today: todayStr,
            now_local: now.toString()
        },
        counts: {
            all_tasks: allTasks.length,
            task_pool: taskPool.length,
            all_containers: allContainers.length,
            today_containers: todayContainers.length,
            events: events.length,
            plans: plans.length
        },
        plans: plans.map(plan => ({
            id: plan.id,
            name: plan.name || '',
            subject: plan.subject || null,
            subject_in_matrixview: plan.subject_in_matrixview || null,
            subject_active: plan.subject_active !== false
        })),
        matrixview_subject_mappings: Array.isArray(matrixMappings)
            ? matrixMappings.map(mapping => ({
                plan_name: mapping.plan_name || null,
                subject: mapping.subject || null,
                subject_in_matrixview: mapping.subject_in_matrixview || null,
                source: mapping.source || null,
                updated_at: mapping.updated_at || null
            }))
            : [],
        daily_settle: {
            input: {
                task_pool: taskPool.map(sanitizeDebugTask),
                today_containers: todayContainers.map(sanitizeDebugContainer)
            },
            output: {
                active_container: sanitizeDebugContainer(settle.activeContainer),
                current_container: sanitizeDebugContainer(settle.currentContainerInfo?.container),
                current_tasks: (settle.currentTasks || []).map(sanitizeDebugTask),
                display_tasks: (settle.displayTasks || []).map(sanitizeDebugTask),
                unassigned: (settle.unassigned || []).map(sanitizeDebugTask),
                containers: serializeSettleResult(settle)
            }
        },
        arrange_preview: arrangePreview,
        events: events.map(sanitizeDebugEvent),
        settings: safeSettings,
        dom: {
            current_task_cards: Array.from(document.querySelectorAll('[data-task-card-id]')).map(el => ({
                task_id: el.getAttribute('data-task-card-id'),
                class_name: el.className,
                text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500)
            }))
        }
    };
}

async function copyFocusDebugSnapshot() {
    try {
        const snapshot = await buildFocusDebugSnapshot();
        const text = JSON.stringify(snapshot, null, 2);
        await navigator.clipboard.writeText(text);
        showToast('诊断快照已复制，可直接粘贴给我', 'success');
    } catch (error) {
        console.error('[Focus] debug snapshot failed:', error);
        showToast(`复制诊断快照失败：${error.message}`, 'error');
    }
}

function renderTaskChecklist(task) {
    const checklist = Array.isArray(task.checklist) ? task.checklist : [];
    if (checklist.length === 0) return '';
    const taskId = escapeAttribute(task.id);
    const items = checklist.map(item => {
        const itemId = escapeAttribute(item.id || '');
        const title = escapeHTML(item.title || '');
        return `
            <label class="current-task-checklist-item">
                <input type="checkbox" data-action="toggle-current-checklist" data-task-id="${taskId}" data-checklist-id="${itemId}" ${item.checked ? 'checked' : ''}>
                <span>${title}</span>
            </label>`;
    }).join('');
    return `<div class="current-task-checklist">${items}</div>`;
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
        requestAnimationFrame(() => ensureDashboardCurrentTaskVisible(taskId));
        showToast(`任务已延后 ${days} 天`, 'info');
    } catch (error) {
        showToast(`延后任务失败：${error.message}`, 'error');
    }
}

async function toggleCurrentTaskChecklist(taskId, checklistId) {
    try {
        const task = await TimeWhereDB.getTaskById(taskId);
        const checklist = (task?.checklist || []).map(item =>
            String(item.id) === String(checklistId) ? { ...item, checked: !item.checked } : item
        );
        await TimeWhereDB.updateChecklist(taskId, checklist);
        await loadDashboardData();
    } catch (error) {
        showToast(`更新清单失败：${error.message}`, 'error');
    }
}

function toggleCurrentTaskDeferMenu(taskId) {
    const targetMenu = document.querySelector(`[data-defer-menu-for="${CSS.escape(String(taskId))}"]`);
    const targetButton = document.querySelector(`[data-action="toggle-defer-menu"][data-task-id="${CSS.escape(String(taskId))}"]`);
    if (!targetMenu || !targetButton) return;
    const shouldOpen = targetMenu.hasAttribute('hidden');

    closeCurrentTaskPartialCompleteMenus();
    document.querySelectorAll('[data-defer-menu-for]').forEach(menu => {
        menu.setAttribute('hidden', '');
    });
    document.querySelectorAll('[data-action="toggle-defer-menu"]').forEach(button => {
        button.setAttribute('aria-expanded', 'false');
    });

    if (shouldOpen) {
        dashboardCurrentTaskExpandedTaskId = String(taskId);
        targetMenu.removeAttribute('hidden');
        targetButton.setAttribute('aria-expanded', 'true');
    } else if (dashboardCurrentTaskExpandedTaskId === String(taskId)) {
        dashboardCurrentTaskExpandedTaskId = null;
    }
}

function closeCurrentTaskPartialCompleteMenus() {
    document.querySelectorAll('[data-partial-complete-menu-for]').forEach(menu => {
        menu.setAttribute('hidden', '');
    });
    document.querySelectorAll('[data-action="toggle-partial-complete-menu"]').forEach(button => {
        button.setAttribute('aria-expanded', 'false');
    });
}

function reopenCurrentTaskPartialCompleteMenu(taskId) {
    const escapedTaskId = CSS.escape(String(taskId));
    const targetMenu = document.querySelector(`[data-partial-complete-menu-for="${escapedTaskId}"]`);
    const targetButton = document.querySelector(`[data-action="toggle-partial-complete-menu"][data-task-id="${escapedTaskId}"]`);
    if (!targetMenu || !targetButton) return;
    targetMenu.removeAttribute('hidden');
    targetButton.setAttribute('aria-expanded', 'true');
    ensureDashboardCurrentTaskVisible(taskId);
}

function ensureDashboardCurrentTaskVisible(taskId) {
    const escapedTaskId = CSS.escape(String(taskId));
    document.querySelector(`[data-task-card-id="${escapedTaskId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function toggleCurrentTaskPartialCompleteMenu(taskId) {
    const escapedTaskId = CSS.escape(String(taskId));
    const targetMenu = document.querySelector(`[data-partial-complete-menu-for="${escapedTaskId}"]`);
    const targetButton = document.querySelector(`[data-action="toggle-partial-complete-menu"][data-task-id="${escapedTaskId}"]`);
    if (!targetMenu || !targetButton) return;
    const shouldOpen = targetMenu.hasAttribute('hidden');

    document.querySelectorAll('[data-defer-menu-for]').forEach(menu => {
        menu.setAttribute('hidden', '');
    });
    document.querySelectorAll('[data-action="toggle-defer-menu"]').forEach(button => {
        button.setAttribute('aria-expanded', 'false');
    });
    closeCurrentTaskPartialCompleteMenus();

    if (shouldOpen) {
        dashboardCurrentTaskExpandedTaskId = String(taskId);
        targetMenu.removeAttribute('hidden');
        targetButton.setAttribute('aria-expanded', 'true');
    } else if (dashboardCurrentTaskExpandedTaskId === String(taskId)) {
        dashboardCurrentTaskExpandedTaskId = null;
    }
}

function isPartialCompletionChecklistItem(item) {
    return item?.type === 'partial_completion'
        && !!item.partial_group_id
        && (item.partial_role === 'done' || item.partial_role === 'remaining');
}

function findPartialCompletionGroup(checklist = []) {
    const groups = new Map();
    (checklist || []).filter(isPartialCompletionChecklistItem).forEach(item => {
        const groupId = item.partial_group_id;
        const group = groups.get(groupId) || { partial_group_id: groupId, doneItem: null, remainingItem: null };
        if (item.partial_role === 'done') group.doneItem = item;
        if (item.partial_role === 'remaining') group.remainingItem = item;
        groups.set(groupId, group);
    });

    for (const group of groups.values()) {
        if (group.doneItem && group.remainingItem) {
            const parsedPercent = parseInt(group.doneItem.partial_percent, 10);
            group.partial_percent = PARTIAL_COMPLETION_RATIOS.includes(parsedPercent) ? parsedPercent : 50;
            return group;
        }
    }
    return null;
}

function generatePartialCompletionId(role) {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `partial-${role}-${Date.now()}`;
}

function buildPartialCompletionChecklist(percent, existingGroup = null) {
    const safePercent = PARTIAL_COMPLETION_RATIOS.includes(parseInt(percent, 10)) ? parseInt(percent, 10) : 50;
    const groupId = existingGroup?.partial_group_id
        || existingGroup?.doneItem?.partial_group_id
        || existingGroup?.remainingItem?.partial_group_id
        || generatePartialCompletionId('group');
    const doneItem = existingGroup?.doneItem || {};
    const remainingItem = existingGroup?.remainingItem || {};
    return [
        {
            ...doneItem,
            id: doneItem.id || generatePartialCompletionId('done'),
            title: `已完成占比 ${safePercent}%`,
            checked: true,
            type: 'partial_completion',
            partial_group_id: groupId,
            partial_role: 'done',
            partial_percent: safePercent
        },
        {
            ...remainingItem,
            id: remainingItem.id || generatePartialCompletionId('remaining'),
            title: `未完成占比 ${100 - safePercent}%`,
            checked: false,
            type: 'partial_completion',
            partial_group_id: groupId,
            partial_role: 'remaining',
            partial_percent: safePercent
        }
    ];
}

function replacePartialCompletionChecklistGroup(checklist = [], existingGroup, partialItems) {
    if (!existingGroup) return [...(checklist || []), ...partialItems];
    const replaceById = new Map(partialItems.map(item => [String(item.id), item]));
    const existingIds = new Set([
        existingGroup.doneItem?.id,
        existingGroup.remainingItem?.id
    ].filter(Boolean).map(String));
    const nextChecklist = (checklist || []).map(item => {
        if (!existingIds.has(String(item.id))) return item;
        return replaceById.get(String(item.id)) || item;
    });
    partialItems.forEach(item => {
        if (!nextChecklist.some(existing => String(existing.id) === String(item.id))) {
            nextChecklist.push(item);
        }
    });
    return nextChecklist;
}

async function saveCurrentTaskPartialCompleteRatio(taskId, percent) {
    dashboardCurrentTaskExpandedTaskId = String(taskId);
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) {
        showToast('任务不存在或已删除', 'error');
        return;
    }
    const currentChecklist = Array.isArray(task.checklist) ? task.checklist : [];
    const partialGroup = findPartialCompletionGroup(currentChecklist);
    const partialItems = buildPartialCompletionChecklist(percent, partialGroup);
    const nextChecklist = replacePartialCompletionChecklistGroup(currentChecklist, partialGroup, partialItems);
    await TimeWhereDB.updateChecklist(taskId, nextChecklist);
    closeCurrentTaskPartialCompleteMenus();
    await loadDashboardData();
    requestAnimationFrame(() => ensureDashboardCurrentTaskVisible(taskId));
    showToast('部分完成已更新', 'success');
}

async function saveCurrentTaskPartialCompleteChecklistItem(taskId, checklistId, checked) {
    dashboardCurrentTaskExpandedTaskId = String(taskId);
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) {
        showToast('任务不存在或已删除', 'error');
        return;
    }
    const checklist = (task.checklist || []).map(item =>
        String(item.id) === String(checklistId) ? { ...item, checked: !!checked } : item
    );
    await TimeWhereDB.updateChecklist(taskId, checklist);
    await loadDashboardData();
    requestAnimationFrame(() => reopenCurrentTaskPartialCompleteMenu(taskId));
    showToast('部分完成已更新', 'success');
}

function renderPartialCompleteChecklistBody(taskId, checklist) {
    const safeTaskId = escapeAttribute(taskId);
    const items = checklist.map(item => `
        <label class="partial-complete-check-item">
            <input type="checkbox" data-action="toggle-partial-complete-checklist" data-task-id="${safeTaskId}" data-checklist-id="${escapeAttribute(item.id || '')}" ${item.checked ? 'checked' : ''}>
            <span>${escapeHTML(item.title || '未命名清单项')}</span>
        </label>`).join('');
    return `
        <div class="partial-complete-dialog" data-mode="checklist" data-task-id="${safeTaskId}">
            <p class="partial-complete-hint">勾选已完成的清单项，会立即保存并联动任务状态。</p>
            <div class="partial-complete-check-list">${items}</div>
        </div>`;
}

function renderPartialCompleteRatioBody(taskId, partialGroup) {
    const safeTaskId = escapeAttribute(taskId);
    const selectedPercent = partialGroup?.partial_percent || 50;
    const options = PARTIAL_COMPLETION_RATIOS.map(percent => `
        <button type="button" class="partial-complete-ratio-option" data-action="partial-complete-ratio" data-task-id="${safeTaskId}" data-percent="${percent}" aria-pressed="${percent === selectedPercent ? 'true' : 'false'}">
            ${percent}%
        </button>`).join('');
    return `
        <div class="partial-complete-dialog" data-mode="ratio" data-task-id="${safeTaskId}">
            <p class="partial-complete-hint">选择完成比例，会立即用两条 checklist 模拟进度。</p>
            <div class="partial-complete-ratio-grid">${options}</div>
        </div>`;
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
    const allDbEvents = (await TimeWhereDB.getEvents()) || [];
    const dbEvents = expandEventsForDateRange(allDbEvents, todayStr, tomorrowStr);
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
    return getCalendarTasksForDate(tasks, dateStr);
}

function assignDateTasksToContainers(tasks, containers) {
    return assignCalendarTasksToContainers(tasks, containers);
}

function renderDayColumn(col, dateObj, dateStr, allContainers, allDbEvents, allTasks, isToday) {
    col.innerHTML = '';

    const projection = buildCalendarDayProjection({
        date: dateObj,
        dateStr,
        containers: allContainers,
        events: allDbEvents,
        tasks: allTasks
    });
    const allItems = projection.timedItems;

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
    const reminderBannerHTML = await renderDesktopWorkReminderBanner();

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
        if (todayHabits.length === 0 && !reminderBannerHTML) {
            html += `
                <div class="empty-state">
                    <span class="material-symbols-outlined" style="font-size: 48px;">notifications_none</span>
                    <p>一切就绪，暂无提醒</p>
                </div>`;
        }
    } else {
        html += `<div class="feed-list">${limited.map(item => createFeedItem(item)).join('')}</div>`;
    }

    html = `${reminderBannerHTML}${html}`;
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
    document.addEventListener('keydown', handleFocusDelegatedKeydown);
    window.addEventListener('timewhere-desktop-reminder-state', () => {
        loadFeedColumn().catch(error => console.warn('[Focus] reminder status refresh failed:', error));
    });

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
    if (action === 'open-external-link') {
        e.preventDefault();
        runFocusAction(actionEl, async () => openTaskNotesExternalLink(actionEl));
        return;
    }
    if (action === 'quick-add-current-task') {
        e.preventDefault();
        runFocusAction(actionEl, async () => quickAddCurrentTask());
        return;
    }
    if (action === 'stop-desktop-work-reminder') {
        e.preventDefault();
        runFocusAction(actionEl, stopDesktopWorkReminder);
        return;
    }
    if (action === 'dashboard-quick-add-progress') {
        e.preventDefault();
        setDashboardQuickAddActiveOption(actionEl, '.progress-option');
        return;
    }
    if (action === 'dashboard-quick-add-priority') {
        e.preventDefault();
        setDashboardQuickAddActiveOption(actionEl, '.priority-option');
        return;
    }
    if (action === 'dashboard-quick-add-label') {
        e.preventDefault();
        actionEl.classList.toggle('selected');
        return;
    }
    if (action === 'dashboard-quick-add-checklist-delete') {
        e.preventDefault();
        actionEl.closest('.checklist-item')?.remove();
        return;
    }
    if (action === 'save-dashboard-quick-add-task') {
        e.preventDefault();
        runFocusAction(actionEl, saveDashboardQuickAddTask);
        return;
    }
    if (action === 'close-dashboard-quick-add-task') {
        e.preventDefault();
        closeDashboardQuickAddTaskPanel();
        return;
    }
    if (action === 'add-task') {
        e.preventDefault();
        openAddTaskModal();
        return;
    }
    if (action === 'open-task-detail') {
        e.preventDefault();
        runFocusAction(actionEl, async () => openCurrentTaskDetailModal(taskId));
        return;
    }
    if (action === 'open-current-task-detail') {
        e.preventDefault();
        const detailZone = actionEl.closest('.task-detail-open-zone');
        const taskDetails = actionEl.closest('details');
        if (!detailZone || !taskDetails?.open) return;
        runFocusAction(actionEl, async () => openCurrentTaskDetailModal(taskId));
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
    if (action === 'copy-debug-snapshot') {
        e.preventDefault();
        runFocusAction(actionEl, copyFocusDebugSnapshot);
        return;
    }
    if (action === 'close-modal') {
        e.preventDefault();
        closeAddTaskModal();
        closeCurrentTaskDetailModal();
        closeDashboardQuickAddTaskPanel();
        closeDailyJournalModal();
        closeTaskArrangeReviewModal();
        closeCurrentTaskPartialCompleteMenus();
        return;
    }
    if (action === 'close-current-task-detail') {
        e.preventDefault();
        closeCurrentTaskDetailModal();
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
    if (action === 'save-current-task-detail') {
        e.preventDefault();
        runFocusAction(actionEl, saveCurrentTaskDetailModal);
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
    if (action === 'toggle-current-checklist') {
        e.preventDefault();
        runFocusAction(actionEl, async () => toggleCurrentTaskChecklist(taskId, actionEl.dataset.checklistId));
        return;
    }
    if (action === 'toggle-partial-complete-menu') {
        e.preventDefault();
        toggleCurrentTaskPartialCompleteMenu(taskId);
        return;
    }
    if (action === 'partial-complete-ratio') {
        e.preventDefault();
        runFocusAction(actionEl, async () => saveCurrentTaskPartialCompleteRatio(taskId, parseInt(actionEl.dataset.percent || '50', 10)));
        return;
    }
    if (action === 'toggle-defer-menu') {
        e.preventDefault();
        toggleCurrentTaskDeferMenu(taskId);
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

function handleFocusDelegatedChange(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    if (actionEl.dataset.action === 'toggle-partial-complete-checklist') {
        runFocusAction(actionEl, async () => saveCurrentTaskPartialCompleteChecklistItem(
            actionEl.dataset.taskId,
            actionEl.dataset.checklistId,
            actionEl.checked
        ));
        return;
    }
    if (actionEl.dataset.action === 'dashboard-quick-add-plan-change') {
        runFocusAction(actionEl, async () => refreshDashboardQuickAddPlanFields(actionEl.value));
    }
    if (actionEl.dataset.action === 'dashboard-quick-add-recurrence-change') {
        updateDashboardQuickAddRecurrenceControls();
    }
}

function handleFocusDelegatedKeydown(e) {
    if (e.key === 'Escape' && e.target.closest?.('#dashboardQuickAddTaskPanel')) {
        e.preventDefault();
        closeDashboardQuickAddTaskPanel();
        return;
    }
    if (e.key !== 'Enter') return;

    const panel = e.target.closest?.('#dashboardQuickAddTaskPanel');
    if (panel && !e.target.matches('textarea')) {
        if (e.target.matches('#dashboardChecklistNewItem')) {
            e.preventDefault();
            addDashboardQuickAddChecklistItem();
            return;
        }
        e.preventDefault();
        const button = panel.querySelector('[data-action="save-dashboard-quick-add-task"]');
        runFocusAction(button, saveDashboardQuickAddTask);
        return;
    }

}

function setDashboardQuickAddActiveOption(button, selector) {
    const group = button.closest('.progress-picker, .priority-picker');
    if (!group) return;
    group.querySelectorAll(selector).forEach(item => item.classList.remove('active'));
    button.classList.add('active');
}

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
                        <th>来源</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(({ record, change }) => {
                        const startChange = change.from_start_date === change.to_start_date
                            ? '不变'
                            : `${change.from_start_date || '未设置'} → ${change.to_start_date || '未设置'}`;
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

async function openCurrentTaskDetailModal(taskId) {
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) {
        showToast('任务不存在或已删除', 'error');
        return;
    }
    closeCurrentTaskDetailModal();
    const isManageBacSource = TimeWhereDB.isManageBacSourceTask?.(task) === true;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'currentTaskDetailModal';
    modal.dataset.taskId = task.id;
    modal.innerHTML = `
        <div class="modal-content current-task-detail-modal">
            <div class="modal-header">
                <h3>任务详情</h3>
                <button class="modal-close" data-action="close-current-task-detail">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="modal-body">
                ${isManageBacSource ? '<p class="source-readonly-hint">ManageBac 来源标题和截止日期只读；可修改本地状态、优先级、开始日期、定时时间、时长和笔记。</p>' : ''}
                <div class="form-group">
                    <label>任务标题</label>
                    <input type="text" id="detailTaskTitle" value="${escapeAttribute(task.title || '')}" ${isManageBacSource ? 'readonly' : ''}>
                </div>
                <div class="form-grid two-col">
                    <div class="form-group">
                        <label>状态</label>
                        <select id="detailTaskProgress">
                            <option value="not_started" ${task.progress === 'not_started' ? 'selected' : ''}>未开始</option>
                            <option value="in_progress" ${task.progress === 'in_progress' ? 'selected' : ''}>进行中</option>
                            <option value="completed" ${task.progress === 'completed' ? 'selected' : ''}>已完成</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>优先级</label>
                        <select id="detailTaskPriority">
                            <option value="urgent" ${task.priority === 'urgent' ? 'selected' : ''}>P1 - 紧急</option>
                            <option value="important" ${task.priority === 'important' ? 'selected' : ''}>P2 - 重要</option>
                            <option value="medium" ${!task.priority || task.priority === 'medium' ? 'selected' : ''}>P3 - 普通</option>
                            <option value="low" ${task.priority === 'low' ? 'selected' : ''}>P4 - 低</option>
                        </select>
                    </div>
                </div>
                <div class="form-grid two-col">
                    <div class="form-group">
                        <label>开始日期</label>
                        <input type="date" id="detailTaskStartDate" value="${escapeAttribute(task.start_date || '')}">
                    </div>
                    <div class="form-group">
                        <label>截止日期</label>
                        <input type="date" id="detailTaskDueDate" value="${escapeAttribute(task.due_date || task.deadline || '')}" ${isManageBacSource ? 'disabled' : ''}>
                    </div>
                </div>
                <div class="form-grid two-col">
                    <div class="form-group">
                        <label>定时时间</label>
                        <input type="time" id="detailTaskScheduleTime" value="${escapeAttribute(task.schedule_time || '')}">
                    </div>
                    <div class="form-group">
                        <label>预计时长（分钟）</label>
                        <input type="number" id="detailTaskDuration" value="${escapeAttribute(String(task.duration || 45))}" min="5" max="480" step="5">
                    </div>
                </div>
                <div class="form-group">
                    <label>说明</label>
                    <textarea id="detailTaskNotes" rows="4">${escapeHTML(task.notes || task.description || '')}</textarea>
                    <div class="notes-link-preview" data-notes-link-preview>${renderTaskNotesExternalLinks(task.notes || task.description || '')}</div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" data-action="close-current-task-detail">取消</button>
                <button class="btn-primary" data-action="save-current-task-detail">保存</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('detailTaskNotes')?.addEventListener('input', event => {
        refreshTaskNotesExternalLinks(modal, event.target.value);
    });
    setTimeout(() => document.getElementById('detailTaskTitle')?.focus(), 100);
}

function closeCurrentTaskDetailModal() {
    const modal = document.getElementById('currentTaskDetailModal');
    if (modal) modal.remove();
}

async function saveCurrentTaskDetailModal() {
    const modal = document.getElementById('currentTaskDetailModal');
    const taskId = modal?.dataset?.taskId;
    if (!taskId) return;
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) {
        closeCurrentTaskDetailModal();
        showToast('任务不存在或已删除', 'error');
        return;
    }
    const isManageBacSource = TimeWhereDB.isManageBacSourceTask?.(task) === true;
    const progress = document.getElementById('detailTaskProgress')?.value || 'not_started';
    const updates = {
        progress,
        priority: document.getElementById('detailTaskPriority')?.value || 'medium',
        start_date: document.getElementById('detailTaskStartDate')?.value || null,
        schedule_time: document.getElementById('detailTaskScheduleTime')?.value || null,
        duration: parseInt(document.getElementById('detailTaskDuration')?.value || '45', 10) || 45,
        notes: document.getElementById('detailTaskNotes')?.value || '',
        completed_at: progress === 'completed' ? (task.completed_at || new Date().toISOString()) : null
    };
    if (!isManageBacSource) {
        const title = document.getElementById('detailTaskTitle')?.value?.trim();
        if (!title) {
            showToast('请输入任务标题', 'error');
            return;
        }
        updates.title = title;
        updates.due_date = document.getElementById('detailTaskDueDate')?.value || null;
    }
    await TimeWhereDB.updateTask(taskId, updates);
    closeCurrentTaskDetailModal();
    await loadDashboardData();
    showToast('任务详情已更新', 'success');
}

function renderTaskNotesExternalLinks(text) {
    return globalThis.TimeWhereExternalLinks?.renderExternalLinkList?.(text || '') || '';
}

function refreshTaskNotesExternalLinks(root, text) {
    const target = root?.querySelector('[data-notes-link-preview]');
    if (target) target.innerHTML = renderTaskNotesExternalLinks(text);
}

async function openTaskNotesExternalLink(button) {
    const url = button?.dataset?.url || '';
    if (!globalThis.TimeWhereExternalLinks?.openExternalUrl) throw new Error('外部链接模块未加载');
    await globalThis.TimeWhereExternalLinks.openExternalUrl(url);
}

async function ensureDashboardQuickAddPlanAndBucket() {
    let plans = await TimeWhereDB.getPlans();
    let plan = findDashboardQuickAddDefaultPlan(plans);
    if (!plan) {
        plan = await TimeWhereDB.ensureDefaultPlan();
    }

    if (TimeWhereDB.ensureBucketTemplateForPlan) {
        await TimeWhereDB.ensureBucketTemplateForPlan(plan.id, getDashboardQuickAddBucketTemplateForPlan(plan));
    }

    let buckets = await TimeWhereDB.getBucketsByPlan(plan.id);
    let bucket = buckets.find(item => item.name === DASHBOARD_QUICK_ADD_BUCKET_NAME) || null;
    let labels = await TimeWhereDB.getLabelsByPlan?.(plan.id) || [];

    plans = await TimeWhereDB.getPlans();
    buckets = await TimeWhereDB.getBucketsByPlan(plan.id);
    bucket = buckets.find(item => item.name === DASHBOARD_QUICK_ADD_BUCKET_NAME) || bucket || null;
    labels = await TimeWhereDB.getLabelsByPlan?.(plan.id) || labels;
    return { plan, bucket, plans, buckets, labels };
}

async function quickAddCurrentTask() {
    await openDashboardQuickAddTaskPanel();
}

function findDashboardQuickAddDefaultPlan(plans = []) {
    const candidates = plans || [];
    const keyword = DASHBOARD_QUICK_ADD_DEFAULT_PLAN_KEYWORD.toLowerCase();
    return candidates.find(plan => {
        const values = [plan.name, plan.subject, plan.subject_in_matrixview].filter(Boolean).map(value => String(value).toLowerCase());
        return values.some(value => value.includes(keyword) || value.includes('英文'));
    }) || candidates[0] || null;
}

function getDashboardQuickAddBucketTemplateForPlan(plan) {
    return plan?.name === 'Other School Plan'
        ? DASHBOARD_OTHER_SCHOOL_BUCKET_TEMPLATE
        : DASHBOARD_SUBJECT_BUCKET_TEMPLATE;
}

function renderDashboardQuickAddPlanOptions(plans, selectedPlanId) {
    return (plans || []).map(plan => {
        const selected = String(plan.id) === String(selectedPlanId) ? 'selected' : '';
        return `<option value="${escapeAttribute(plan.id)}" ${selected}>${escapeHTML(plan.name || 'Untitled Plan')}</option>`;
    }).join('');
}

function renderDashboardQuickAddBucketOptions(buckets, selectedBucketId) {
    return [
        `<option value="">No bucket</option>`,
        ...(buckets || []).map(bucket => {
            const selected = String(bucket.id) === String(selectedBucketId) ? 'selected' : '';
            return `<option value="${escapeAttribute(bucket.id)}" ${selected}>${escapeHTML(bucket.name || 'Untitled Bucket')}</option>`;
        })
    ].join('');
}

function getDashboardQuickAddPlanSubject(plan) {
    return plan?.subject || plan?.subject_in_matrixview || plan?.name || 'No subject';
}

function renderDashboardQuickAddProgressOptions(selectedProgress = 'not_started') {
    const progresses = [
        { key: 'not_started', label: 'Not started', icon: 'radio_button_unchecked' },
        { key: 'in_progress', label: 'In progress', icon: 'timelapse' },
        { key: 'completed', label: 'Completed', icon: 'check_circle' }
    ];
    return progresses.map(item => `
        <button type="button" class="progress-option ${item.key === selectedProgress ? 'active' : ''}" data-action="dashboard-quick-add-progress" data-progress="${item.key}">
            <span class="material-symbols-outlined">${item.icon}</span> ${item.label}
        </button>`).join('');
}

function renderDashboardQuickAddPriorityOptions(selectedPriority = 'medium') {
    return DASHBOARD_DETAIL_PRIORITIES.map(item => `
        <button
            type="button"
            class="priority-option ${item.key === selectedPriority ? 'active' : ''}"
            data-action="dashboard-quick-add-priority"
            data-priority="${item.key}"
            style="--pri-color:${item.color};--pri-bg:${item.bgColor}"
        >${item.label}</button>`).join('');
}

function renderDashboardQuickAddLabelChips(labels = [], selectedIds = []) {
    if (!labels.length) return '<span class="text-muted">No labels defined for this plan</span>';
    const selectedSet = new Set(selectedIds.map(String));
    return labels.map(label => `
        <button
            type="button"
            class="label-chip ${selectedSet.has(String(label.id)) ? 'selected' : ''}"
            data-action="dashboard-quick-add-label"
            data-label-id="${escapeAttribute(label.id)}"
            style="--label-color:${escapeAttribute(label.color || '#94a3b8')}"
        >${escapeHTML(label.name || label.color || 'Label')}</button>`).join('');
}

function renderDashboardQuickAddChecklistItems(items = []) {
    return (items || []).map(item => `
        <div class="checklist-item" data-item-id="${escapeAttribute(item.id)}">
            <input type="checkbox" class="checklist-checkbox" ${item.checked ? 'checked' : ''}>
            <span class="checklist-text ${item.checked ? 'checked' : ''}">${escapeHTML(item.title || '')}</span>
            <button type="button" class="checklist-delete" data-action="dashboard-quick-add-checklist-delete" title="Delete">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>`).join('');
}

async function openDashboardQuickAddTaskPanel(prefillTitle = '') {
    closeDashboardQuickAddTaskPanel();
    const todayStr = formatDateISO(new Date());
    const { plan, bucket, plans, buckets, labels } = await ensureDashboardQuickAddPlanAndBucket();
    const section = document.querySelector('.column-now .column-content');
    if (!section) return;

    const panel = document.createElement('div');
    panel.className = 'dashboard-task-detail-panel open';
    panel.id = 'dashboardQuickAddTaskPanel';
    panel.innerHTML = `
        <div class="detail-header">
            <div class="detail-header-title">
                <h2>Task Details</h2>
                <span class="source-badge">New</span>
            </div>
            <div class="detail-header-actions">
                <button type="button" class="task-detail-menu-btn" title="More task actions" disabled>
                    <span class="material-symbols-outlined">more_horiz</span>
                </button>
                <button type="button" class="detail-close-btn" data-action="close-dashboard-quick-add-task" title="Close">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        </div>

        <div class="detail-body custom-scrollbar">
            <div class="detail-field">
                <div class="detail-title" contenteditable="true" data-field="title" placeholder="Task title">${escapeHTML(prefillTitle)}</div>
            </div>

            <div class="detail-field">
                <label>Progress</label>
                <div class="progress-picker">${renderDashboardQuickAddProgressOptions('not_started')}</div>
            </div>

            <div class="detail-field detail-field-row">
                <div class="detail-field-half">
                    <label>TimeWhere Plan</label>
                    <select class="detail-select" data-field="plan_id" data-action="dashboard-quick-add-plan-change">
                        ${renderDashboardQuickAddPlanOptions(plans, plan.id)}
                    </select>
                </div>
                <div class="detail-field-half">
                    <label>Subject</label>
                    <div class="detail-readonly-value" data-field="subject">${escapeHTML(getDashboardQuickAddPlanSubject(plan))}</div>
                </div>
            </div>

            <div class="detail-field">
                <label>Priority</label>
                <div class="priority-picker">${renderDashboardQuickAddPriorityOptions('medium')}</div>
            </div>

            <div class="detail-field">
                <label>Bucket</label>
                <select class="detail-select" data-field="bucket_id">
                    ${renderDashboardQuickAddBucketOptions(buckets, bucket?.id || null)}
                </select>
            </div>

            <div class="detail-field detail-field-row">
                <div class="detail-field-half">
                    <label>Start date</label>
                    <input type="date" class="detail-date" data-field="start_date" value="${escapeAttribute(todayStr)}">
                </div>
                <div class="detail-field-half">
                    <label>Due date</label>
                    <input type="date" class="detail-date" data-field="due_date" value="${escapeAttribute(todayStr)}">
                </div>
            </div>

            <div class="detail-field detail-field-row">
                <div class="detail-field-half">
                    <label>定时时间</label>
                    <input type="time" class="detail-date" data-field="schedule_time" value="">
                </div>
                <div class="detail-field-half">
                    <label>预计时长 (分钟)</label>
                    <input type="number" class="detail-date" data-field="duration" value="30" min="5" max="480" step="5">
                </div>
            </div>

            <div class="detail-field">
                <label>Checklist</label>
                <div class="checklist-list" id="dashboardChecklistItems">${renderDashboardQuickAddChecklistItems([])}</div>
                <div class="checklist-add">
                    <input type="text" class="checklist-add-input" id="dashboardChecklistNewItem" placeholder="Add an item...">
                </div>
            </div>

            <div class="detail-field recurrence-detail-section" data-recurrence-section>
                <label>周期任务</label>
                <div class="recurrence-create-panel">
                    <select class="detail-select" data-field="recurrence_frequency" data-action="dashboard-quick-add-recurrence-change">
                        <option value="none">不重复</option>
                        <option value="weekly">每周</option>
                        <option value="monthly">每月</option>
                    </select>
                    <input type="number" class="detail-date recurrence-count-input" data-field="recurrence_count" min="2" max="12" value="2" disabled>
                </div>
                <p class="source-readonly-hint">周期任务必须有截止日期，最多生成 12 个实例。</p>
            </div>

            <div class="detail-field">
                <label>Labels</label>
                <div class="labels-picker" data-field="labels">${renderDashboardQuickAddLabelChips(labels, [])}</div>
            </div>

            <div class="detail-field">
                <label>Notes</label>
                <textarea class="detail-textarea" data-field="notes" placeholder="Add notes..." rows="4"></textarea>
            </div>
        </div>

        <div class="detail-footer dashboard-task-detail-footer">
            <button type="button" class="btn-secondary" data-action="close-dashboard-quick-add-task">Cancel</button>
            <button type="button" class="btn-primary" data-action="save-dashboard-quick-add-task">Save task</button>
        </div>`;
    section.appendChild(panel);
    setTimeout(() => panel.querySelector('[data-field="title"]')?.focus(), 100);
}

function closeDashboardQuickAddTaskPanel() {
    const panel = document.getElementById('dashboardQuickAddTaskPanel');
    if (panel) panel.remove();
}

async function refreshDashboardQuickAddPlanFields(planIdValue) {
    const panel = document.getElementById('dashboardQuickAddTaskPanel');
    const bucketSelect = panel?.querySelector('[data-field="bucket_id"]');
    const labelsEl = panel?.querySelector('[data-field="labels"]');
    if (!bucketSelect) return;
    const planId = parseInt(planIdValue, 10);
    if (!planId) {
        bucketSelect.innerHTML = renderDashboardQuickAddBucketOptions([], null);
        if (labelsEl) labelsEl.innerHTML = renderDashboardQuickAddLabelChips([], []);
        return;
    }
    const plans = await TimeWhereDB.getPlans();
    const plan = plans.find(item => String(item.id) === String(planId));
    if (plan && TimeWhereDB.ensureBucketTemplateForPlan) {
        await TimeWhereDB.ensureBucketTemplateForPlan(planId, getDashboardQuickAddBucketTemplateForPlan(plan));
    }
    const buckets = await TimeWhereDB.getBucketsByPlan(planId);
    const preferredBucket = buckets.find(item => item.name === DASHBOARD_QUICK_ADD_BUCKET_NAME) || null;
    bucketSelect.innerHTML = renderDashboardQuickAddBucketOptions(buckets, preferredBucket?.id || null);
    const subjectEl = panel?.querySelector('[data-field="subject"]');
    if (subjectEl) subjectEl.textContent = getDashboardQuickAddPlanSubject(plan);
    const labels = await TimeWhereDB.getLabelsByPlan?.(planId) || [];
    if (labelsEl) labelsEl.innerHTML = renderDashboardQuickAddLabelChips(labels, []);
}

function updateDashboardQuickAddRecurrenceControls() {
    const panel = document.getElementById('dashboardQuickAddTaskPanel');
    const recurrenceFrequency = panel?.querySelector('[data-field="recurrence_frequency"]');
    const recurrenceCount = panel?.querySelector('[data-field="recurrence_count"]');
    if (!recurrenceFrequency || !recurrenceCount) return;
    recurrenceCount.disabled = !['weekly', 'monthly'].includes(recurrenceFrequency.value);
}

function addDashboardQuickAddChecklistItem() {
    const panel = document.getElementById('dashboardQuickAddTaskPanel');
    const input = panel?.querySelector('#dashboardChecklistNewItem');
    const list = panel?.querySelector('#dashboardChecklistItems');
    const title = input?.value?.trim() || '';
    if (!input || !list || !title) return;
    const item = {
        id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `checklist-${Date.now()}`,
        title,
        checked: false
    };
    list.insertAdjacentHTML('beforeend', renderDashboardQuickAddChecklistItems([item]));
    input.value = '';
}

function readDashboardQuickAddChecklist(panel) {
    return Array.from(panel.querySelectorAll('#dashboardChecklistItems .checklist-item')).map(item => ({
        id: item.dataset.itemId || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `checklist-${Date.now()}`),
        title: item.querySelector('.checklist-text')?.textContent?.trim() || '',
        checked: item.querySelector('.checklist-checkbox')?.checked === true
    })).filter(item => item.title);
}

function readDashboardQuickAddLabels(panel) {
    return Array.from(panel.querySelectorAll('.label-chip.selected'))
        .map(chip => parseInt(chip.dataset.labelId || '', 10))
        .filter(Number.isFinite);
}

async function saveDashboardQuickAddTask() {
    const panel = document.getElementById('dashboardQuickAddTaskPanel');
    if (!panel) return;
    const title = panel.querySelector('[data-field="title"]')?.textContent?.trim() || '';
    if (!title) {
        showToast('请输入任务标题', 'error');
        panel.querySelector('[data-field="title"]')?.focus();
        return;
    }

    const todayStr = formatDateISO(new Date());
    const planId = parseInt(panel.querySelector('[data-field="plan_id"]')?.value || '', 10);
    if (!planId) {
        showToast('请选择计划', 'error');
        panel.querySelector('[data-field="plan_id"]')?.focus();
        return;
    }
    const bucketValue = panel.querySelector('[data-field="bucket_id"]')?.value || '';
    const scheduleTime = panel.querySelector('[data-field="schedule_time"]')?.value || null;
    const payload = {
        title,
        plan_id: planId,
        bucket_id: bucketValue ? parseInt(bucketValue, 10) : null,
        start_date: panel.querySelector('[data-field="start_date"]')?.value || todayStr,
        due_date: panel.querySelector('[data-field="due_date"]')?.value || todayStr,
        schedule_time: scheduleTime,
        priority: panel.querySelector('.priority-option.active')?.dataset.priority || 'medium',
        duration: parseInt(panel.querySelector('[data-field="duration"]')?.value || '30', 10) || 30,
        progress: panel.querySelector('.progress-option.active')?.dataset.progress || 'not_started',
        checklist: readDashboardQuickAddChecklist(panel),
        labels: readDashboardQuickAddLabels(panel),
        notes: panel.querySelector('[data-field="notes"]')?.value || ''
    };
    const recurrenceFrequency = panel.querySelector('[data-field="recurrence_frequency"]')?.value || 'none';
    const recurrenceCount = parseInt(panel.querySelector('[data-field="recurrence_count"]')?.value || '0', 10);
    if (recurrenceFrequency === 'weekly' || recurrenceFrequency === 'monthly') {
        await TimeWhereDB.addRecurringTaskSeries(payload, {
            frequency: recurrenceFrequency,
            count: recurrenceCount
        });
    } else {
        await TimeWhereDB.addTask(payload);
    }

    closeDashboardQuickAddTaskPanel();
    await loadDashboardData();
    showToast('任务已添加到今天', 'success');
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

function getJournalTaskStatusRender(task, fallback = {}) {
    if (task?.journal_status === 'completed') {
        return { statusClass: 'completed', statusIcon: 'check_circle', statusLabel: '完成' };
    }
    if (task?.journal_status === 'partial') {
        return { statusClass: 'partial', statusIcon: 'rule', statusLabel: '部分完成' };
    }
    if (task?.journal_status === 'incomplete') {
        return { statusClass: 'incomplete', statusIcon: 'close', statusLabel: '未完成' };
    }
    if (fallback.completed) return { statusClass: 'completed', statusIcon: 'check_circle', statusLabel: '完成' };
    if (fallback.partial) return { statusClass: 'partial', statusIcon: 'rule', statusLabel: '部分完成' };
    return { statusClass: 'incomplete', statusIcon: 'close', statusLabel: '未完成' };
}

function renderJournalStatusTaskList(tasks, emptyText, statusResolver = () => ({})) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return `<p class="journal-empty">${escapeHTML(emptyText)}</p>`;
    }
    return `<ul class="journal-task-list journal-review-task-list">${tasks.map(task => {
        const status = getJournalTaskStatusRender(task, statusResolver(task));
        return `
            <li class="journal-task-status ${status.statusClass}">
                <span class="journal-task-status-main">
                    <span class="material-symbols-outlined journal-task-status-icon">${status.statusIcon}</span>
                    <span>${escapeHTML(task.title || '无标题任务')}</span>
                </span>
                <small>${escapeHTML(status.statusLabel)}</small>
            </li>`;
    }).join('')}</ul>`;
}

function renderJournalPlannedTaskReview(draft) {
    const planned = Array.isArray(draft.planned_task_snapshots) ? draft.planned_task_snapshots : [];
    if (planned.length === 0) {
        return `<p class="journal-empty">今天没有冻结的计划任务。</p>`;
    }

    const completedIds = new Set((draft.completed_task_snapshots || []).map(task => String(task.id)));
    const delayedIds = new Set((draft.delayed_task_snapshots || []).map(task => String(task.id)));
    const progressedIds = new Set((draft.progressed_task_ids || []).map(String));

    return renderJournalStatusTaskList(planned, '今天没有冻结的计划任务。', task => {
        const taskId = String(task.id);
        return {
            completed: completedIds.has(taskId),
            partial: progressedIds.has(taskId),
            incomplete: delayedIds.has(taskId)
        };
    });
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
    if (TimeWhereDB.ensureDailyJournalSnapshot) {
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
                    <span>${escapeHTML(draft.snapshot_at ? `计划快照 ${relativeTime(draft.snapshot_at)}` : '当天 0 点后首次可用时生成计划快照')}</span>
                </div>
                <div class="journal-review-layout">
                    <section class="journal-section">
                        <h4>今日任务 <strong>${draft.planned_task_snapshots?.length || 0}</strong></h4>
                        ${renderJournalPlannedTaskReview(draft)}
                    </section>
                    ${journalTextarea('delayed_notes', '计划延误说明', draft.delayed_notes)}
                    <section class="journal-section">
                        <h4>计划外任务 <strong>${draft.extra_done_task_snapshots?.length || 0}</strong></h4>
                        ${renderJournalStatusTaskList(draft.extra_done_task_snapshots, '没有计划外任务。')}
                    </section>
                    ${journalTextarea('extra_done_notes', '计划外任务说明', draft.extra_done_notes)}
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

