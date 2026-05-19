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

    const { displayTasks } = await getTodayTaskProjection();
    if (displayTasks.length > 0) {
        renderCurrentTaskList(displayTasks);
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
    const displayTasks = settle.displayTasks || settle.currentTasks || [];
    return { displayTasks, taskPool, todayContainers };
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
    const statusLabel = getPopupTaskStatusLabel(task.progress);
    const checklistHtml = renderPopupTaskChecklist(task);
    const assignment = task.assignment || { status: 'unassigned', label: '当前未分配' };

    const progressBtns = isInProgress
        ? `<button class="btn-micro" data-action="pause" data-task-id="${taskId}">暂停</button>
           <button class="btn-micro primary" data-action="complete" data-task-id="${taskId}">完成</button>`
        : `<button class="btn-micro primary" data-action="start" data-task-id="${taskId}">开始</button>
           <button class="btn-micro" data-action="complete" data-task-id="${taskId}">完成</button>`;

    const deferHtml = isManageBacSource
        ? `<span class="defer-blocked-text">ManageBac 来源任务不能延后</span>`
        : `<div class="popup-defer-group" aria-label="延后">
            <span class="defer-label">延后</span>
            <div class="defer-options">
                <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="1">1天</button>
                <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="3">3天</button>
                <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="7">7天</button>
            </div>
        </div>`;
    const tags = [
        isOverdue ? `<span class="task-tag danger">逾期</span>` : '',
        isDueToday ? `<span class="task-tag today">今天</span>` : '',
        isTimed ? `<span class="task-tag timed">${escapeHTML(task.schedule_time)}</span>` : '',
        assignment.status === 'unassigned'
            ? '<span class="task-tag unassigned">当前未分配</span>'
            : `<span class="task-tag assigned">${escapeHTML(`${assignment.label || '后续'} ${assignment.container_name || ''}`.trim())}</span>`
    ].filter(Boolean).join('');

    return `
        <details class="task-card popup-task-card${assignment.status === 'unassigned' ? ' task-unassigned' : ''}" ${isExpanded ? 'open' : ''}>
            <summary class="task-card-summary">
                <div class="task-title-row" data-action="open-current-task-detail" data-task-id="${taskId}" title="打开任务详情">
                    <span class="status-dot ${isInProgress ? 'pulsing' : 'pending'}"></span>
                    <span class="task-title">${escapeHTML(task.title || '无标题任务')}</span>
                    <span class="popup-task-status-label ${statusLabel.className}">${statusLabel.text}</span>
                </div>
                <span class="material-symbols-outlined expand-icon">expand_more</span>
            </summary>
            <div class="current-task-info">
                <div class="task-detail-open-zone" data-action="open-current-task-detail" data-task-id="${taskId}" title="打开任务详情">
                    ${task.notes ? `<div class="task-notes">${escapeHTML(task.notes)}</div>` : ''}
                    ${checklistHtml}
                    <div class="task-meta">
                        <span class="priority-badge ${pCls}">${escapeHTML(pLabel)}</span>
                        <span class="duration">${task.duration || 45}分钟</span>
                        ${dueStr ? `<span class="deadline">截止: ${formatDate(dueStr)}</span>` : ''}
                    </div>
                    ${tags ? `<div class="task-tags">${tags}</div>` : ''}
                </div>
                <div class="task-actions">
                    <div class="task-action-left">${isManageBacSource ? deferHtml : ''}</div>
                    <div class="task-action-controls">
                        ${progressBtns}
                        ${!isManageBacSource ? deferHtml : ''}
                    </div>
                </div>
            </div>
        </details>`;
}

function getPopupTaskStatusLabel(progress) {
    if (progress === 'completed') return { text: '已完成', className: 'completed' };
    if (progress === 'in_progress') return { text: '进行中', className: 'in-progress' };
    return { text: '未开始', className: 'not-started' };
}

