/**
 * Board rendering — Kanban columns, task cards, group-by logic
 */

// ========== Group By Definitions ==========

const GROUP_BY_CONFIG = {
    due_date: {
        label: 'Due date',
        getColumns: () => [
            { key: 'overdue',   title: 'Overdue',   icon: 'warning' },
            { key: 'today',     title: 'Today',     icon: 'today' },
            { key: 'tomorrow',  title: 'Tomorrow',  icon: 'event' },
            { key: 'this_week', title: 'This week',  icon: 'date_range' },
            { key: 'next_week', title: 'Next week',  icon: 'event_upcoming' },
            { key: 'future',    title: 'Future',    icon: 'event_upcoming' },
            { key: 'no_date',   title: 'No date',   icon: 'event_busy' }
        ],
        classify: (task) => {
            if (!task.due_date) return 'no_date';
            const due = new Date(task.due_date + 'T00:00:00');
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dayAfterTomorrow = new Date(today);
            dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

            // End of week (Sunday)
            const weekEnd = new Date(today);
            const dayOfWeek = today.getDay(); // 0=Sun
            const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
            weekEnd.setDate(weekEnd.getDate() + daysToSunday);
            weekEnd.setHours(23, 59, 59, 999);

            const nextWeekEnd = new Date(weekEnd);
            nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

            if (due < today) return 'overdue';
            if (due >= today && due < tomorrow) return 'today';
            if (due >= tomorrow && due < dayAfterTomorrow) return 'tomorrow';
            if (due <= weekEnd) return 'this_week';
            if (due <= nextWeekEnd) return 'next_week';
            return 'future';
        }
    },
    bucket: {
        label: 'Bucket',
        getColumns: () => {
            const cols = TaskApp.currentPlanBuckets.map(b => ({
                key: 'bucket_' + b.id,
                title: b.name,
                bucketId: b.id
            }));
            cols.push({ key: 'no_bucket', title: 'No bucket', bucketId: null });
            return cols;
        },
        classify: (task) => {
            return task.bucket_id ? 'bucket_' + task.bucket_id : 'no_bucket';
        }
    },
    priority: {
        label: 'Priority',
        getColumns: () => [
            { key: 'urgent',    title: 'Urgent',    colorClass: 'priority-urgent' },
            { key: 'important', title: 'Important', colorClass: 'priority-important' },
            { key: 'medium',    title: 'Medium',    colorClass: 'priority-medium' },
            { key: 'low',       title: 'Low',       colorClass: 'priority-low' }
        ],
        classify: (task) => task.priority || 'medium'
    },
    progress: {
        label: 'Progress',
        getColumns: () => [
            { key: 'not_started',  title: 'Not started',  icon: 'radio_button_unchecked' },
            { key: 'in_progress',  title: 'In progress',  icon: 'timelapse' },
            { key: 'completed',    title: 'Completed',    icon: 'check_circle' }
        ],
        classify: (task) => task.progress || 'not_started'
    },
    labels: {
        label: 'Labels',
        getColumns: () => {
            const cols = TaskApp.currentPlanLabels.map(l => ({
                key: 'label_' + l.id,
                title: l.name || l.color,
                labelId: l.id,
                labelColor: l.color
            }));
            cols.push({ key: 'no_label', title: 'No label', labelId: null });
            return cols;
        },
        classify: (task) => {
            // Labels grouping: a task can appear in multiple columns
            if (!task.labels || task.labels.length === 0) return ['no_label'];
            return task.labels.map(lid => 'label_' + lid);
        }
    }
};

// ========== Grouping Logic ==========

function groupTasks(tasks, groupBy) {
    const config = GROUP_BY_CONFIG[groupBy];
    if (!config) return new Map();

    const columns = config.getColumns();
    const grouped = new Map();

    // Initialize empty arrays for all columns
    for (const col of columns) {
        grouped.set(col.key, { ...col, tasks: [] });
    }

    for (const task of tasks) {
        const keys = config.classify(task);
        const keyArray = Array.isArray(keys) ? keys : [keys];

        for (const key of keyArray) {
            if (grouped.has(key)) {
                grouped.get(key).tasks.push(task);
            }
        }
    }

    for (const colData of grouped.values()) {
        colData.tasks = sortTasksByDueDate(colData.tasks);
    }

    return grouped;
}

