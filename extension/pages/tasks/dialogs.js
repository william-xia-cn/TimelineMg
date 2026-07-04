/**
 * Dialogs — Modal dialogs for Plan, Bucket, Label management and Filters
 */

// ========== Generic Dialog ==========

function showDialog({ title, content, confirmText = 'OK', confirmDanger = false, onConfirm, onCancel }) {
    closeDialog(); // Close any existing

    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;

    overlay.innerHTML = `
        <div class="dialog">
            <div class="dialog-header">
                <h3>${title}</h3>
                <button class="dialog-close-btn"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div class="dialog-body">${content}</div>
            <div class="dialog-actions">
                <button class="btn-dialog btn-dialog-cancel">Cancel</button>
                <button class="btn-dialog btn-dialog-confirm ${confirmDanger ? 'btn-danger' : ''}">${confirmText}</button>
            </div>
        </div>`;

    overlay.classList.add('open');

    // Focus first input if any
    setTimeout(() => {
        const firstInput = overlay.querySelector('input[autofocus], input:first-of-type');
        if (firstInput) firstInput.focus();
    }, 50);

    // Wire events
    overlay.querySelector('.dialog-close-btn').addEventListener('click', () => {
        closeDialog();
        if (onCancel) onCancel();
    });
    overlay.querySelector('.btn-dialog-cancel').addEventListener('click', () => {
        closeDialog();
        if (onCancel) onCancel();
    });
    overlay.querySelector('.btn-dialog-confirm').addEventListener('click', async () => {
        if (onConfirm) {
            const result = await onConfirm();
            if (result !== false) closeDialog();
        } else {
            closeDialog();
        }
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeDialog();
            if (onCancel) onCancel();
        }
    });

    // Close on Escape
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeDialog();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function closeDialog() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.classList.remove('open');
        overlay.innerHTML = '';
    }
}

// ========== Copy Task Dialog ==========

