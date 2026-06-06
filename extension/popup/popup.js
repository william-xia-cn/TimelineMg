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

const SIDEPANEL_QUICK_ADD_DEFAULT_PLAN_KEYWORD = 'English';
const SIDEPANEL_QUICK_ADD_BUCKET_NAME = '作业';
const SIDEPANEL_SUBJECT_BUCKET_TEMPLATE = ['上课', '作业', '单元测试', '阶段考试'];
const SIDEPANEL_OTHER_SCHOOL_BUCKET_TEMPLATE = ['事项', '活动', '申请', '其他'];
const PARTIAL_COMPLETION_RATIOS = [10, 20, 30, 50, 70, 80, 90];
let popupPartialCompleteReopenTaskId = null;
let popupCurrentTaskExpandedTaskId = null;

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
        loadHeaderCounts(),
        renderSidepanelBottomActions()
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

    const anchoredIndex = popupCurrentTaskExpandedTaskId
        ? tasks.findIndex(task => String(task.id) === String(popupCurrentTaskExpandedTaskId))
        : -1;
    if (popupCurrentTaskExpandedTaskId && anchoredIndex < 0) {
        popupCurrentTaskExpandedTaskId = null;
    }
    const inProgressIndex = tasks.findIndex(task => task.progress === 'in_progress');
    const expandedIndex = anchoredIndex >= 0 ? anchoredIndex : (inProgressIndex >= 0 ? inProgressIndex : 0);
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
    const partialCompleteBtn = `<button class="btn-micro" data-action="toggle-partial-complete-menu" data-task-id="${taskId}" aria-expanded="false">部分完成</button>`;
    const checklist = Array.isArray(task.checklist) ? task.checklist : [];
    const partialGroup = findPartialCompletionGroup(checklist);
    const partialCompleteMenuHtml = `<div class="popup-partial-complete-panel" data-partial-complete-menu-for="${taskId}" hidden>
            ${partialGroup || checklist.length === 0
                ? renderPartialCompleteRatioBody(taskId, partialGroup)
                : renderPartialCompleteChecklistBody(taskId, checklist)}
        </div>`;

    const progressBtns = isInProgress
        ? `<button class="btn-micro" data-action="pause" data-task-id="${taskId}">暂停</button>
           ${partialCompleteBtn}
           <button class="btn-micro" data-action="complete" data-task-id="${taskId}">完成</button>`
        : `<button class="btn-micro" data-action="start" data-task-id="${taskId}">开始</button>
           ${partialCompleteBtn}
           <button class="btn-micro" data-action="complete" data-task-id="${taskId}">完成</button>`;

    const deferBlockedHtml = isManageBacSource
        ? `<span class="defer-blocked-text">ManageBac 来源任务不能延后</span>`
        : '';
    const deferToggleHtml = !isManageBacSource
        ? `<button class="btn-micro" data-action="toggle-defer-menu" data-task-id="${taskId}" aria-expanded="false">延后</button>`
        : '';
    const deferMenuHtml = !isManageBacSource
        ? `<div class="popup-defer-panel" data-defer-menu-for="${taskId}" hidden>
            <p class="defer-hint">延后会向后修改任务截止日期</p>
            <div class="defer-options" aria-label="选择延后天数">
                <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="1">1天</button>
                <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="3">3天</button>
                <button class="btn-defer" data-action="defer" data-task-id="${taskId}" data-days="7">7天</button>
            </div>
        </div>`
        : '';
    const tags = [
        isOverdue ? `<span class="task-tag danger">逾期</span>` : '',
        isDueToday ? `<span class="task-tag today">今天</span>` : '',
        isTimed ? `<span class="task-tag timed">${escapeHTML(task.schedule_time)}</span>` : '',
        assignment.status === 'unassigned'
            ? '<span class="task-tag unassigned">当前未分配</span>'
            : `<span class="task-tag assigned">${escapeHTML(`${assignment.label || '后续'} ${assignment.container_name || ''}`.trim())}</span>`
    ].filter(Boolean).join('');

    return `
        <details class="task-card popup-task-card${assignment.status === 'unassigned' ? ' task-unassigned' : ''}" data-task-card-id="${taskId}" ${isExpanded ? 'open' : ''}>
            <summary class="task-card-summary">
                <div class="task-title-row" data-task-id="${taskId}">
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

async function renderSidepanelBottomActions() {
    const container = document.getElementById('sidepanelBottomActions');
    if (!container || typeof TimeWhereDB === 'undefined') return;

    const now = new Date();
    const todayStr = formatDateISO(now);
    if (TimeWhereDB.ensureDailyJournalSnapshot) {
        await TimeWhereDB.ensureDailyJournalSnapshot(todayStr, now).catch(error => {
            console.warn('[Popup] Daily journal snapshot skipped:', error);
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

    container.innerHTML = `
        <div class="current-task-quick-add" data-quick-add-date="${escapeAttribute(todayStr)}">
            <div class="current-task-quick-add-main">
                <div class="current-task-quick-add-icon"><span class="material-symbols-outlined">playlist_add</span></div>
                <div class="current-task-quick-add-copy">
                    <h3>未计划的任务添加</h3>
                    <p>比如课后作业及其他临时任务</p>
                </div>
            </div>
            <button class="btn-micro primary current-task-quick-add-action" type="button" data-action="quick-add-current-task" data-quick-add-date="${escapeAttribute(todayStr)}">临时添加任务</button>
        </div>
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
    document.addEventListener('change', handlePopupDelegatedChange);

    const btnSettings = document.getElementById('btnSettings');
    if (btnSettings) {
        btnSettings.addEventListener('click', function() {
            openSettingsPage();
        });
    }

    const btnOpenDashboard = document.getElementById('btnOpenDashboard');
    if (btnOpenDashboard) {
        btnOpenDashboard.addEventListener('click', function() {
            openExtensionPage('pages/focus/focus.html');
        });
    }

    const btnOpenTasks = document.getElementById('btnOpenTasks');
    if (btnOpenTasks) {
        btnOpenTasks.addEventListener('click', function() {
            openExtensionPage('pages/tasks/tasks.html');
        });
    }

    const btnOpenCalendar = document.getElementById('btnOpenCalendar');
    if (btnOpenCalendar) {
        btnOpenCalendar.addEventListener('click', function() {
            openExtensionPage('pages/calendar/calendar.html');
        });
    }

    const btnOpenFull = document.getElementById('btnOpenFull');
    if (btnOpenFull) {
        btnOpenFull.addEventListener('click', function() {
            openExtensionPage('pages/focus/focus.html');
        });
    }

    const btnOpenPopup = document.getElementById('btnOpenPopup');
    if (btnOpenPopup) {
        btnOpenPopup.addEventListener('click', openPopupWindow);
    }
}

