// Global error handlers
window.addEventListener('unhandledrejection', (event) => {
    console.warn('Unhandled promise rejection:', event.reason);
});

function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const {
    dailySettle,
    buildDailyTaskPool,
    containerAppliesToDate,
    getDeferredStartDate,
    priorityLabel,
    priorityClass,
    escapeHTML,
    escapeAttribute
} = TimeWhereScheduling;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initApp();
    } catch(e) {
        console.warn('App init error:', e);
    }
    setupEventListeners();
});

async function initApp() {
    try {
        if (typeof TimeWhereDB === 'undefined') {
            console.warn('TimeWhereDB not ready');
            return;
        }
        await TimeWhereDB.initDefaultSettings();
    } catch(e) {
        console.warn('Settings init skipped:', e);
    }

    await reloadPopup();
    runGoogleSyncCheck();
}

function runGoogleSyncCheck() {
    if (typeof TimeWhereGoogleSync === 'undefined' || typeof TimeWhereDB === 'undefined') return;
    TimeWhereGoogleSync.runPageAutoSync(TimeWhereDB).catch(error => {
        console.warn('Google auto sync check failed:', error);
    });
}

async function reloadPopup() {
    await Promise.all([
        loadCurrentTasks(),
        loadHeaderCounts()
    ]);
}

async function loadCurrentTasks() {
    if (typeof TimeWhereDB === 'undefined' || typeof TimeWhereScheduling === 'undefined') {
        renderNoTask();
        return;
    }

    const { currentTasks } = await getTodayTaskProjection();
    if (currentTasks.length > 0) {
        renderCurrentTaskList(currentTasks);
    } else {
        renderNoTask();
    }
}

async function getTodayTaskProjection() {
    const now = new Date();
    const todayStr = formatDateISO(now);
    const dayOfWeek = now.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const allTasks = await TimeWhereDB.getAllTasks();
    const taskPool = buildDailyTaskPool(allTasks, now);

    const allContainers = (await TimeWhereDB.getContainers({ enabled: true })) || [];
    const todayContainers = allContainers.filter(c =>
        containerAppliesToDate(c, now, todayStr, dayOfWeek, isWeekday, isWeekend)
    );

    const settle = dailySettle(taskPool, todayContainers, now);
    const currentTasks = settle.currentTasks || [];
    return { currentTasks, taskPool, todayContainers };
}

function renderCurrentTaskList(tasks) {
    const taskList = document.getElementById('currentTaskList');
    if (!taskList) return;

    const inProgressIndex = tasks.findIndex(task => task.progress === 'in_progress');
    const expandedIndex = inProgressIndex >= 0 ? inProgressIndex : 0;
    taskList.innerHTML = tasks.map((task, index) => renderCurrentTaskCard(task, index, expandedIndex)).join('');
    requestAnimationFrame(() => ensureExpandedTaskVisible(taskList.querySelector('.popup-task-card[open]')));
}

function renderCurrentTaskCard(task, index, expandedIndex = 0) {
    const isInProgress = task.progress === 'in_progress';
    const isManageBacSource = TimeWhereDB.isManageBacSourceTask?.(task) === true;
    const dueStr = task.due_date || task.deadline;
    const todayStr = formatDateISO(new Date());
    const isOverdue = dueStr && dueStr < todayStr;
    const isDueToday = dueStr === todayStr;
    const isTimed = !!task.schedule_time;
    const pLabel = priorityLabel(task.priority);
    const pCls = priorityClass(task.priority);
    const taskId = escapeAttribute(task.id);
    const isExpanded = index === expandedIndex;

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

    const tags = [
        isOverdue ? `<span class="task-tag danger">逾期</span>` : '',
        isDueToday ? `<span class="task-tag today">今天</span>` : '',
        isTimed ? `<span class="task-tag timed">${escapeHTML(task.schedule_time)}</span>` : ''
    ].filter(Boolean).join('');

    return `
        <details class="task-card popup-task-card" ${isExpanded ? 'open' : ''}>
            <summary class="task-card-summary">
                <div class="task-title-row">
                    <span class="status-dot ${isInProgress ? 'pulsing' : 'pending'}"></span>
                    <span class="task-title">${escapeHTML(task.title || '无标题任务')}</span>
                </div>
                <span class="material-symbols-outlined expand-icon">expand_more</span>
            </summary>
            <div class="current-task-info">
                ${task.notes ? `<div class="task-notes">${escapeHTML(task.notes)}</div>` : ''}
                <div class="task-meta">
                    <span class="priority-badge ${pCls}">${escapeHTML(pLabel)}</span>
                    <span class="duration">${task.duration || 45}分钟</span>
                    ${dueStr ? `<span class="deadline">截止: ${formatDate(dueStr)}</span>` : ''}
                </div>
                ${tags ? `<div class="task-tags">${tags}</div>` : ''}
                <div class="task-actions">${progressBtns}</div>
                ${deferHtml}
            </div>
        </details>`;
}