async function showCopyTaskDialog(taskId) {
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) {
        showToast('找不到要复制的任务', 'error');
        return;
    }

    const planId = task.plan_id;
    const plan = (TaskApp.plans || []).find(item => String(item.id) === String(planId));
    const planName = plan?.name || (planId ? `Plan ${planId}` : 'No plan');
    const buckets = planId && typeof TimeWhereDB.getBucketsByPlan === 'function'
        ? await TimeWhereDB.getBucketsByPlan(planId)
        : [];
    const bucketOptions = [
        `<option value="">No bucket</option>`,
        ...buckets.map(bucket => `
            <option value="${bucket.id}" ${bucket.id === task.bucket_id ? 'selected' : ''}>${escapeHTML(bucket.name)}</option>
        `)
    ].join('');
    const defaultTitle = `${task.title || 'Untitled task'} - 副本`;
    const defaultDueDate = task.due_date || task.deadline || '';

    showDialog({
        title: '复制任务',
        confirmText: '复制',
        content: `
            <div class="copy-task-form">
                <label class="copy-task-field">
                    <span>任务名称</span>
                    <input type="text" id="copyTaskTitle" class="dialog-input" value="${escapeAttribute(defaultTitle)}" autofocus>
                </label>
                <label class="copy-task-field">
                    <span>Plan</span>
                    <input type="text" class="dialog-input" value="${escapeAttribute(planName)}" disabled>
                </label>
                <label class="copy-task-field">
                    <span>Bucket</span>
                    <select id="copyTaskBucket" class="dialog-input">${bucketOptions}</select>
                </label>
                <div class="copy-task-options" aria-label="复制字段">
                    <label class="copy-task-checkbox"><input type="checkbox" id="copyTaskDates" checked> 复制日期</label>
                    <label class="copy-task-field" data-copy-dates-field>
                        <span>结束日期</span>
                        <input type="date" id="copyTaskDueDate" class="dialog-input" value="${escapeAttribute(defaultDueDate)}">
                    </label>
                    <label class="copy-task-checkbox"><input type="checkbox" id="copyTaskNotes" checked> 复制说明</label>
                    <label class="copy-task-checkbox"><input type="checkbox" id="copyTaskChecklist" checked> 复制清单</label>
                    <label class="copy-task-checkbox"><input type="checkbox" id="copyTaskLabels" checked> 复制标签</label>
                </div>
                <div class="copy-task-recurrence" aria-label="周期任务">
                    <label class="copy-task-field">
                        <span>重复</span>
                        <select id="copyTaskRecurrenceFrequency" class="dialog-input">
                            <option value="none">不重复</option>
                            <option value="weekly">每周</option>
                            <option value="monthly">每月</option>
                        </select>
                    </label>
                    <label class="copy-task-field">
                        <span>次数</span>
                        <input type="number" id="copyTaskRecurrenceCount" class="dialog-input" min="2" max="12" value="2" disabled>
                    </label>
                </div>
                <div class="copy-task-error" id="copyTaskError" role="alert" hidden></div>
            </div>`,
        onConfirm: async () => {
            const titleInput = document.getElementById('copyTaskTitle');
            const errorEl = document.getElementById('copyTaskError');
            const title = titleInput?.value.trim();
            if (!title) {
                if (errorEl) {
                    errorEl.textContent = '请输入任务名称';
                    errorEl.hidden = false;
                }
                titleInput?.focus();
                return false;
            }

            const bucketValue = document.getElementById('copyTaskBucket')?.value || '';
            const copyDates = document.getElementById('copyTaskDates')?.checked !== false;
            const copyDueDate = document.getElementById('copyTaskDueDate')?.value || null;
            const copyNotes = document.getElementById('copyTaskNotes')?.checked !== false;
            const copyChecklist = document.getElementById('copyTaskChecklist')?.checked !== false;
            const copyLabels = document.getElementById('copyTaskLabels')?.checked !== false;
            const recurrenceFrequency = document.getElementById('copyTaskRecurrenceFrequency')?.value || 'none';
            const recurrenceCount = parseInt(document.getElementById('copyTaskRecurrenceCount')?.value || '0', 10);

            const payload = buildCopiedTaskPayload(task, {
                title,
                bucket_id: bucketValue ? parseInt(bucketValue, 10) : null,
                copyDates,
                due_date: copyDueDate,
                copyNotes,
                copyChecklist,
                copyLabels
            });

            const createdTasks = recurrenceFrequency === 'weekly' || recurrenceFrequency === 'monthly'
                ? await TimeWhereDB.addRecurringTaskSeries(payload, { frequency: recurrenceFrequency, count: recurrenceCount })
                : [await TimeWhereDB.addTask(payload)];
            const newTask = createdTasks[0];
            await TaskApp.refresh();
            showToast('任务已复制', 'success');
            if (newTask?.id) openDetailPanel(newTask.id);
            return true;
        }
    });

    document.getElementById('copyTaskDates')?.addEventListener('change', (event) => {
        const dueInput = document.getElementById('copyTaskDueDate');
        if (dueInput) dueInput.disabled = event.target.checked === false;
    });

    document.getElementById('copyTaskRecurrenceFrequency')?.addEventListener('change', (event) => {
        const countInput = document.getElementById('copyTaskRecurrenceCount');
        if (countInput) countInput.disabled = event.target.value === 'none';
    });
}

function buildCopiedTaskPayload(task, options = {}) {
    const payload = {
        title: options.title || `${task.title || 'Untitled task'} - 副本`,
        plan_id: task.plan_id,
        bucket_id: Object.prototype.hasOwnProperty.call(options, 'bucket_id') ? options.bucket_id : (task.bucket_id || null),
        progress: 'not_started',
        status: 'pending',
        priority: task.priority || 'medium',
        labels: options.copyLabels === false ? [] : [...(task.labels || [])],
        notes: options.copyNotes === false ? '' : (task.notes || ''),
        checklist: options.copyChecklist === false ? [] : cloneChecklistForCopy(task.checklist),
        schedule_time: task.schedule_time || null,
        duration: task.duration || 45,
        completed_at: null,
        source: null,
        source_type: null,
        source_uid: null,
        source_updated_at: null,
        source_url: null,
        managebac_subject: null,
        readonly: false,
        synced_at: null,
        google_task_id: null
    };

    if (options.copyDates !== false) {
        const sourceStartDate = task.start_date || null;
        const sourceDueDate = task.due_date || task.deadline || null;
        const hasDueDateOverride = Object.prototype.hasOwnProperty.call(options, 'due_date');
        const dueDate = hasDueDateOverride ? (options.due_date || null) : sourceDueDate;
        payload.start_date = sourceStartDate === sourceDueDate ? dueDate : sourceStartDate;
        payload.due_date = dueDate;
        payload.deadline = dueDate;
    }
    return payload;
}

