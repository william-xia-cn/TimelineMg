/**
 * Task Detail Panel — Slide-in panel for viewing/editing a task
 */

// ========== Panel Open / Close ==========

function openDetailPanel(taskId) {
    TaskApp.selectedTaskId = taskId;
    renderDetailPanel(taskId);
    const panel = document.getElementById('taskDetailPanel');
    if (panel) {
        panel.classList.add('open');
    }
}

function closeDetailPanel() {
    TaskApp.selectedTaskId = null;
    const panel = document.getElementById('taskDetailPanel');
    if (panel) {
        panel.classList.remove('open');
    }
}

// ========== Render Panel ==========

async function renderDetailPanel(taskId) {
    const panel = document.getElementById('taskDetailPanel');
    if (!panel) return;

    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) {
        closeDetailPanel();
        return;
    }

    const isManageBacTask = TimeWhereManageBac?.isManageBacTask(task);
    const sourceReadonlyAttr = isManageBacTask ? 'data-readonly-source="true"' : '';
    const sourceDisabledAttr = isManageBacTask ? 'disabled' : '';
    const sourceReadonlyTextareaAttr = isManageBacTask ? 'readonly' : '';
    const titleEditable = isManageBacTask ? 'false' : 'true';
    const planInfo = await getTaskPlanInfo(task);
    const subjectText = task.subject || planInfo.subject || planInfo.name || 'No subject';
    const manageBacSubjectText = task.managebac_subject || '';

    const buckets = TaskApp.currentPlanBuckets;
    const labels = TaskApp.currentPlanLabels;

    // Bucket selector options
    const bucketOptions = [
        `<option value="">No bucket</option>`,
        ...buckets.map(b => `<option value="${b.id}" ${b.id === task.bucket_id ? 'selected' : ''}>${escapeHTML(b.name)}</option>`)
    ].join('');

    // Priority buttons
    const priorities = ['urgent', 'important', 'medium', 'low'];
    const priorityBtns = priorities.map(p => {
        const cfg = PRIORITY_CONFIG[p];
        const isActive = task.priority === p;
        return `<button class="priority-option ${isActive ? 'active' : ''}" data-priority="${p}" style="--pri-color:${cfg.color};--pri-bg:${cfg.bgColor}" ${sourceDisabledAttr}>${cfg.label}</button>`;
    }).join('');

    // Progress buttons
    const progresses = [
        { key: 'not_started', label: 'Not started', icon: 'radio_button_unchecked' },
        { key: 'in_progress', label: 'In progress', icon: 'timelapse' },
        { key: 'completed',   label: 'Completed',   icon: 'check_circle' }
    ];
    const progressBtns = progresses.map(p => {
        const isActive = task.progress === p.key;
        return `<button class="progress-option ${isActive ? 'active' : ''}" data-progress="${p.key}">
            <span class="material-symbols-outlined">${p.icon}</span> ${p.label}
        </button>`;
    }).join('');

    // Labels chips
    const labelChips = labels.map(l => {
        const isSelected = task.labels && task.labels.includes(l.id);
        return `<button class="label-chip ${isSelected ? 'selected' : ''}" data-label-id="${l.id}" style="--label-color:${l.color}" ${sourceDisabledAttr}>
            ${escapeHTML(l.name || l.color)}
        </button>`;
    }).join('');

    // Checklist items
    const checklistHTML = (task.checklist || []).map(item => `
        <div class="checklist-item" data-item-id="${item.id}">
            <input type="checkbox" class="checklist-checkbox" ${item.checked ? 'checked' : ''} ${sourceDisabledAttr}>
            <span class="checklist-text ${item.checked ? 'checked' : ''}">${escapeHTML(item.title)}</span>
            <button class="checklist-delete" title="Delete" ${sourceDisabledAttr}><span class="material-symbols-outlined">close</span></button>
        </div>
    `).join('');

    panel.innerHTML = `
        <div class="detail-header">
            <div class="detail-header-title">
                <h2>Task Details</h2>
                ${isManageBacTask ? '<span class="source-badge">ManageBac</span>' : ''}
            </div>
            <button class="detail-close-btn" title="Close">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>

        <div class="detail-body custom-scrollbar">
            <!-- Title -->
            <div class="detail-field">
                <div class="detail-title ${isManageBacTask ? 'source-readonly' : ''}" contenteditable="${titleEditable}" data-field="title" ${sourceReadonlyAttr} placeholder="Task title">${escapeHTML(task.title)}</div>
                ${isManageBacTask ? '<p class="source-readonly-hint">ManageBac 来源内容只读；本地完成状态可在 TimeWhere 更新。</p>' : ''}
            </div>

            <!-- Progress -->
            <div class="detail-field">
                <label>Progress</label>
                <div class="progress-picker">${progressBtns}</div>
            </div>

            <!-- Plan / Subject -->
            <div class="detail-field detail-field-row">
                <div class="detail-field-half">
                    <label>TimeWhere Plan</label>
                    <div class="detail-readonly-value" data-field="plan_subject" ${isManageBacTask ? 'data-readonly-source="true"' : ''}>${escapeHTML(planInfo.name || 'No plan')}</div>
                </div>
                <div class="detail-field-half">
                    <label>Subject</label>
                    <div class="detail-readonly-value" data-field="subject" ${isManageBacTask ? 'data-readonly-source="true"' : ''}>${escapeHTML(subjectText)}</div>
                </div>
            </div>

            ${isManageBacTask ? `
            <div class="detail-field">
                <label>Subject in ManageBac</label>
                <div class="detail-readonly-value" data-field="managebac_subject" data-readonly-source="true">${escapeHTML(manageBacSubjectText || 'ManageBac')}</div>
            </div>` : ''}

            <!-- Priority -->
            <div class="detail-field">
                <label>Priority</label>
                <div class="priority-picker">${priorityBtns}</div>
            </div>

            <!-- Bucket -->
            <div class="detail-field">
                <label>Bucket</label>
                <select class="detail-select" data-field="bucket_id">${bucketOptions}</select>
            </div>

            <!-- Dates -->
            <div class="detail-field detail-field-row">
                <div class="detail-field-half">
                    <label>Start date</label>
                    <input type="date" class="detail-date" data-field="start_date" value="${task.start_date || ''}" ${sourceDisabledAttr}>
                </div>
                <div class="detail-field-half">
                    <label>Due date</label>
                    <input type="date" class="detail-date" data-field="due_date" value="${task.due_date || ''}" ${sourceDisabledAttr}>
                </div>
            </div>

            <!-- Schedule time + Duration -->
            <div class="detail-field detail-field-row">
                <div class="detail-field-half">
                    <label>定时时间</label>
                    <input type="time" class="detail-date" data-field="schedule_time" value="${task.schedule_time || ''}" ${sourceDisabledAttr}>
                </div>
                <div class="detail-field-half">
                    <label>预计时长 (分钟)</label>
                    <input type="number" class="detail-date" data-field="duration" value="${task.duration || 45}" min="5" max="480" step="5" ${sourceDisabledAttr}>
                </div>
            </div>

            <!-- Labels -->
            <div class="detail-field">
                <label>Labels</label>
                <div class="labels-picker">${labelChips || '<span class="text-muted">No labels defined for this plan</span>'}</div>
            </div>

            <!-- Notes -->
            <div class="detail-field">
                <label>Notes</label>
                <textarea class="detail-textarea ${isManageBacTask ? 'source-readonly' : ''}" data-field="notes" placeholder="Add notes..." rows="4" ${sourceReadonlyTextareaAttr} ${sourceReadonlyAttr}>${escapeHTML(task.notes || '')}</textarea>
            </div>

            <!-- Checklist -->
            <div class="detail-field">
                <label>Checklist${task.checklist && task.checklist.length > 0 ? ` (${task.checklist.filter(i => i.checked).length}/${task.checklist.length})` : ''}</label>
                <div class="checklist-list" id="checklistItems">${checklistHTML}</div>
                <div class="checklist-add">
                    <input type="text" class="checklist-add-input" id="checklistNewItem" placeholder="Add an item..." ${sourceDisabledAttr}>
                </div>
            </div>
        </div>

        <div class="detail-footer">
            <button class="btn-delete-task ${isManageBacTask ? 'source-delete-disabled' : ''}" data-task-id="${task.id}" ${sourceDisabledAttr}>
                <span class="material-symbols-outlined">${isManageBacTask ? 'lock' : 'delete'}</span> ${isManageBacTask ? 'ManageBac 来源任务不能删除' : 'Delete task'}
            </button>
        </div>`;

    // Wire up event listeners for the panel
    wireDetailPanelEvents(task.id, { isManageBacTask });
}