function sortTasksByDueDate(tasks) {
    return [...(tasks || [])].sort((a, b) => {
        if (a.due_date && b.due_date) {
            const dueCompare = a.due_date.localeCompare(b.due_date);
            if (dueCompare !== 0) return dueCompare;
        } else if (a.due_date) {
            return -1;
        } else if (b.due_date) {
            return 1;
        }

        const titleCompare = String(a.title || '').localeCompare(String(b.title || ''));
        if (titleCompare !== 0) return titleCompare;
        return String(a.id || '').localeCompare(String(b.id || ''));
    });
}

// ========== Priority Helpers ==========

const PRIORITY_CONFIG = {
    urgent:    { label: 'Urgent',    color: '#ef4444', bgColor: '#fef2f2' },
    important: { label: 'Important', color: '#f97316', bgColor: '#fff7ed' },
    medium:    { label: 'Medium',    color: '#3b82f6', bgColor: '#eff6ff' },
    low:       { label: 'Low',       color: '#6b7280', bgColor: '#f9fafb' }
};

// ========== Card Rendering ==========

function getTaskPlanName(task) {
    if (!task?.plan_id) return '';
    const plans = TaskApp.plans || [];
    const plan = plans.find(p => String(p.id) === String(task.plan_id));
    return plan?.name || task.subject || '';
}

function createTaskCardHTML(task) {
    const bucketName = TaskApp.getBucketName(task.bucket_id);
    const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    const isSourceReadOnly = TimeWhereManageBac?.isManageBacTask(task);
    const planName = isSourceReadOnly ? getTaskPlanName(task) : '';

    // Labels dots
    let labelsHTML = '';
    if (task.labels && task.labels.length > 0) {
        const dots = task.labels.map(lid => {
            const info = TaskApp.getLabelInfo(lid);
            if (!info) return '';
            return `<span class="label-dot" style="background:${info.color}" title="${escapeHTML(info.name || '')}"></span>`;
        }).join('');
        labelsHTML = `<div class="task-card-labels">${dots}</div>`;
    }

    // Checklist progress
    let checklistHTML = '';
    if (task.checklist && task.checklist.length > 0) {
        const done = task.checklist.filter(i => i.checked).length;
        const total = task.checklist.length;
        checklistHTML = `
            <span class="task-checklist-badge">
                <span class="material-symbols-outlined">checklist</span>
                ${done}/${total}
            </span>`;
    }

    // Due date + status labels
    let dueDateHTML = '';
    const todayStr = formatDateISO(new Date());
    if (task.due_date) {
        const isOverdue = task.due_date < todayStr;
        const isDueToday = task.due_date === todayStr;
        const cls = isOverdue ? 'text-red' : (isDueToday ? 'text-orange' : '');
        dueDateHTML = `
            <span class="task-due-badge ${cls}">
                <span class="material-symbols-outlined">schedule</span>
                ${formatDueDate(task.due_date)}
            </span>`;
    }

    // Schedule status badges
    let statusBadges = '';
    if (task.due_date && task.due_date < todayStr && task.progress !== 'completed') {
        statusBadges += `<span class="task-status-badge status-overdue">逾期</span>`;
    } else if (task.due_date === todayStr && task.progress !== 'completed') {
        statusBadges += `<span class="task-status-badge status-today">今日截止</span>`;
    }
    if (task.schedule_time) {
        statusBadges += `<span class="task-status-badge status-timed">⏰ ${task.schedule_time}</span>`;
    }

    // Bucket tag
    let bucketHTML = '';
    if (bucketName) {
        bucketHTML = `<span class="task-bucket-tag">${bucketName}</span>`;
    }

    // Progress icon
    const progressIcons = {
        not_started: 'radio_button_unchecked',
        in_progress: 'timelapse',
        completed: 'check_circle'
    };
    const progressIcon = progressIcons[task.progress] || progressIcons.not_started;
    const progressClass = task.progress === 'completed' ? 'progress-done' : '';
    if (isSourceReadOnly) {
        const planBadgeText = planName || 'No plan';
        statusBadges += `<span class="task-status-badge status-plan">${escapeHTML(planBadgeText)}</span>`;
    }
    const sourceIconHTML = isSourceReadOnly
        ? `<span class="task-source-icon task-source-managebac" title="ManageBac"><img src="../../shared/images/managebac-icon.png" alt="ManageBac"></span>`
        : '';

    return `
        <div class="task-card ${progressClass} ${isSourceReadOnly ? 'has-source-icon' : ''}" data-task-id="${task.id}">
            ${sourceIconHTML}
            ${labelsHTML}
            <div class="task-card-header">
                <button class="task-progress-btn ${progressClass}" data-task-id="${task.id}" title="Toggle progress">
                    <span class="material-symbols-outlined">${progressIcon}</span>
                </button>
                <h4 class="task-title">${escapeHTML(task.title)}</h4>
            </div>
            ${statusBadges ? `<div class="task-status-badges">${statusBadges}</div>` : ''}
            <div class="task-card-footer">
                <div class="task-card-meta">
                    ${bucketHTML}
                    ${dueDateHTML}
                    ${checklistHTML}
                </div>
                <span class="task-priority-badge" style="color:${priorityCfg.color};background:${priorityCfg.bgColor}">
                    ${priorityCfg.label}
                </span>
            </div>
        </div>`;
}