function cloneChecklistForCopy(checklist = []) {
    return (checklist || []).map((item, index) => ({
        ...item,
        id: generateCopiedChecklistId(index),
        checked: false
    }));
}

function generateCopiedChecklistId(index = 0) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `copy-${Date.now()}-${index}`;
}

// ========== Manage Buckets Dialog ==========

async function showManageBucketsDialog(planId) {
    const buckets = await TimeWhereDB.getBucketsByPlan(planId);

    function renderBucketList() {
        return buckets.map((b, i) => `
            <div class="manage-item" data-bucket-id="${b.id}">
                <span class="manage-item-handle material-symbols-outlined">drag_indicator</span>
                <input type="text" class="manage-item-name" value="${escapeHTML(b.name)}" data-bucket-id="${b.id}">
                <button class="manage-item-delete" data-bucket-id="${b.id}" title="Delete">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        `).join('');
    }

    showDialog({
        title: 'Manage buckets',
        content: `
            <div class="manage-list" id="manageBucketList">${renderBucketList()}</div>
            <div class="manage-add">
                <input type="text" id="newBucketName" class="dialog-input" placeholder="New bucket name...">
                <button class="btn-dialog btn-dialog-confirm" id="btnAddBucket">Add</button>
            </div>`,
        confirmText: 'Done',
        onConfirm: async () => {
            // Save all name changes
            const nameInputs = document.querySelectorAll('#manageBucketList .manage-item-name');
            for (const input of nameInputs) {
                const id = parseInt(input.dataset.bucketId);
                const name = input.value.trim();
                if (name) {
                    await TimeWhereDB.updateBucket(id, { name });
                }
            }
            await TaskApp.refresh();
            return true;
        }
    });

    // Wire add/delete after render
    setTimeout(() => {
        // Add bucket
        const addBtn = document.getElementById('btnAddBucket');
        const addInput = document.getElementById('newBucketName');
        const addBucket = async () => {
            const name = addInput.value.trim();
            if (!name) return;
            const newBucket = await TimeWhereDB.addBucket({
                plan_id: planId,
                name,
                sort_order: buckets.length
            });
            buckets.push(newBucket);
            document.getElementById('manageBucketList').innerHTML = renderBucketList();
            addInput.value = '';
            wireDeleteHandlers();
        };

        if (addBtn) addBtn.addEventListener('click', addBucket);
        if (addInput) addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBucket(); });

        wireDeleteHandlers();
    }, 50);

    function wireDeleteHandlers() {
        document.querySelectorAll('#manageBucketList .manage-item-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.bucketId);
                await TimeWhereDB.deleteBucket(id);
                const idx = buckets.findIndex(b => b.id === id);
                if (idx >= 0) buckets.splice(idx, 1);
                document.getElementById('manageBucketList').innerHTML = renderBucketList();
                wireDeleteHandlers();
            });
        });
    }
}

// ========== Manage Labels Dialog ==========

const LABEL_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#78716c'
];