function openExtensionPage(path) {
    if (globalThis.TimeWherePlatform?.window?.openMain) {
        globalThis.TimeWherePlatform.window.openMain(path).catch(error => {
            console.warn('TimeWhere: platform openMain failed, falling back to chrome.tabs', error);
            chrome.tabs.create({ url: chrome.runtime.getURL(path) });
        });
        return;
    }
    chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

function openSettingsPage() {
    if (globalThis.TimeWherePlatform?.window?.openSettings) {
        globalThis.TimeWherePlatform.window.openSettings().catch(error => {
            console.warn('TimeWhere: platform openSettings failed, falling back to options page', error);
            chrome.runtime.openOptionsPage();
        });
        return;
    }
    chrome.runtime.openOptionsPage();
}

function openPopupWindow() {
    const url = chrome.runtime.getURL('popup/popup.html');
    if (chrome.windows?.create) {
        chrome.windows.create({
            url,
            type: 'popup',
            width: 380,
            height: 620
        });
        return;
    }
    chrome.tabs.create({ url });
}

function handleTaskCardToggle(event) {
    const card = event.target.closest?.('.popup-task-card');
    if (!card || !card.open) return;
    if (card.dataset.taskCardId) {
        popupCurrentTaskExpandedTaskId = String(card.dataset.taskCardId);
    }
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
    if (actionEl.dataset.action === 'toggle-partial-complete-checklist') {
        return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (actionEl.dataset.action === 'open-external-link') {
        await runPopupAction(actionEl, async () => openTaskNotesExternalLink(actionEl));
        return;
    }
    if (actionEl.dataset.action === 'quick-add-current-task') {
        await openSidepanelQuickAddTaskModal();
        return;
    }
    if (actionEl.dataset.action === 'close-sidepanel-quick-add-task') {
        closeSidepanelQuickAddTaskModal();
        return;
    }
    if (actionEl.dataset.action === 'save-sidepanel-quick-add-task') {
        await runPopupAction(actionEl, saveSidepanelQuickAddTask);
        return;
    }
    if (actionEl.dataset.action === 'sidepanel-quick-add-label') {
        actionEl.classList.toggle('selected');
        return;
    }
    if (actionEl.dataset.action === 'sidepanel-quick-add-checklist-add') {
        addSidepanelQuickAddChecklistItem();
        return;
    }
    if (actionEl.dataset.action === 'sidepanel-quick-add-checklist-delete') {
        actionEl.closest('.sidepanel-checklist-item')?.remove();
        return;
    }
    if (actionEl.dataset.action === 'open-today-journal') {
        await openDailyJournalModal(actionEl.dataset.journalDate || formatDateISO(new Date()));
        return;
    }
    if (actionEl.dataset.action === 'close-daily-journal') {
        closeDailyJournalModal();
        return;
    }
    if (actionEl.dataset.action === 'save-daily-journal-draft') {
        await runPopupAction(actionEl, async () => saveDailyJournalFromModal(false));
        return;
    }
    if (actionEl.dataset.action === 'submit-daily-journal') {
        await runPopupAction(actionEl, async () => saveDailyJournalFromModal(true));
        return;
    }
    if (actionEl.dataset.action === 'toggle-partial-complete-menu') {
        togglePopupTaskPartialCompleteMenu(actionEl.dataset.taskId);
        return;
    }
    if (actionEl.dataset.action === 'partial-complete-ratio') {
        await runPopupAction(actionEl, async () => savePopupTaskPartialCompleteRatio(
            actionEl.dataset.taskId,
            parseInt(actionEl.dataset.percent || '50', 10)
        ));
        return;
    }
    if (actionEl.dataset.action === 'open-current-task-detail') {
        const detailZone = actionEl.closest('.task-detail-open-zone');
        const taskDetails = actionEl.closest('details');
        if (!detailZone || !taskDetails?.open) return;
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
    if (actionEl.dataset.action === 'toggle-defer-menu') {
        togglePopupTaskDeferMenu(actionEl.dataset.taskId);
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

async function handlePopupDelegatedChange(event) {
    const checklistActionEl = event.target.closest('[data-action="toggle-partial-complete-checklist"]');
    if (checklistActionEl) {
        await runPopupAction(checklistActionEl, async () => savePopupTaskPartialCompleteChecklistItem(
            checklistActionEl.dataset.taskId,
            checklistActionEl.dataset.checklistId,
            checklistActionEl.checked
        ));
        return;
    }

    const actionEl = event.target.closest('[data-change-action]');
    if (!actionEl) return;
    if (actionEl.dataset.changeAction === 'sidepanel-quick-add-plan-change') {
        await refreshSidepanelQuickAddPlanFields(actionEl.value);
    }
    if (actionEl.dataset.changeAction === 'sidepanel-quick-add-recurrence-change') {
        updateSidepanelQuickAddRecurrenceControls();
    }
}

async function runPopupAction(control, action) {
    if (control?.dataset?.busy === 'true') return;
    control.dataset.busy = 'true';
    control.disabled = true;
    try {
        await action();
        await reloadPopup();
        if (popupPartialCompleteReopenTaskId) {
            const taskId = popupPartialCompleteReopenTaskId;
            popupPartialCompleteReopenTaskId = null;
            requestAnimationFrame(() => reopenPopupTaskPartialCompleteMenu(taskId));
        }
    } catch (error) {
        showToast(`操作失败：${error.message}`, 'error');
    } finally {
        if (document.body.contains(control)) {
            control.dataset.busy = 'false';
            control.disabled = false;
        }
    }
}

async function ensureSidepanelQuickAddPlanAndBucket() {
    let plans = await TimeWhereDB.getPlans();
    let plan = findSidepanelQuickAddDefaultPlan(plans);
    if (!plan) {
        plan = await TimeWhereDB.ensureDefaultPlan();
    }

    if (TimeWhereDB.ensureBucketTemplateForPlan) {
        await TimeWhereDB.ensureBucketTemplateForPlan(plan.id, getSidepanelQuickAddBucketTemplateForPlan(plan));
    }

    plans = await TimeWhereDB.getPlans();
    let buckets = await TimeWhereDB.getBucketsByPlan(plan.id);
    let bucket = buckets.find(item => item.name === SIDEPANEL_QUICK_ADD_BUCKET_NAME) || null;
    const labels = await TimeWhereDB.getLabelsByPlan?.(plan.id) || [];
    return { plan, bucket, plans, buckets, labels };
}

function findSidepanelQuickAddDefaultPlan(plans = []) {
    const keyword = SIDEPANEL_QUICK_ADD_DEFAULT_PLAN_KEYWORD.toLowerCase();
    return (plans || []).find(plan => {
        const values = [plan.name, plan.subject, plan.subject_in_matrixview]
            .filter(Boolean)
            .map(value => String(value).toLowerCase());
        return values.some(value => value.includes(keyword) || value.includes('英文'));
    }) || (plans || [])[0] || null;
}

function getSidepanelQuickAddBucketTemplateForPlan(plan) {
    return plan?.name === 'Other School Plan'
        ? SIDEPANEL_OTHER_SCHOOL_BUCKET_TEMPLATE
        : SIDEPANEL_SUBJECT_BUCKET_TEMPLATE;
}

function renderSidepanelQuickAddPlanOptions(plans, selectedPlanId) {
    return (plans || []).map(plan => {
        const selected = String(plan.id) === String(selectedPlanId) ? 'selected' : '';
        return `<option value="${escapeAttribute(plan.id)}" ${selected}>${escapeHTML(plan.name || 'Untitled Plan')}</option>`;
    }).join('');
}

function renderSidepanelQuickAddBucketOptions(buckets, selectedBucketId) {
    return [
        '<option value="">No bucket</option>',
        ...(buckets || []).map(bucket => {
            const selected = String(bucket.id) === String(selectedBucketId) ? 'selected' : '';
            return `<option value="${escapeAttribute(bucket.id)}" ${selected}>${escapeHTML(bucket.name || 'Untitled Bucket')}</option>`;
        })
    ].join('');
}

function getSidepanelQuickAddPlanSubject(plan) {
    return plan?.subject || plan?.subject_in_matrixview || plan?.name || 'No subject';
}

function renderSidepanelQuickAddLabelChips(labels = [], selectedIds = []) {
    if (!labels.length) return '<span class="text-muted">No labels defined for this plan</span>';
    const selectedSet = new Set(selectedIds.map(String));
    return labels.map(label => `
        <button
            type="button"
            class="sidepanel-label-chip ${selectedSet.has(String(label.id)) ? 'selected' : ''}"
            data-action="sidepanel-quick-add-label"
            data-label-id="${escapeAttribute(label.id)}"
            style="--label-color:${escapeAttribute(label.color || '#94a3b8')}"
        >${escapeHTML(label.name || label.color || 'Label')}</button>`).join('');
}

function renderSidepanelQuickAddChecklistItems(items = []) {
    return (items || []).map(item => `
        <div class="sidepanel-checklist-item" data-item-id="${escapeAttribute(item.id)}">
            <input type="checkbox" class="sidepanel-checklist-checkbox" ${item.checked ? 'checked' : ''}>
            <span class="sidepanel-checklist-text">${escapeHTML(item.title || '')}</span>
            <button type="button" class="sidepanel-checklist-delete" data-action="sidepanel-quick-add-checklist-delete" title="Delete">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>`).join('');
}

async function openSidepanelQuickAddTaskModal() {
    closeSidepanelQuickAddTaskModal();
    const todayStr = formatDateISO(new Date());
    const { plan, bucket, plans, buckets, labels } = await ensureSidepanelQuickAddPlanAndBucket();
    const modal = document.createElement('div');
    modal.className = 'popup-modal-overlay';
    modal.id = 'sidepanelQuickAddTaskModal';
    modal.innerHTML = `
        <div class="popup-task-detail-modal sidepanel-quick-add-modal">
            <div class="popup-modal-header">
                <h3>Task Details</h3>
                <button class="popup-modal-close" data-action="close-sidepanel-quick-add-task" aria-label="关闭">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="popup-modal-body">
                <label>任务标题<input type="text" id="sidepanelQuickAddTitle" placeholder="Task title"></label>
                <div class="popup-detail-grid">
                    <label>状态<select id="sidepanelQuickAddProgress">
                        <option value="not_started" selected>未开始</option>
                        <option value="in_progress">进行中</option>
                        <option value="completed">已完成</option>
                    </select></label>
                    <label>优先级<select id="sidepanelQuickAddPriority">
                        <option value="urgent">P1</option>
                        <option value="important">P2</option>
                        <option value="medium" selected>P3</option>
                        <option value="low">P4</option>
                    </select></label>
                </div>
                <div class="popup-detail-grid">
                    <label>TimeWhere Plan<select id="sidepanelQuickAddPlan" data-change-action="sidepanel-quick-add-plan-change">
                        ${renderSidepanelQuickAddPlanOptions(plans, plan.id)}
                    </select></label>
                    <label>Subject<input type="text" id="sidepanelQuickAddSubject" value="${escapeAttribute(getSidepanelQuickAddPlanSubject(plan))}" readonly></label>
                </div>
                <label>Bucket<select id="sidepanelQuickAddBucket">
                    ${renderSidepanelQuickAddBucketOptions(buckets, bucket?.id || null)}
                </select></label>
                <div class="popup-detail-grid">
                    <label>开始日期<input type="date" id="sidepanelQuickAddStartDate" value="${escapeAttribute(todayStr)}"></label>
                    <label>截止日期<input type="date" id="sidepanelQuickAddDueDate" value="${escapeAttribute(todayStr)}"></label>
                </div>
                <div class="popup-detail-grid">
                    <label>定时时间<input type="time" id="sidepanelQuickAddScheduleTime" value=""></label>
                    <label>时长<input type="number" id="sidepanelQuickAddDuration" value="30" min="5" max="480" step="5"></label>
                </div>
                <label>说明<textarea id="sidepanelQuickAddNotes" rows="3" placeholder="Add notes..."></textarea></label>
                <label>Checklist
                    <div class="sidepanel-checklist-list" id="sidepanelQuickAddChecklistItems">${renderSidepanelQuickAddChecklistItems([])}</div>
                    <div class="sidepanel-checklist-add">
                        <input type="text" id="sidepanelQuickAddChecklistNewItem" placeholder="Add an item...">
                        <button type="button" class="btn-micro" data-action="sidepanel-quick-add-checklist-add">添加</button>
                    </div>
                </label>
                <div class="popup-detail-grid">
                    <label>周期任务<select id="sidepanelQuickAddRecurrenceFrequency" data-change-action="sidepanel-quick-add-recurrence-change">
                        <option value="none" selected>不重复</option>
                        <option value="weekly">每周</option>
                        <option value="monthly">每月</option>
                    </select></label>
                    <label>次数<input type="number" id="sidepanelQuickAddRecurrenceCount" min="2" max="12" value="2" disabled></label>
                </div>
                <label>Labels
                    <div class="sidepanel-labels-picker" id="sidepanelQuickAddLabels">${renderSidepanelQuickAddLabelChips(labels, [])}</div>
                </label>
            </div>
            <div class="popup-modal-footer">
                <button class="btn-micro" data-action="close-sidepanel-quick-add-task">取消</button>
                <button class="btn-micro primary" data-action="save-sidepanel-quick-add-task">保存任务</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('sidepanelQuickAddTitle')?.focus(), 50);
}

function closeSidepanelQuickAddTaskModal() {
    const modal = document.getElementById('sidepanelQuickAddTaskModal');
    if (modal) modal.remove();
}

async function refreshSidepanelQuickAddPlanFields(planIdValue) {
    const planId = parseInt(planIdValue, 10);
    if (!planId) return;
    const plans = await TimeWhereDB.getPlans();
    const plan = plans.find(item => String(item.id) === String(planId));
    if (plan && TimeWhereDB.ensureBucketTemplateForPlan) {
        await TimeWhereDB.ensureBucketTemplateForPlan(planId, getSidepanelQuickAddBucketTemplateForPlan(plan));
    }
    const buckets = await TimeWhereDB.getBucketsByPlan(planId);
    const preferredBucket = buckets.find(item => item.name === SIDEPANEL_QUICK_ADD_BUCKET_NAME) || null;
    const bucketSelect = document.getElementById('sidepanelQuickAddBucket');
    if (bucketSelect) {
        bucketSelect.innerHTML = renderSidepanelQuickAddBucketOptions(buckets, preferredBucket?.id || null);
    }
    const subjectInput = document.getElementById('sidepanelQuickAddSubject');
    if (subjectInput) subjectInput.value = getSidepanelQuickAddPlanSubject(plan);
    const labels = await TimeWhereDB.getLabelsByPlan?.(planId) || [];
    const labelsEl = document.getElementById('sidepanelQuickAddLabels');
    if (labelsEl) labelsEl.innerHTML = renderSidepanelQuickAddLabelChips(labels, []);
}

function updateSidepanelQuickAddRecurrenceControls() {
    const recurrenceFrequency = document.getElementById('sidepanelQuickAddRecurrenceFrequency');
    const recurrenceCount = document.getElementById('sidepanelQuickAddRecurrenceCount');
    if (!recurrenceFrequency || !recurrenceCount) return;
    recurrenceCount.disabled = !['weekly', 'monthly'].includes(recurrenceFrequency.value);
}

function addSidepanelQuickAddChecklistItem() {
    const input = document.getElementById('sidepanelQuickAddChecklistNewItem');
    const list = document.getElementById('sidepanelQuickAddChecklistItems');
    const title = input?.value?.trim() || '';
    if (!input || !list || !title) return;
    const item = {
        id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `checklist-${Date.now()}`,
        title,
        checked: false
    };
    list.insertAdjacentHTML('beforeend', renderSidepanelQuickAddChecklistItems([item]));
    input.value = '';
}

function readSidepanelQuickAddChecklist() {
    return Array.from(document.querySelectorAll('#sidepanelQuickAddChecklistItems .sidepanel-checklist-item')).map(item => ({
        id: item.dataset.itemId || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `checklist-${Date.now()}`),
        title: item.querySelector('.sidepanel-checklist-text')?.textContent?.trim() || '',
        checked: item.querySelector('.sidepanel-checklist-checkbox')?.checked === true
    })).filter(item => item.title);
}

function readSidepanelQuickAddLabels() {
    return Array.from(document.querySelectorAll('#sidepanelQuickAddLabels .sidepanel-label-chip.selected'))
        .map(chip => parseInt(chip.dataset.labelId || '', 10))
        .filter(Number.isFinite);
}

async function saveSidepanelQuickAddTask() {
    const title = document.getElementById('sidepanelQuickAddTitle')?.value?.trim();
    if (!title) throw new Error('请输入任务标题');

    const todayStr = formatDateISO(new Date());
    const planId = parseInt(document.getElementById('sidepanelQuickAddPlan')?.value || '', 10);
    if (!planId) throw new Error('请选择计划');
    const bucketValue = document.getElementById('sidepanelQuickAddBucket')?.value || '';
    const progress = document.getElementById('sidepanelQuickAddProgress')?.value || 'not_started';

    const payload = {
        title,
        plan_id: planId,
        bucket_id: bucketValue ? parseInt(bucketValue, 10) : null,
        start_date: document.getElementById('sidepanelQuickAddStartDate')?.value || todayStr,
        due_date: document.getElementById('sidepanelQuickAddDueDate')?.value || todayStr,
        schedule_time: document.getElementById('sidepanelQuickAddScheduleTime')?.value || null,
        priority: document.getElementById('sidepanelQuickAddPriority')?.value || 'medium',
        duration: parseInt(document.getElementById('sidepanelQuickAddDuration')?.value || '30', 10) || 30,
        progress,
        completed_at: progress === 'completed' ? new Date().toISOString() : null,
        checklist: readSidepanelQuickAddChecklist(),
        labels: readSidepanelQuickAddLabels(),
        notes: document.getElementById('sidepanelQuickAddNotes')?.value || ''
    };
    const recurrenceFrequency = document.getElementById('sidepanelQuickAddRecurrenceFrequency')?.value || 'none';
    const recurrenceCount = parseInt(document.getElementById('sidepanelQuickAddRecurrenceCount')?.value || '2', 10) || 2;
    if (recurrenceFrequency === 'weekly' || recurrenceFrequency === 'monthly') {
        await TimeWhereDB.addRecurringTaskSeries(payload, {
            frequency: recurrenceFrequency,
            count: Math.max(2, Math.min(12, recurrenceCount))
        });
    } else {
        await TimeWhereDB.addTask(payload);
    }

    closeSidepanelQuickAddTaskModal();
    showToast('任务已添加到今天', 'success');
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
        return '<p class="journal-empty">今天没有冻结的计划任务。</p>';
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
    if (TimeWhereDB.ensureDailyJournalSnapshot) {
        await TimeWhereDB.ensureDailyJournalSnapshot(date, new Date()).catch(error => {
            console.warn('[Popup] Daily journal snapshot skipped:', error);
        });
    }
    const draft = await TimeWhereDB.buildDailyJournalDraft(date, new Date());
    const statusText = draft.status === 'submitted' ? '已提交' : draft.status === 'draft' ? '草稿' : draft.snapshot_at ? '待整理' : '未生成计划快照';
    const modal = document.createElement('div');
    modal.className = 'popup-modal-overlay';
    modal.id = 'dailyJournalModal';
    modal.dataset.journalDate = date;
    modal.innerHTML = `
        <div class="popup-task-detail-modal sidepanel-daily-journal-modal">
            <div class="popup-modal-header">
                <h3>今日总结 · ${escapeHTML(date)}</h3>
                <button class="popup-modal-close" data-action="close-daily-journal" aria-label="关闭">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="popup-modal-body sidepanel-journal-body">
                <div class="journal-status-row">
                    <span class="task-tag assigned">${escapeHTML(statusText)}</span>
                    <span>${escapeHTML(draft.snapshot_at ? `计划快照 ${formatDate(draft.date || date)}` : '当天 0 点后首次可用时生成计划快照')}</span>
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
            <div class="popup-modal-footer">
                <button class="btn-micro" data-action="close-daily-journal">取消</button>
                <button class="btn-micro" data-action="save-daily-journal-draft">保存草稿</button>
                <button class="btn-micro primary" data-action="submit-daily-journal">提交总结</button>
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
                ${isManageBacSource ? '<p class="source-readonly-hint">ManageBac 来源标题和截止日期只读；可修改本地状态、优先级、开始日期、定时时间、时长和笔记。</p>' : ''}
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
                    <label>定时时间<input type="time" id="detailTaskScheduleTime" value="${escapeAttribute(task.schedule_time || '')}"></label>
                    <label>时长<input type="number" id="detailTaskDuration" value="${escapeAttribute(String(task.duration || 45))}" min="5" max="480" step="5"></label>
                </div>
                <label>说明<textarea id="detailTaskNotes" rows="3">${escapeHTML(task.notes || task.description || '')}</textarea></label>
                <div class="notes-link-preview" data-notes-link-preview>${renderTaskNotesExternalLinks(task.notes || task.description || '')}</div>
            </div>
            <div class="popup-modal-footer">
                <button class="btn-micro" data-action="close-current-task-detail">取消</button>
                <button class="btn-micro primary" data-action="save-current-task-detail">保存</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('detailTaskNotes')?.addEventListener('input', event => {
        refreshTaskNotesExternalLinks(modal, event.target.value);
    });
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
        schedule_time: document.getElementById('detailTaskScheduleTime')?.value || null,
        duration: parseInt(document.getElementById('detailTaskDuration')?.value || '45', 10) || 45,
        notes: document.getElementById('detailTaskNotes')?.value || '',
        completed_at: progress === 'completed' ? (task.completed_at || new Date().toISOString()) : null
    };
    if (!isManageBacSource) {
        const title = document.getElementById('detailTaskTitle')?.value?.trim();
        if (!title) throw new Error('请输入任务标题');
        updates.title = title;
        updates.due_date = document.getElementById('detailTaskDueDate')?.value || null;
    }
    await TimeWhereDB.updateTask(taskId, updates);
    closeCurrentTaskDetailModal();
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

function togglePopupTaskDeferMenu(taskId) {
    const targetMenu = document.querySelector(`[data-defer-menu-for="${CSS.escape(String(taskId))}"]`);
    const targetButton = document.querySelector(`[data-action="toggle-defer-menu"][data-task-id="${CSS.escape(String(taskId))}"]`);
    if (!targetMenu || !targetButton) return;
    const shouldOpen = targetMenu.hasAttribute('hidden');

    closePopupTaskPartialCompleteMenus();
    document.querySelectorAll('[data-defer-menu-for]').forEach(menu => {
        menu.setAttribute('hidden', '');
    });
    document.querySelectorAll('[data-action="toggle-defer-menu"]').forEach(button => {
        button.setAttribute('aria-expanded', 'false');
    });

    if (shouldOpen) {
        popupCurrentTaskExpandedTaskId = String(taskId);
        targetMenu.removeAttribute('hidden');
        targetButton.setAttribute('aria-expanded', 'true');
    } else if (popupCurrentTaskExpandedTaskId === String(taskId)) {
        popupCurrentTaskExpandedTaskId = null;
    }
}

function closePopupTaskPartialCompleteMenus() {
    document.querySelectorAll('[data-partial-complete-menu-for]').forEach(menu => {
        menu.setAttribute('hidden', '');
    });
    document.querySelectorAll('[data-action="toggle-partial-complete-menu"]').forEach(button => {
        button.setAttribute('aria-expanded', 'false');
    });
}

function reopenPopupTaskPartialCompleteMenu(taskId) {
    const escapedTaskId = CSS.escape(String(taskId));
    const targetMenu = document.querySelector(`[data-partial-complete-menu-for="${escapedTaskId}"]`);
    const targetButton = document.querySelector(`[data-action="toggle-partial-complete-menu"][data-task-id="${escapedTaskId}"]`);
    if (!targetMenu || !targetButton) return;
    targetMenu.removeAttribute('hidden');
    targetButton.setAttribute('aria-expanded', 'true');
}

function togglePopupTaskPartialCompleteMenu(taskId) {
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
    closePopupTaskPartialCompleteMenus();

    if (shouldOpen) {
        popupCurrentTaskExpandedTaskId = String(taskId);
        targetMenu.removeAttribute('hidden');
        targetButton.setAttribute('aria-expanded', 'true');
    } else if (popupCurrentTaskExpandedTaskId === String(taskId)) {
        popupCurrentTaskExpandedTaskId = null;
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

async function savePopupTaskPartialCompleteRatio(taskId, percent) {
    popupCurrentTaskExpandedTaskId = String(taskId);
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
    closePopupTaskPartialCompleteMenus();
    showToast('部分完成已更新', 'success');
}

async function savePopupTaskPartialCompleteChecklistItem(taskId, checklistId, checked) {
    popupCurrentTaskExpandedTaskId = String(taskId);
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) {
        showToast('任务不存在或已删除', 'error');
        return;
    }
    const checklist = (task.checklist || []).map(item =>
        String(item.id) === String(checklistId) ? { ...item, checked: !!checked } : item
    );
    await TimeWhereDB.updateChecklist(taskId, checklist);
    popupPartialCompleteReopenTaskId = String(taskId);
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