// ========== Column Rendering ==========

function renderColumnHTML(colData) {
    const { title, icon, tasks } = colData;
    const count = tasks.length;
    const isPlannerColumn = true;
    const canManageBucket = TaskApp.groupBy === 'bucket'
        && TaskApp.viewMode === 'plan'
        && colData.bucketId;

    const iconHTML = icon
        ? `<span class="material-symbols-outlined">${icon}</span>`
        : '';
    const addTaskHTML = `
        <button class="col-add-task ${isPlannerColumn ? 'planner-add-task' : ''}" title="Add task">
            <span class="material-symbols-outlined">add</span>
            ${isPlannerColumn ? '<span>添加任务</span>' : ''}
        </button>`;

    let bodyHTML;
    if (count === 0) {
        bodyHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">task_alt</span>
                <p>No tasks</p>
            </div>`;
    } else {
        bodyHTML = tasks.map(t => createTaskCardHTML(t)).join('');
    }

    return `
        <div class="kanban-column ${isPlannerColumn ? 'planner-column' : ''}" data-column-key="${colData.key}" ${colData.bucketId ? `data-bucket-id="${colData.bucketId}"` : ''}>
            <div class="column-header ${isPlannerColumn ? 'planner-column-header' : ''}">
                <div class="column-title">
                    ${iconHTML}
                    <h3 data-column-title>${escapeHTML(title)}</h3>
                    <span class="column-count">${count}</span>
                </div>
                <div class="col-actions">
                    ${canManageBucket ? `
                    <button class="bucket-menu-btn" data-bucket-id="${colData.bucketId}" title="Bucket options">
                        <span class="material-symbols-outlined">more_horiz</span>
                    </button>` : ''}
                    ${isPlannerColumn ? '' : addTaskHTML}
                </div>
            </div>
            ${isPlannerColumn ? `<div class="planner-add-row">${addTaskHTML}</div>` : ''}
            <div class="column-body custom-scrollbar">
                ${bodyHTML}
            </div>
        </div>`;
}

// ========== Main Render ==========

function renderKanbanBoard() {
    const boardEl = document.getElementById('kanbanBoard');
    if (!boardEl) return;

    const tasks = TaskApp.getFilteredTasks();
    const grouped = groupTasks(tasks, TaskApp.groupBy);

    let html = '';
    for (const [key, colData] of grouped) {
        html += renderColumnHTML(colData);
    }

    boardEl.innerHTML = html;

    // Update header
    updateBoardHeader();
}

function renderListView() {
    const listEl = document.getElementById('taskListView');
    if (!listEl) return;

    const tasks = TaskApp.getFilteredTasks();
    const sorted = [...tasks].sort((a, b) => {
        // Priority: urgent > important > medium > low
        const pMap = { urgent: 0, important: 1, medium: 2, low: 3 };
        const pa = pMap[a.priority] ?? 2;
        const pb = pMap[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        // Due date: closer first
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return 0;
    });

    if (sorted.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">task_alt</span>
                <p>No tasks</p>
            </div>`;
        return;
    }

    let html = '<div class="task-list">';
    for (const task of sorted) {
        html += createTaskListRowHTML(task);
    }
    html += '</div>';
    listEl.innerHTML = html;
}

