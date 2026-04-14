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

            if (due < today) return 'overdue';
            if (due >= today && due < tomorrow) return 'today';
            if (due >= tomorrow && due < dayAfterTomorrow) return 'tomorrow';
            if (due <= weekEnd) return 'this_week';
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

    return grouped;
}

// ========== Priority Helpers ==========

const PRIORITY_CONFIG = {
    urgent:    { label: 'Urgent',    color: '#ef4444', bgColor: '#fef2f2' },
    important: { label: 'Important', color: '#f97316', bgColor: '#fff7ed' },
    medium:    { label: 'Medium',    color: '#3b82f6', bgColor: '#eff6ff' },
    low:       { label: 'Low',       color: '#6b7280', bgColor: '#f9fafb' }
};

// ========== Card Rendering ==========

function createTaskCardHTML(task) {
    const bucketName = TaskApp.getBucketName(task.bucket_id);
    const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

    // Labels dots
    let labelsHTML = '';
    if (task.labels && task.labels.length > 0) {
        const dots = task.labels.map(lid => {
            const info = TaskApp.getLabelInfo(lid);
            if (!info) return '';
            return `<span class="label-dot" style="background:${info.color}" title="${info.name || ''}"></span>`;
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

    // Due date text
    let dueDateHTML = '';
    if (task.due_date) {
        const isOverdue = new Date(task.due_date + 'T23:59:59') < new Date();
        const cls = isOverdue ? 'text-red' : '';
        dueDateHTML = `
            <span class="task-due-badge ${cls}">
                <span class="material-symbols-outlined">schedule</span>
                ${formatDueDate(task.due_date)}
            </span>`;
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

    return `
        <div class="task-card ${progressClass}" data-task-id="${task.id}">
            ${labelsHTML}
            <div class="task-card-header">
                <button class="task-progress-btn ${progressClass}" data-task-id="${task.id}" title="Toggle progress">
                    <span class="material-symbols-outlined">${progressIcon}</span>
                </button>
                <h4 class="task-title">${escapeHTML(task.title)}</h4>
            </div>
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

    const iconHTML = icon
        ? `<span class="material-symbols-outlined">${icon}</span>`
        : '';

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
        <div class="kanban-column" data-column-key="${colData.key}">
            <div class="column-header">
                <div class="column-title">
                    ${iconHTML}
                    <h3>${escapeHTML(title)}</h3>
                    <span class="column-count">${count}</span>
                </div>
                <div class="col-actions">
                    <button class="col-add-task" title="Add task">
                        <span class="material-symbols-outlined">add</span>
                    </button>
                </div>
            </div>
            <div class="column-body custom-scrollbar">
                ${bodyHTML}
            </div>
        </div>`;
}

// ========== Main Render ==========

function renderBoard() {
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
    // Don't create multiple quick-add inputs
    if (columnEl.querySelector('.quick-add-input')) return;

    // In cross-plan views, need to pick a plan. Use the first one.
    let planId = TaskApp.currentPlanId;
    if (!planId && TaskApp.plans.length > 0) {
        planId = TaskApp.plans[0].id;
    }
    if (!planId) {
        showToast('Create a plan first', 'error');
        return;
    }

    const columnBody = columnEl.querySelector('.column-body');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quick-add-input';
    input.placeholder = 'Task name...';

    columnBody.insertBefore(input, columnBody.firstChild);
    input.focus();

    const handleCreate = async () => {
        const title = input.value.trim();
        if (!title) {
            input.remove();
            return;
        }

        // Determine default values based on current groupBy and column
        const colKey = columnEl.dataset.columnKey;
        const defaults = getQuickAddDefaults(colKey);

        await TimeWhereDB.addTask({
            title,
            plan_id: planId,
            ...defaults
        });

        input.remove();
        await TaskApp.refresh();
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleCreate();
        if (e.key === 'Escape') input.remove();
    });
    input.addEventListener('blur', handleCreate);
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
            // overdue, this_week, future, no_date: no default date
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

console.log('[Board] Board module loaded');
