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
        return `<button class="priority-option ${isActive ? 'active' : ''}" data-priority="${p}" style="--pri-color:${cfg.color};--pri-bg:${cfg.bgColor}">${cfg.label}</button>`;
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
        return `<button class="label-chip ${isSelected ? 'selected' : ''}" data-label-id="${l.id}" style="--label-color:${l.color}">
            ${escapeHTML(l.name || l.color)}
        </button>`;
    }).join('');

    // Checklist items
    const checklistHTML = (task.checklist || []).map(item => `
        <div class="checklist-item" data-item-id="${item.id}">
            <input type="checkbox" class="checklist-checkbox" ${item.checked ? 'checked' : ''}>
            <span class="checklist-text ${item.checked ? 'checked' : ''}">${escapeHTML(item.title)}</span>
            <button class="checklist-delete" title="Delete"><span class="material-symbols-outlined">close</span></button>
        </div>
    `).join('');

    panel.innerHTML = `
        <div class="detail-header">
            <h2>Task Details</h2>
            <button class="detail-close-btn" title="Close">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>

        <div class="detail-body custom-scrollbar">
            <!-- Title -->
            <div class="detail-field">
                <div class="detail-title" contenteditable="true" data-field="title" placeholder="Task title">${escapeHTML(task.title)}</div>
            </div>

            <!-- Progress -->
            <div class="detail-field">
                <label>Progress</label>
                <div class="progress-picker">${progressBtns}</div>
            </div>

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
                    <input type="date" class="detail-date" data-field="start_date" value="${task.start_date || ''}">
                </div>
                <div class="detail-field-half">
                    <label>Due date</label>
                    <input type="date" class="detail-date" data-field="due_date" value="${task.due_date || ''}">
                </div>
            </div>

            <!-- Schedule time + Duration -->
            <div class="detail-field detail-field-row">
                <div class="detail-field-half">
                    <label>定时时间</label>
                    <input type="time" class="detail-date" data-field="schedule_time" value="${task.schedule_time || ''}">
                </div>
                <div class="detail-field-half">
                    <label>预计时长 (分钟)</label>
                    <input type="number" class="detail-date" data-field="duration" value="${task.duration || 45}" min="5" max="480" step="5">
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
                <textarea class="detail-textarea" data-field="notes" placeholder="Add notes..." rows="4">${escapeHTML(task.notes || '')}</textarea>
            </div>

            <!-- Checklist -->
            <div class="detail-field">
                <label>Checklist${task.checklist && task.checklist.length > 0 ? ` (${task.checklist.filter(i => i.checked).length}/${task.checklist.length})` : ''}</label>
                <div class="checklist-list" id="checklistItems">${checklistHTML}</div>
                <div class="checklist-add">
                    <input type="text" class="checklist-add-input" id="checklistNewItem" placeholder="Add an item...">
                </div>
            </div>
        </div>

        <div class="detail-footer">
            <button class="btn-delete-task" data-task-id="${task.id}">
                <span class="material-symbols-outlined">delete</span> Delete task
            </button>
        </div>`;

    // Wire up event listeners for the panel
    wireDetailPanelEvents(task.id);
}

// ========== Panel Event Wiring ==========

function wireDetailPanelEvents(taskId) {
    const panel = document.getElementById('taskDetailPanel');
    if (!panel) return;

    // Close button
    panel.querySelector('.detail-close-btn')?.addEventListener('click', closeDetailPanel);

    // Title (contenteditable)
    const titleEl = panel.querySelector('.detail-title');
    if (titleEl) {
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
        btn.addEventListener('click', async () => {
            await TimeWhereDB.updateTask(taskId, { priority: btn.dataset.priority });
            await TaskApp.refresh();
        });
    });

    // Bucket select
    const bucketSelect = panel.querySelector('[data-field="bucket_id"]');
    if (bucketSelect) {
        bucketSelect.addEventListener('change', async () => {
            const val = bucketSelect.value;
            await TimeWhereDB.updateTask(taskId, { bucket_id: val ? parseInt(val) : null });
            await TaskApp.refresh();
        });
    }

    // Date / time / number inputs (start_date, due_date, schedule_time, duration)
    panel.querySelectorAll('.detail-date').forEach(input => {
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
    if (notesEl) {
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
        cb.addEventListener('change', async () => {
            const itemId = cb.closest('.checklist-item').dataset.itemId;
            await TimeWhereDB.toggleChecklistItem(taskId, itemId);
            await TaskApp.refresh();
        });
    });

    // Checklist: delete item
    panel.querySelectorAll('.checklist-delete').forEach(btn => {
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
    if (addInput) {
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
    panel.querySelector('.btn-delete-task')?.addEventListener('click', () => {
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

console.log('[DetailPanel] Detail panel module loaded');