function createTaskListRowHTML(task) {
    const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    const bucketName = TaskApp.getBucketName(task.bucket_id);

    let labelsHTML = '';
    if (task.labels && task.labels.length > 0) {
        const dots = task.labels.map(lid => {
            const info = TaskApp.getLabelInfo(lid);
            if (!info) return '';
            return `<span class="label-dot" style="background:${info.color}" title="${escapeHTML(info.name || '')}"></span>`;
        }).join('');
        labelsHTML = `<div class="task-list-labels">${dots}</div>`;
    }

    let dueHTML = '';
    const todayStr = formatDateISO(new Date());
    if (task.due_date) {
        const cls = task.due_date < todayStr ? 'text-red' : (task.due_date === todayStr ? 'text-orange' : '');
        dueHTML = `<span class="task-list-due ${cls}">${formatDueDate(task.due_date)}</span>`;
    }

    const progressIcons = {
        not_started: 'radio_button_unchecked',
        in_progress: 'timelapse',
        completed: 'check_circle'
    };
    const progressIcon = progressIcons[task.progress] || progressIcons.not_started;
    const isSourceReadOnly = TimeWhereManageBac?.isManageBacTask(task);

    return `
        <div class="task-list-row" data-task-id="${task.id}">
            <button class="task-list-progress-btn" data-task-id="${task.id}">
                <span class="material-symbols-outlined">${progressIcon}</span>
            </button>
            <div class="task-list-main">
                <div class="task-list-title-wrap">
                    <span class="task-list-title">${escapeHTML(task.title)}</span>
                    ${labelsHTML}
                </div>
                <div class="task-list-meta">
                    ${bucketName ? `<span class="task-list-bucket">${escapeHTML(bucketName)}</span>` : ''}
                    ${isSourceReadOnly ? '<span class="task-list-bucket">ManageBac</span>' : ''}
                    ${dueHTML}
                </div>
            </div>
            <span class="task-list-priority" style="color:${priorityCfg.color};background:${priorityCfg.bgColor}">${priorityCfg.label}</span>
        </div>`;
}

function renderBoard() {
    const boardEl = document.getElementById('kanbanBoard');
    const listEl = document.getElementById('taskListView');
    if (!boardEl || !listEl) return;
    normalizeTaskBoardGroupBy();

    if (TaskApp.currentView === 'list') {
        boardEl.style.display = 'none';
        listEl.style.display = '';
        renderListView();
    } else {
        boardEl.style.display = '';
        listEl.style.display = 'none';
        renderKanbanBoard();
    }
}

function isBucketGroupingAllowed() {
    return TaskApp.viewMode === 'plan' && !!TaskApp.currentPlanId;
}

function normalizeTaskBoardGroupBy() {
    if (TaskApp.groupBy !== 'bucket' || isBucketGroupingAllowed()) return;
    TaskApp.groupBy = TaskApp.viewMode === 'my_day' ? 'progress' : 'due_date';
}