function renderPopupTaskChecklist(task) {
    const checklist = Array.isArray(task.checklist) ? task.checklist : [];
    if (checklist.length === 0) return '';
    const taskId = escapeAttribute(task.id);
    const items = checklist.map(item => {
        const itemId = escapeAttribute(item.id || '');
        const title = escapeHTML(item.title || '');
        return `
            <label class="popup-task-checklist-item">
                <input type="checkbox" data-action="toggle-popup-checklist" data-task-id="${taskId}" data-checklist-id="${itemId}" ${item.checked ? 'checked' : ''}>
                <span>${title}</span>
            </label>`;
    }).join('');
    return `<div class="popup-task-checklist">${items}</div>`;
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
        taskList.addEventListener('toggle', handleTaskCardToggle, true);
    }
    document.addEventListener('click', handleTaskActionClick);

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

    if (actionEl.dataset.action === 'open-current-task-detail') {
        await openCurrentTaskDetailModal(actionEl.dataset.taskId);
        return;
    }
    if (actionEl.dataset.action === 'close-current-task-detail') {
        closeCurrentTaskDetailModal();
        return;
    }
    if (actionEl.dataset.action === 'save-current-task-detail') {
        await runPopupAction(actionEl, saveCurrentTaskDetailModal);
        return;
    }

    await runPopupAction(actionEl, async () => {
        const { action, taskId } = actionEl.dataset;
        if (action === 'start') await startTask(taskId);
        if (action === 'pause') await pauseTask(taskId);
        if (action === 'complete') await completeTask(taskId);
        if (action === 'defer') await deferTask(taskId, parseInt(actionEl.dataset.days || '1', 10));
        if (action === 'toggle-popup-checklist') await togglePopupTaskChecklist(taskId, actionEl.dataset.checklistId);
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

async function openCurrentTaskDetailModal(taskId) {
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) {
        showToast('任务不存在或已删除', 'error');
        return;
    }
    closeCurrentTaskDetailModal();
    const isManageBacSource = TimeWhereDB.isManageBacSourceTask?.(task) === true;
    const modal = document.createElement('div');
    modal.className = 'popup-modal-overlay';
    modal.id = 'currentTaskDetailModal';
    modal.dataset.taskId = task.id;
    modal.innerHTML = `
        <div class="popup-task-detail-modal">
            <div class="popup-modal-header">
                <h3>任务详情</h3>
                <button class="popup-modal-close" data-action="close-current-task-detail" aria-label="关闭">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="popup-modal-body">
                ${isManageBacSource ? '<p class="source-readonly-hint">ManageBac 来源内容只读；可修改本地状态、优先级和开始日期。</p>' : ''}
                <label>任务标题<input type="text" id="detailTaskTitle" value="${escapeAttribute(task.title || '')}" ${isManageBacSource ? 'readonly' : ''}></label>
                <div class="popup-detail-grid">
                    <label>状态<select id="detailTaskProgress">
                        <option value="not_started" ${task.progress === 'not_started' ? 'selected' : ''}>未开始</option>
                        <option value="in_progress" ${task.progress === 'in_progress' ? 'selected' : ''}>进行中</option>
                        <option value="completed" ${task.progress === 'completed' ? 'selected' : ''}>已完成</option>
                    </select></label>
                    <label>优先级<select id="detailTaskPriority">
                        <option value="urgent" ${task.priority === 'urgent' ? 'selected' : ''}>P1</option>
                        <option value="important" ${task.priority === 'important' ? 'selected' : ''}>P2</option>
                        <option value="medium" ${!task.priority || task.priority === 'medium' ? 'selected' : ''}>P3</option>
                        <option value="low" ${task.priority === 'low' ? 'selected' : ''}>P4</option>
                    </select></label>
                </div>
                <div class="popup-detail-grid">
                    <label>开始日期<input type="date" id="detailTaskStartDate" value="${escapeAttribute(task.start_date || '')}"></label>
                    <label>截止日期<input type="date" id="detailTaskDueDate" value="${escapeAttribute(task.due_date || task.deadline || '')}" ${isManageBacSource ? 'disabled' : ''}></label>
                </div>
                <div class="popup-detail-grid">
                    <label>定时时间<input type="time" id="detailTaskScheduleTime" value="${escapeAttribute(task.schedule_time || '')}" ${isManageBacSource ? 'disabled' : ''}></label>
                    <label>时长<input type="number" id="detailTaskDuration" value="${escapeAttribute(String(task.duration || 45))}" min="5" max="480" step="5" ${isManageBacSource ? 'disabled' : ''}></label>
                </div>
                <label>说明<textarea id="detailTaskNotes" rows="3" ${isManageBacSource ? 'readonly' : ''}>${escapeHTML(task.notes || task.description || '')}</textarea></label>
            </div>
            <div class="popup-modal-footer">
                <button class="btn-micro" data-action="close-current-task-detail">取消</button>
                <button class="btn-micro primary" data-action="save-current-task-detail">保存</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('detailTaskTitle')?.focus(), 50);
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
        completed_at: progress === 'completed' ? (task.completed_at || new Date().toISOString()) : null
    };
    if (!isManageBacSource) {
        const title = document.getElementById('detailTaskTitle')?.value?.trim();
        if (!title) throw new Error('请输入任务标题');
        updates.title = title;
        updates.due_date = document.getElementById('detailTaskDueDate')?.value || null;
        updates.schedule_time = document.getElementById('detailTaskScheduleTime')?.value || null;
        updates.duration = parseInt(document.getElementById('detailTaskDuration')?.value || '45', 10) || 45;
        updates.notes = document.getElementById('detailTaskNotes')?.value || '';
    }
    await TimeWhereDB.updateTask(taskId, updates);
    closeCurrentTaskDetailModal();
    showToast('任务详情已更新', 'success');
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

async function togglePopupTaskChecklist(taskId, checklistId) {
    const task = await TimeWhereDB.getTaskById(taskId);
    const checklist = (task?.checklist || []).map(item =>
        String(item.id) === String(checklistId) ? { ...item, checked: !item.checked } : item
    );
    await TimeWhereDB.updateChecklist(taskId, checklist);
    showToast('清单已更新', 'info');
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