function renderNoTask() {
    const taskList = document.getElementById('currentTaskList');
    if (!taskList) return;

    taskList.innerHTML = `
        <div class="task-card task-empty-card">
            <div class="task-placeholder">
                <span class="material-symbols-outlined" style="font-size: 24px;">add_circle</span>
                <span>暂无待办任务</span>
            </div>
        </div>`;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr = formatDateISO(today);
    const tomorrowStr = formatDateISO(tomorrow);

    if (dateStr === todayStr) return '今天';
    if (dateStr === tomorrowStr) return '明天';

    return `${date.getMonth() + 1}/${date.getDate()}`;
}

async function loadHeaderCounts() {
    if (typeof TimeWhereDB === 'undefined' || typeof TimeWhereScheduling === 'undefined') return;

    const completedToday = await TimeWhereDB.getTodayCompletedCount();
    const { taskPool } = await getTodayTaskProjection();
    const todayPendingCount = taskPool.length;

    const completedEl = document.getElementById('todayCompletedCount');
    const pendingEl = document.getElementById('todayPendingCount');
    if (completedEl) completedEl.textContent = String(completedToday);
    if (pendingEl) pendingEl.textContent = String(todayPendingCount);
}

function setupEventListeners() {
    const taskList = document.getElementById('currentTaskList');
    if (taskList) {
        taskList.addEventListener('click', handleTaskActionClick);
        taskList.addEventListener('toggle', handleTaskCardToggle, true);
    }

    const btnSettings = document.getElementById('btnSettings');
    if (btnSettings) {
        btnSettings.addEventListener('click', function() {
            chrome.runtime.openOptionsPage();
        });
    }

    const btnOpenFull = document.getElementById('btnOpenFull');
    if (btnOpenFull) {
        btnOpenFull.addEventListener('click', function() {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/focus/focus.html') });
        });
    }
}

function handleTaskCardToggle(event) {
    const card = event.target.closest?.('.popup-task-card');
    if (!card || !card.open) return;
    const taskList = document.getElementById('currentTaskList');
    taskList?.querySelectorAll('.popup-task-card[open]').forEach(other => {
        if (other !== card) other.open = false;
    });
    requestAnimationFrame(() => ensureExpandedTaskVisible(card));
}

function ensureExpandedTaskVisible(card) {
    if (!card) return;
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

async function handleTaskActionClick(event) {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    event.preventDefault();
    event.stopPropagation();

    await runPopupAction(actionEl, async () => {
        const { action, taskId } = actionEl.dataset;
        if (action === 'start') await startTask(taskId);
        if (action === 'pause') await pauseTask(taskId);
        if (action === 'complete') await completeTask(taskId);
        if (action === 'defer') await deferTask(taskId, parseInt(actionEl.dataset.days || '1', 10));
    });
}

async function runPopupAction(control, action) {
    if (control?.dataset?.busy === 'true') return;
    control.dataset.busy = 'true';
    control.disabled = true;
    try {
        await action();
        await reloadPopup();
    } catch (error) {
        showToast(`操作失败：${error.message}`, 'error');
    } finally {
        if (document.body.contains(control)) {
            control.dataset.busy = 'false';
            control.disabled = false;
        }
    }
}

async function startTask(taskId) {
    await TimeWhereDB.updateTask(taskId, { progress: 'in_progress' });
    showToast('任务已开始', 'info');
}

async function pauseTask(taskId) {
    await TimeWhereDB.updateTask(taskId, { progress: 'not_started' });
    showToast('任务已暂停', 'info');
}

async function completeTask(taskId) {
    await TimeWhereDB.updateTask(taskId, {
        progress: 'completed',
        completed_at: new Date().toISOString()
    });
    showToast('任务完成！', 'success');
}

async function deferTask(taskId, days) {
    const task = await TimeWhereDB.getTaskById(taskId);
    if (TimeWhereDB.isManageBacSourceTask?.(task)) {
        showToast('ManageBac 来源任务不能延后', 'error');
        return;
    }
    const today = new Date();
    const baseDate = task?.due_date || task?.deadline || formatDateISO(today);
    const target = new Date(baseDate + 'T00:00:00');
    target.setDate(target.getDate() + days);
    await TimeWhereDB.updateTask(taskId, { due_date: formatDateISO(target) });
    showToast(`任务已延后 ${days} 天`, 'info');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