function updateBoardHeader() {
    // Update Group By button text
    const groupByBtn = document.getElementById('btnGroupBy');
    if (groupByBtn) {
        const config = GROUP_BY_CONFIG[TaskApp.groupBy];
        groupByBtn.innerHTML = `<span class="material-symbols-outlined">group_work</span> Group by: ${config ? config.label : TaskApp.groupBy}`;
    }

    // Update breadcrumb
    const bcParent = document.querySelector('.bc-parent');
    const bcSep = document.querySelector('.bc-sep');
    const bcCurrent = document.querySelector('.bc-current');

    if (bcCurrent) {
        bcCurrent.textContent = TaskApp.getViewTitle();
    }
    if (bcParent && bcSep) {
        const parent = TaskApp.getBreadcrumbParent();
        bcParent.textContent = parent;
        bcSep.style.display = parent ? '' : 'none';
    }

    // Update filter button active state
    const filterBtn = document.getElementById('btnFilter');
    if (filterBtn) {
        filterBtn.classList.toggle('filter-active', TaskApp.hasActiveFilters());
    }

    // Hide bucket/label Group By options in cross-plan views (buckets are per-plan)
    // This is handled in the Group By menu rendering
}

// ========== Quick Add ==========

function showQuickAdd(columnEl) {
    if (TaskApp.viewMode === 'my_managebac') {
        showToast('My ManageBac 是 ManageBac 来源任务视图，不能手动新增任务。', 'error');
        return;
    }

    // In cross-plan views, need to pick a plan. Use the first one.
    let planId = TaskApp.currentPlanId;
    if (!planId && TaskApp.plans.length > 0) {
        planId = TaskApp.plans[0].id;
    }
    if (!planId) {
        showToast('Create a plan first', 'error');
        return;
    }

    // Don't create multiple quick-add forms
    if (columnEl.querySelector('.quick-add-form') || columnEl.dataset.quickAddOpening === 'true') return;
    columnEl.dataset.quickAddOpening = 'true';

    renderQuickAddForm(columnEl, planId)
        .catch(error => {
            console.error('[Tasks] Quick add failed to open:', error);
            showToast('打开快速新增失败', 'error');
        })
        .finally(() => {
            delete columnEl.dataset.quickAddOpening;
        });
}

// ========== Bucket Column Management ==========

function showBucketColumnMenu(button) {
    const bucketId = parseInt(button.dataset.bucketId, 10);
    if (!bucketId) return;

    const existing = document.querySelector('.bucket-column-menu');
    if (existing) {
        existing.remove();
        if (existing.dataset.bucketId === String(bucketId)) return;
    }

    const rect = button.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'bucket-column-menu';
    menu.dataset.bucketId = String(bucketId);
    menu.innerHTML = `
        <button type="button" class="bucket-column-menu-item" data-bucket-action="rename" data-bucket-id="${bucketId}">重命名</button>
        <button type="button" class="bucket-column-menu-item danger" data-bucket-action="delete" data-bucket-id="${bucketId}">删除</button>`;
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;
    document.body.appendChild(menu);

    setTimeout(() => {
        document.addEventListener('click', closeBucketColumnMenuOnOutside);
    }, 0);
}

function closeBucketColumnMenuOnOutside(e) {
    if (e.target.closest('.bucket-column-menu') || e.target.closest('.bucket-menu-btn')) return;
    closeBucketColumnMenu();
}

function closeBucketColumnMenu() {
    document.querySelector('.bucket-column-menu')?.remove();
    document.removeEventListener('click', closeBucketColumnMenuOnOutside);
}