async function showManageLabelsDialog(planId) {
    const labels = await TimeWhereDB.getLabelsByPlan(planId);

    function renderLabelList() {
        return labels.map(l => `
            <div class="manage-item" data-label-id="${l.id}">
                <span class="label-color-dot" style="background:${l.color}"></span>
                <input type="text" class="manage-item-name" value="${escapeHTML(l.name || '')}" data-label-id="${l.id}" placeholder="Label name">
                <button class="manage-item-delete" data-label-id="${l.id}" title="Delete">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        `).join('');
    }

    showDialog({
        title: 'Manage labels',
        content: `
            <div class="manage-list" id="manageLabelList">${renderLabelList()}</div>
            <div class="manage-add">
                <div class="label-add-row">
                    <div class="color-picker-small" id="newLabelColorPicker">
                        ${LABEL_COLORS.map((c, i) => `
                            <button class="color-option-small ${i === 0 ? 'selected' : ''}" data-color="${c}" style="background:${c}"></button>
                        `).join('')}
                    </div>
                    <input type="text" id="newLabelName" class="dialog-input" placeholder="Label name...">
                    <button class="btn-dialog btn-dialog-confirm" id="btnAddLabel">Add</button>
                </div>
            </div>`,
        confirmText: 'Done',
        onConfirm: async () => {
            const nameInputs = document.querySelectorAll('#manageLabelList .manage-item-name');
            for (const input of nameInputs) {
                const id = parseInt(input.dataset.labelId);
                const name = input.value.trim();
                await TimeWhereDB.updateLabel(id, { name });
            }
            await TaskApp.refresh();
            return true;
        }
    });

    setTimeout(() => {
        // Color picker for new label
        const picker = document.getElementById('newLabelColorPicker');
        if (picker) {
            picker.addEventListener('click', (e) => {
                const btn = e.target.closest('.color-option-small');
                if (!btn) return;
                picker.querySelectorAll('.color-option-small').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        }

        // Add label
        const addBtn = document.getElementById('btnAddLabel');
        const addInput = document.getElementById('newLabelName');
        const addLabel = async () => {
            const name = addInput.value.trim();
            const colorEl = document.querySelector('#newLabelColorPicker .color-option-small.selected');
            const color = colorEl ? colorEl.dataset.color : LABEL_COLORS[0];

            const newLabel = await TimeWhereDB.addLabel({ plan_id: planId, color, name });
            labels.push(newLabel);
            document.getElementById('manageLabelList').innerHTML = renderLabelList();
            addInput.value = '';
            wireLabelDeleteHandlers();
        };

        if (addBtn) addBtn.addEventListener('click', addLabel);
        if (addInput) addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLabel(); });

        wireLabelDeleteHandlers();
    }, 50);

    function wireLabelDeleteHandlers() {
        document.querySelectorAll('#manageLabelList .manage-item-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.labelId);
                await TimeWhereDB.deleteLabel(id);
                const idx = labels.findIndex(l => l.id === id);
                if (idx >= 0) labels.splice(idx, 1);
                document.getElementById('manageLabelList').innerHTML = renderLabelList();
                wireLabelDeleteHandlers();
            });
        });
    }
}

// ========== Filter Panel ==========