async function getTaskPlanInfo(task) {
    const planId = task?.plan_id;
    if (!planId) return { id: null, name: 'No plan', subject: task?.subject || '' };

    let plan = (TaskApp.plans || []).find(item => String(item.id) === String(planId));
    if (!plan && typeof TimeWhereDB.getPlans === 'function') {
        const plans = await TimeWhereDB.getPlans();
        plan = (plans || []).find(item => String(item.id) === String(planId));
    }
    if (!plan) {
        return {
            id: planId,
            name: `Plan ${planId}`,
            subject: task?.subject || ''
        };
    }
    return {
        id: plan.id,
        name: plan.name || `Plan ${plan.id}`,
        subject: plan.subject || ''
    };
}

// ========== Panel Event Wiring ==========

function wireDetailPanelEvents(taskId, options = {}) {
    const isManageBacTask = options.isManageBacTask === true;
    const panel = document.getElementById('taskDetailPanel');
    if (!panel) return;

    // Close button
    panel.querySelector('.detail-close-btn')?.addEventListener('click', closeDetailPanel);

    // Title (contenteditable)
    const titleEl = panel.querySelector('.detail-title');
    if (titleEl && !isManageBacTask) {
        titleEl.addEventListener('blur', async () => {
            const newTitle = titleEl.textContent.trim();
            if (newTitle) {
                await TimeWhereDB.updateTask(taskId, { title: newTitle });
                await TaskApp.refresh();
            }
        });
        titleEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
        });
    }

    // Progress picker
    panel.querySelectorAll('.progress-option').forEach(btn => {
        btn.addEventListener('click', async () => {
            const progress = btn.dataset.progress;
            const updates = { progress };
            if (progress === 'completed') updates.completed_at = new Date().toISOString();
            else updates.completed_at = null;
            await TimeWhereDB.updateTask(taskId, updates);
            await TaskApp.refresh();
        });
    });

    // Priority picker
    panel.querySelectorAll('.priority-option').forEach(btn => {
        if (btn.disabled || isManageBacTask) return;
        btn.addEventListener('click', async () => {
            await TimeWhereDB.updateTask(taskId, { priority: btn.dataset.priority });
            await TaskApp.refresh();
        });
    });

    // Bucket select
    const bucketSelect = panel.querySelector('[data-field="bucket_id"]');
    if (bucketSelect) {
        bucketSelect.addEventListener('change', async () => {
            if (bucketSelect.disabled || isManageBacTask) return;
            const val = bucketSelect.value;
            await TimeWhereDB.updateTask(taskId, { bucket_id: val ? parseInt(val) : null });
            await TaskApp.refresh();
        });
    }

    // Date / time / number inputs (start_date, due_date, schedule_time, duration)
    panel.querySelectorAll('.detail-date').forEach(input => {
        if (input.disabled || isManageBacTask) return;
        input.addEventListener('change', async () => {
            const field = input.dataset.field;
            let value = input.value;
            if (field === 'duration') {
                value = value ? parseInt(value, 10) : 45;
            } else {
                value = value || null;
            }
            await TimeWhereDB.updateTask(taskId, { [field]: value });
            await TaskApp.refresh();
        });
    });

    // Labels picker
    panel.querySelectorAll('.label-chip').forEach(chip => {
        if (chip.disabled || isManageBacTask) return;
        chip.addEventListener('click', async () => {
            const labelId = parseInt(chip.dataset.labelId);
            const task = await TimeWhereDB.getTaskById(taskId);
            let labels = [...(task.labels || [])];

            if (labels.includes(labelId)) {
                labels = labels.filter(l => l !== labelId);
            } else {
                labels.push(labelId);
            }

            await TimeWhereDB.updateTask(taskId, { labels });
            await TaskApp.refresh();
        });
    });

    // Notes textarea
    const notesEl = panel.querySelector('[data-field="notes"]');
    if (notesEl && !notesEl.readOnly && !isManageBacTask) {
        let notesTimer;
        notesEl.addEventListener('input', () => {
            clearTimeout(notesTimer);
            notesTimer = setTimeout(async () => {
                await TimeWhereDB.updateTask(taskId, { notes: notesEl.value });
                // Don't full refresh for notes — just sync quietly
            }, 500);
        });
    }

    // Checklist: toggle item
    panel.querySelectorAll('.checklist-checkbox').forEach(cb => {
        if (cb.disabled || isManageBacTask) return;
        cb.addEventListener('change', async () => {
            const itemId = cb.closest('.checklist-item').dataset.itemId;
            await TimeWhereDB.toggleChecklistItem(taskId, itemId);
            await TaskApp.refresh();
        });
    });

    // Checklist: delete item
    panel.querySelectorAll('.checklist-delete').forEach(btn => {
        if (btn.disabled || isManageBacTask) return;
        btn.addEventListener('click', async () => {
            const itemId = btn.closest('.checklist-item').dataset.itemId;
            const task = await TimeWhereDB.getTaskById(taskId);
            const newChecklist = (task.checklist || []).filter(i => i.id !== itemId);
            await TimeWhereDB.updateChecklist(taskId, newChecklist);
            await TaskApp.refresh();
        });
    });

    // Checklist: add item
    const addInput = panel.querySelector('#checklistNewItem');
    if (addInput && !addInput.disabled && !isManageBacTask) {
        addInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const title = addInput.value.trim();
                if (!title) return;
                const task = await TimeWhereDB.getTaskById(taskId);
                const newChecklist = [...(task.checklist || []), {
                    id: crypto.randomUUID(),
                    title,
                    checked: false
                }];
                await TimeWhereDB.updateChecklist(taskId, newChecklist);
                addInput.value = '';
                await TaskApp.refresh();
            }
        });
    }

    // Delete task
    const deleteBtn = panel.querySelector('.btn-delete-task');
    if (deleteBtn && !deleteBtn.disabled && !isManageBacTask) {
        deleteBtn.addEventListener('click', () => {
        showDialog({
            title: 'Delete task',
            content: '<p>Are you sure you want to delete this task?</p>',
            confirmText: 'Delete',
            confirmDanger: true,
            onConfirm: async () => {
                await TimeWhereDB.deleteTask(taskId);
                closeDetailPanel();
                await TaskApp.refresh();
                showToast('Task deleted', 'success');
                return true;
            }
        });
        });
    }
}