async function renameBucketColumn(bucketId) {
    closeBucketColumnMenu();
    const column = document.querySelector(`.kanban-column[data-bucket-id="${bucketId}"]`);
    const titleEl = column?.querySelector('[data-column-title]');
    if (!column || !titleEl) return;

    const oldName = titleEl.textContent.trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'bucket-title-input';
    input.value = oldName;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = async (save) => {
        if (finished) return;
        finished = true;
        const nextName = input.value.trim();
        if (!save) {
            input.replaceWith(titleEl);
            return;
        }
        if (!nextName) {
            showToast('Bucket 名称不能为空', 'error');
            input.replaceWith(titleEl);
            return;
        }
        if (nextName !== oldName) {
            await TimeWhereDB.updateBucket(bucketId, { name: nextName });
            await TaskApp.refresh();
        } else {
            input.replaceWith(titleEl);
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
}

function confirmDeleteBucketColumn(bucketId) {
    closeBucketColumnMenu();
    const bucket = (TaskApp.currentPlanBuckets || []).find(item => item.id === bucketId);
    const bucketName = bucket?.name || 'Bucket';

    showDialog({
        title: '删除 Bucket',
        content: `
            <p>删除 Bucket「${escapeHTML(bucketName)}」？</p>
            <p class="text-muted">该 Bucket 下的任务不会被删除，会变为 No bucket。</p>`,
        confirmText: '删除',
        confirmDanger: true,
        onConfirm: async () => {
            await TimeWhereDB.deleteBucket(bucketId);
            await TaskApp.refresh();
            showToast('Bucket 已删除，任务已保留', 'success');
            return true;
        }
    });
}

async function renderQuickAddForm(columnEl, planId) {
    const columnBody = columnEl.querySelector('.column-body');
    const colKey = columnEl.dataset.columnKey;
    const defaults = getQuickAddDefaults(colKey);
    const fieldConfig = getQuickAddFieldConfig(TaskApp.groupBy, defaults);
    const buckets = fieldConfig.showBucketSelect ? await getQuickAddBuckets(planId) : [];

    const form = document.createElement('div');
    form.className = 'quick-add-form';
    form.innerHTML = `
        <input type="text" class="quick-add-input quick-add-title" data-field="title" placeholder="Task name..." autocomplete="off">
        ${fieldConfig.showStartDate ? `
            <label class="quick-add-field">
                <span>Start</span>
                <input type="date" class="quick-add-date" data-field="start_date">
            </label>` : ''}
        ${fieldConfig.showDueDate ? `
            <label class="quick-add-field">
                <span>Due <strong>*</strong></span>
                <input type="date" class="quick-add-date" data-field="due_date" required>
            </label>` : ''}
        ${fieldConfig.showBucketSelect ? `
            <label class="quick-add-field">
                <span>Bucket</span>
                <select class="quick-add-select" data-field="bucket_id">
                    ${renderQuickAddBucketOptions(buckets, defaults.bucket_id)}
                </select>
            </label>` : ''}
        <div class="quick-add-error" role="alert" hidden></div>
        <div class="quick-add-actions">
            <button type="button" class="quick-add-submit" data-quick-action="create">Add</button>
            <button type="button" class="quick-add-cancel" data-quick-action="cancel">Cancel</button>
        </div>`;

    columnBody.insertBefore(form, columnBody.firstChild);
    const titleInput = form.querySelector('[data-field="title"]');
    titleInput.focus();

    const handleCreate = async () => {
        const title = titleInput.value.trim();
        if (!title) {
            showQuickAddError(form, '请输入任务名称');
            return;
        }

        const submitBtn = form.querySelector('[data-quick-action="create"]');
        try {
            submitBtn.disabled = true;
            clearQuickAddError(form);

            // 从 settings 读取默认时长和优先级
            const settingsData = await TimeWhereDB.getSettings();
            const defaultDuration = settingsData.default_duration || 45;
            const defaultPriority = settingsData.default_priority || 'medium';

            const payload = {
                ...defaults,
                title,
                plan_id: planId,
                duration: defaultDuration,
                priority: defaults.priority || defaultPriority
            };

            const dueInput = form.querySelector('[data-field="due_date"]');
            if (dueInput) payload.due_date = dueInput.value || null;

            const startInput = form.querySelector('[data-field="start_date"]');
            if (startInput) payload.start_date = startInput.value || null;

            const bucketSelect = form.querySelector('[data-field="bucket_id"]');
            if (bucketSelect) {
                payload.bucket_id = bucketSelect.value ? parseInt(bucketSelect.value, 10) : null;
            }

            await TimeWhereDB.addTask(normalizeManualTaskPayload(payload));

            form.remove();
            await TaskApp.refresh();
        } catch (error) {
            showQuickAddError(form, error.message || '新增任务失败');
            submitBtn.disabled = false;
        }
    };

    form.addEventListener('click', (e) => {
        const action = e.target.closest('[data-quick-action]')?.dataset.quickAction;
        if (action === 'create') handleCreate();
        if (action === 'cancel') form.remove();
    });

    form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleCreate();
        if (e.key === 'Escape') form.remove();
    });
}