function showFilterPanel() {
    const btn = document.getElementById('btnFilter');
    if (!btn) return;

    // Close if already open
    const existing = document.querySelector('.filter-panel');
    if (existing) { existing.remove(); return; }

    const buckets = TaskApp.currentPlanBuckets;
    const labels = TaskApp.currentPlanLabels;
    const filters = TaskApp.filters;

    const priorityOptions = ['urgent', 'important', 'medium', 'low'].map(p => {
        const cfg = PRIORITY_CONFIG[p];
        const checked = filters.priority.includes(p) ? 'checked' : '';
        return `<label class="filter-checkbox"><input type="checkbox" data-filter="priority" value="${p}" ${checked}> <span style="color:${cfg.color}">${cfg.label}</span></label>`;
    }).join('');

    const progressOptions = ['not_started', 'in_progress', 'completed'].map(p => {
        const labels = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };
        const checked = filters.progress.includes(p) ? 'checked' : '';
        return `<label class="filter-checkbox"><input type="checkbox" data-filter="progress" value="${p}" ${checked}> ${labels[p]}</label>`;
    }).join('');

    const bucketOptions = [
        `<option value="">All buckets</option>`,
        ...buckets.map(b => `<option value="${b.id}" ${filters.bucket_id === b.id ? 'selected' : ''}>${escapeHTML(b.name)}</option>`)
    ].join('');

    const labelChips = labels.map(l => {
        const isSelected = filters.labels.includes(l.id);
        return `<button class="filter-label-chip ${isSelected ? 'selected' : ''}" data-label-id="${l.id}" style="--label-color:${l.color}">
            ${escapeHTML(l.name || l.color)}
        </button>`;
    }).join('');

    const rect = btn.getBoundingClientRect();
    const panel = document.createElement('div');
    panel.className = 'filter-panel';
    panel.innerHTML = `
        <div class="filter-section">
            <h4>Priority</h4>
            ${priorityOptions}
        </div>
        <div class="filter-section">
            <h4>Progress</h4>
            ${progressOptions}
        </div>
        <div class="filter-section">
            <h4>Bucket</h4>
            <select class="filter-select" id="filterBucket">${bucketOptions}</select>
        </div>
        ${labels.length > 0 ? `
        <div class="filter-section">
            <h4>Labels</h4>
            <div class="filter-labels">${labelChips}</div>
        </div>` : ''}
        <div class="filter-actions">
            <button class="btn-dialog btn-dialog-cancel" id="filterClear">Clear all</button>
            <button class="btn-dialog btn-dialog-confirm" id="filterApply">Apply</button>
        </div>`;

    panel.style.top = rect.bottom + 4 + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    document.body.appendChild(panel);

    // Label chip toggle
    panel.querySelectorAll('.filter-label-chip').forEach(chip => {
        chip.addEventListener('click', () => chip.classList.toggle('selected'));
    });

    // Apply
    panel.querySelector('#filterApply').addEventListener('click', async () => {
        // Read priority checkboxes
        TaskApp.filters.priority = Array.from(panel.querySelectorAll('[data-filter="priority"]:checked')).map(cb => cb.value);
        // Read progress checkboxes
        TaskApp.filters.progress = Array.from(panel.querySelectorAll('[data-filter="progress"]:checked')).map(cb => cb.value);
        // Read bucket
        const bucketVal = panel.querySelector('#filterBucket').value;
        TaskApp.filters.bucket_id = bucketVal ? parseInt(bucketVal) : null;
        // Read labels
        TaskApp.filters.labels = Array.from(panel.querySelectorAll('.filter-label-chip.selected')).map(c => parseInt(c.dataset.labelId));
        TaskApp.focusedGroupKey = null;

        panel.remove();
        await TaskApp.saveCurrentViewPreferences();
        TaskApp.renderBoard();
    });

    // Clear
    panel.querySelector('#filterClear').addEventListener('click', async () => {
        TaskApp.clearFilters();
        panel.remove();
        await TaskApp.saveCurrentViewPreferences();
        TaskApp.renderBoard();
    });

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function handler(e) {
            if (!e.target.closest('.filter-panel') && !e.target.closest('#btnFilter')) {
                panel.remove();
                document.removeEventListener('click', handler);
            }
        });
    }, 10);
}

// ========== Group By Menu ==========

function showGroupByMenu() {
    const btn = document.getElementById('btnGroupBy');
    if (!btn) return;

    // Close if already open
    const existing = document.querySelector('.groupby-menu');
    if (existing) { existing.remove(); return; }

    normalizeTaskBoardGroupBy();
    const options = Object.entries(GROUP_BY_CONFIG)
        .filter(([key]) => key !== 'bucket' || isBucketGroupingAllowed())
        .map(([key, cfg]) => {
        const isActive = TaskApp.groupBy === key;
        return `<button class="groupby-option ${isActive ? 'active' : ''}" data-groupby="${key}">${cfg.label}</button>`;
    }).join('');

    const rect = btn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'groupby-menu';
    menu.innerHTML = options;
    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';
    document.body.appendChild(menu);

    menu.addEventListener('click', async (e) => {
        const opt = e.target.closest('.groupby-option');
        if (!opt) return;
        if (opt.dataset.groupby === 'bucket' && !isBucketGroupingAllowed()) return;
        TaskApp.groupBy = opt.dataset.groupby;
        TaskApp.focusedGroupKey = null;
        menu.remove();
        await TaskApp.saveCurrentViewPreferences();
        TaskApp.renderBoard();
    });

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function handler(e) {
            if (!e.target.closest('.groupby-menu') && !e.target.closest('#btnGroupBy')) {
                menu.remove();
                document.removeEventListener('click', handler);
            }
        });
    }, 10);
}