function getQuickAddDefaults(columnKey) {
    const defaults = {};
    const groupBy = TaskApp.groupBy;

    if (groupBy === 'due_date') {
        const today = new Date();
        const todayStr = formatDateISO(today);
        const tomorrowDate = new Date(today);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);

        switch (columnKey) {
            case 'today':    defaults.due_date = todayStr; break;
            case 'tomorrow': defaults.due_date = formatDateISO(tomorrowDate); break;
            // overdue, this_week, next_week, future, no_date: no default date
        }
    } else if (groupBy === 'bucket') {
        const match = columnKey.match(/^bucket_(\d+)$/);
        if (match) defaults.bucket_id = parseInt(match[1]);
    } else if (groupBy === 'priority') {
        if (['urgent', 'important', 'medium', 'low'].includes(columnKey)) {
            defaults.priority = columnKey;
        }
    } else if (groupBy === 'progress') {
        if (['not_started', 'in_progress', 'completed'].includes(columnKey)) {
            defaults.progress = columnKey;
        }
    } else if (groupBy === 'labels') {
        const match = columnKey.match(/^label_(\d+)$/);
        if (match) defaults.labels = [parseInt(match[1])];
    }

    return defaults;
}

function getQuickAddFieldConfig(groupBy, defaults = {}) {
    return {
        showStartDate: groupBy !== 'due_date',
        showDueDate: groupBy !== 'due_date' || !defaults.due_date,
        showBucketSelect: groupBy === 'due_date' || groupBy !== 'bucket'
    };
}

function normalizeManualTaskPayload(task) {
    if (!task.due_date) {
        throw new Error('请选择截止日期');
    }
    return {
        ...task,
        start_date: task.start_date || task.due_date
    };
}

async function getQuickAddBuckets(planId) {
    if (TaskApp.currentPlanId === planId) return TaskApp.currentPlanBuckets || [];
    if (typeof TimeWhereDB.getBucketsByPlan === 'function') {
        return await TimeWhereDB.getBucketsByPlan(planId);
    }
    return [];
}

function renderQuickAddBucketOptions(buckets, selectedBucketId) {
    return [
        `<option value="">No bucket</option>`,
        ...(buckets || []).map(bucket => {
            const selected = bucket.id === selectedBucketId ? 'selected' : '';
            return `<option value="${bucket.id}" ${selected}>${escapeHTML(bucket.name)}</option>`;
        })
    ].join('');
}

function showQuickAddError(form, message) {
    const errorEl = form.querySelector('.quick-add-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
}

function clearQuickAddError(form) {
    const errorEl = form.querySelector('.quick-add-error');
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.hidden = true;
}

// ========== Task Progress Toggle ==========

async function cycleTaskProgress(taskId) {
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) return;

    const cycle = {
        'not_started': 'in_progress',
        'in_progress': 'completed',
        'completed': 'not_started'
    };
    const newProgress = cycle[task.progress] || 'not_started';
    const updates = { progress: newProgress };

    if (newProgress === 'completed') {
        updates.completed_at = new Date().toISOString();
    } else {
        updates.completed_at = null;
    }

    await TimeWhereDB.updateTask(taskId, updates);
    await TaskApp.refresh();
    showToast(`Task ${newProgress === 'completed' ? 'completed' : newProgress === 'in_progress' ? 'started' : 'reset'}`, 'success');
}

// ========== Utility ==========

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDueDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';

    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

