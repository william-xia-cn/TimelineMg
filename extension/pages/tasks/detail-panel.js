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
    const sourceStartDateDisabledAttr = '';
    const sourceReadonlyTextareaAttr = isManageBacTask ? 'readonly' : '';
    const titleEditable = isManageBacTask ? 'false' : 'true';
    const planInfo = await getTaskPlanInfo(task);
    const subjectText = task.subject || planInfo.subject || planInfo.name || 'No subject';
    const manageBacSubjectText = task.managebac_subject || '';
    const isRecurringTask = !!task.recurrence_series_id;
    const recurrenceLabel = isRecurringTask
        ? `${task.recurrence_frequency === 'monthly' ? '每月' : '每周'} ${task.recurrence_index || 1}/${task.recurrence_count || '?'}`
        : '';

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
            <div class="detail-header-actions">
                <button type="button" class="task-detail-menu-btn" data-task-id="${task.id}" title="More task actions">
                    <span class="material-symbols-outlined">more_horiz</span>
                </button>
                <button class="detail-close-btn" title="Close">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
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
                    <input type="date" class="detail-date" data-field="start_date" value="${task.start_date || ''}" ${sourceStartDateDisabledAttr}>
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

            <!-- Checklist -->
            <div class="detail-field">
                <label>Checklist${task.checklist && task.checklist.length > 0 ? ` (${task.checklist.filter(i => i.checked).length}/${task.checklist.length})` : ''}</label>
                <div class="checklist-list" id="checklistItems">${checklistHTML}</div>
                <div class="checklist-add">
                    <input type="text" class="checklist-add-input" id="checklistNewItem" placeholder="Add an item..." ${sourceDisabledAttr}>
                </div>
            </div>

            ${!isManageBacTask ? `
            <div class="detail-field recurrence-detail-section" data-recurrence-section>
                <label>周期任务</label>
                ${isRecurringTask ? `
                    <div class="recurrence-series-panel">
                        <span class="recurrence-series-badge">${escapeHTML(recurrenceLabel)}</span>
                        <select class="detail-select recurrence-scope-select" data-field="recurrence_scope" aria-label="周期任务编辑范围">
                            <option value="single">本次</option>
                            <option value="future">本次及之后</option>
                            <option value="all">全部</option>
                        </select>
                    </div>
                    <div class="recurrence-resize-panel">
                        <label class="recurrence-count-label">
                            总任务数
                            <input type="number" class="recurrence-count-input" data-field="recurrence_resize_count" min="2" max="12" value="${task.recurrence_count || 2}" aria-label="周期任务总任务数">
                        </label>
                        <button type="button" class="btn-create-recurrence" data-action="resize-recurrence" disabled>更新重复次数</button>
                    </div>
                    <p class="source-readonly-hint">除完成状态外，编辑将按所选范围应用到周期任务。</p>
                ` : `
                    <div class="recurrence-create-panel">
                        <select class="detail-select" data-field="recurrence_frequency">
                            <option value="none">不重复</option>
                            <option value="weekly">每周</option>
                            <option value="monthly">每月</option>
                        </select>
                        <input type="number" class="detail-date recurrence-count-input" data-field="recurrence_count" min="2" max="12" value="2" disabled>
                        <button type="button" class="btn-create-recurrence" data-action="create-recurrence" disabled>生成周期任务</button>
                    </div>
                    <p class="source-readonly-hint">周期任务必须有截止日期，最多生成 12 个实例。</p>
                `}
            </div>` : ''}

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

    const updateTaskFromDetail = async (updates) => {
        const scope = getDetailRecurrenceScope(panel);
        if (typeof TimeWhereDB.updateRecurringTaskScope === 'function') {
            await TimeWhereDB.updateRecurringTaskScope(taskId, updates, scope);
        } else {
            await TimeWhereDB.updateTask(taskId, updates);
        }
    };

    // Close button
    panel.querySelector('.detail-close-btn')?.addEventListener('click', closeDetailPanel);

    // Title (contenteditable)
    const titleEl = panel.querySelector('.detail-title');
    if (titleEl && !isManageBacTask) {
        titleEl.addEventListener('blur', async () => {
            const newTitle = titleEl.textContent.trim();
            if (newTitle) {
                await updateTaskFromDetail({ title: newTitle });
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
            await updateTaskFromDetail({ priority: btn.dataset.priority });
            await TaskApp.refresh();
        });
    });

    // Bucket select
    const bucketSelect = panel.querySelector('[data-field="bucket_id"]');
    if (bucketSelect) {
        bucketSelect.addEventListener('change', async () => {
            if (bucketSelect.disabled || isManageBacTask) return;
            const val = bucketSelect.value;
            await updateTaskFromDetail({ bucket_id: val ? parseInt(val) : null });
            await TaskApp.refresh();
        });
    }

    // Date / time / number inputs (start_date, due_date, schedule_time, duration)
    panel.querySelectorAll('.detail-date').forEach(input => {
        const field = input.dataset.field;
        if (input.disabled || (isManageBacTask && field !== 'start_date')) return;
        input.addEventListener('change', async () => {
            let value = input.value;
            if (field === 'duration') {
                value = value ? parseInt(value, 10) : 45;
            } else {
                value = value || null;
            }
            await updateTaskFromDetail({ [field]: value });
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

            await updateTaskFromDetail({ labels });
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
                await updateTaskFromDetail({ notes: notesEl.value });
                // Don't full refresh for notes — just sync quietly
            }, 500);
        });
    }

    // Checklist: toggle item
    panel.querySelectorAll('.checklist-checkbox').forEach(cb => {
        if (cb.disabled || isManageBacTask) return;
        cb.addEventListener('change', async () => {
            const itemId = cb.closest('.checklist-item').dataset.itemId;
            const task = await TimeWhereDB.getTaskById(taskId);
            const checklist = (task.checklist || []).map(item =>
                item.id === itemId ? { ...item, checked: !item.checked } : item
            );
            await TimeWhereDB.updateChecklist(taskId, checklist);
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
            await updateTaskFromDetail({ checklist: newChecklist });
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
                await updateTaskFromDetail({ checklist: newChecklist });
                addInput.value = '';
                await TaskApp.refresh();
            }
        });
    }

    const recurrenceFrequency = panel.querySelector('[data-field="recurrence_frequency"]');
    const recurrenceCount = panel.querySelector('[data-field="recurrence_count"]');
    const createRecurrenceBtn = panel.querySelector('[data-action="create-recurrence"]');
    recurrenceFrequency?.addEventListener('change', () => {
        const enabled = ['weekly', 'monthly'].includes(recurrenceFrequency.value);
        if (recurrenceCount) recurrenceCount.disabled = !enabled;
        if (createRecurrenceBtn) createRecurrenceBtn.disabled = !enabled;
    });
    createRecurrenceBtn?.addEventListener('click', async () => {
        const frequency = recurrenceFrequency?.value || 'none';
        const count = parseInt(recurrenceCount?.value || '0', 10);
        try {
            await TimeWhereDB.createRecurringTaskSeriesFromTask(taskId, { frequency, count });
            await TaskApp.refresh();
            showToast('周期任务已生成', 'success');
            openDetailPanel(taskId);
        } catch (error) {
            showToast(error.message || '生成周期任务失败', 'error');
        }
    });

    const recurrenceResizeCount = panel.querySelector('[data-field="recurrence_resize_count"]');
    const resizeRecurrenceBtn = panel.querySelector('[data-action="resize-recurrence"]');
    const initialRecurrenceCount = parseInt(recurrenceResizeCount?.value || '0', 10);
    recurrenceResizeCount?.addEventListener('input', () => {
        const count = parseInt(recurrenceResizeCount.value || '0', 10);
        if (resizeRecurrenceBtn) {
            resizeRecurrenceBtn.disabled = count === initialRecurrenceCount || count < 2 || count > 12;
        }
    });
    resizeRecurrenceBtn?.addEventListener('click', async () => {
        const count = parseInt(recurrenceResizeCount?.value || '0', 10);
        try {
            await TimeWhereDB.resizeRecurringTaskSeries(taskId, count);
            await TaskApp.refresh();
            showToast('周期任务次数已更新', 'success');
            openDetailPanel(taskId);
        } catch (error) {
            showToast(error.message || '更新周期任务次数失败', 'error');
        }
    });

    // Delete task
    const deleteBtn = panel.querySelector('.btn-delete-task');
    if (deleteBtn && !deleteBtn.disabled && !isManageBacTask) {
        deleteBtn.addEventListener('click', async () => {
            const task = await TimeWhereDB.getTaskById(taskId);
            if (task?.recurrence_series_id) {
                showDialog({
                    title: '删除周期任务',
                    content: `
                        <p>请选择删除范围。</p>
                        <div class="recurrence-delete-options">
                            <label><input type="radio" name="recurrenceDeleteScope" value="single" checked> 删除本次</label>
                            <label><input type="radio" name="recurrenceDeleteScope" value="future"> 删除本次及之后</label>
                            <label><input type="radio" name="recurrenceDeleteScope" value="all"> 删除全部</label>
                        </div>`,
                    confirmText: '删除',
                    confirmDanger: true,
                    onConfirm: async () => {
                        const scope = document.querySelector('input[name="recurrenceDeleteScope"]:checked')?.value || 'single';
                        await TimeWhereDB.deleteRecurringTaskScope(taskId, scope);
                        closeDetailPanel();
                        await TaskApp.refresh();
                        showToast('周期任务已删除', 'success');
                        return true;
                    }
                });
                return;
            }
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

function getDetailRecurrenceScope(panel) {
    return panel?.querySelector('[data-field="recurrence_scope"]')?.value || 'single';
}

const PARTIAL_COMPLETION_RATIOS = [10, 20, 30, 50, 70, 80, 90];

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
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
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

let partialCompletePanelNeedsRefresh = false;

async function openPartialCompleteDialog(taskId, anchor = null) {
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) {
        showToast('找不到任务', 'error');
        return;
    }
    if (TimeWhereManageBac?.isManageBacTask(task)) {
        showToast('ManageBac 来源任务不能使用部分完成', 'error');
        return;
    }

    closePartialCompletePanel({ refresh: false });
    const checklist = Array.isArray(task.checklist) ? task.checklist : [];
    const partialGroup = findPartialCompletionGroup(checklist);
    const panel = document.createElement('div');
    panel.className = 'partial-complete-floating-panel';
    panel.id = 'partialCompletePanel';
    panel.dataset.taskId = String(task.id);
    panel.innerHTML = partialGroup || checklist.length === 0
        ? renderPartialCompleteRatioPanel(task, partialGroup)
        : renderPartialCompleteChecklistPanel(task, checklist);
    panel.addEventListener('click', handlePartialCompletePanelClick);
    panel.addEventListener('change', handlePartialCompletePanelChange);
    document.body.appendChild(panel);
    positionPartialCompletePanel(panel, anchor);

    setTimeout(() => {
        document.addEventListener('click', closePartialCompletePanelOnOutside);
    }, 0);
}

function renderPartialCompleteChecklistPanel(task, checklist) {
    const taskId = escapeAttribute(task.id);
    const items = checklist.map(item => `
        <label class="partial-complete-check-item">
            <input type="checkbox" data-partial-action="checklist" data-task-id="${taskId}" data-partial-checklist-id="${escapeAttribute(item.id)}" ${item.checked ? 'checked' : ''}>
            <span>${escapeHTML(item.title || '未命名清单项')}</span>
        </label>`).join('');
    return `
        <div class="partial-complete-dialog" data-mode="checklist" data-task-id="${taskId}">
            <p class="partial-complete-hint">勾选已完成的清单项，会立即保存并联动任务状态。</p>
            <div class="partial-complete-check-list">${items}</div>
        </div>`;
}

function renderPartialCompleteRatioPanel(task, partialGroup = null) {
    const taskId = escapeAttribute(task.id);
    const selectedPercent = partialGroup?.partial_percent || 50;
    const options = PARTIAL_COMPLETION_RATIOS.map(percent => `
        <button type="button" class="partial-complete-ratio-option" data-partial-action="ratio" data-task-id="${taskId}" data-percent="${percent}" aria-pressed="${percent === selectedPercent ? 'true' : 'false'}">
            ${percent}%
        </button>`).join('');
    return `
        <div class="partial-complete-dialog" data-mode="ratio" data-task-id="${taskId}">
            <p class="partial-complete-hint">选择完成比例，会立即用两条 checklist 模拟进度。</p>
            <div class="partial-complete-ratio-grid">${options}</div>
        </div>`;
}

function positionPartialCompletePanel(panel, anchor) {
    const rect = anchor && typeof anchor.getBoundingClientRect === 'function'
        ? anchor.getBoundingClientRect()
        : anchor;
    const fallback = document.querySelector(`[data-task-id="${CSS.escape(String(panel.dataset.taskId))}"]`)?.getBoundingClientRect();
    const sourceRect = rect || fallback || { top: 120, bottom: 120, left: window.innerWidth / 2 - 140 };
    const width = Math.min(320, window.innerWidth - 24);
    const left = Math.max(12, Math.min(sourceRect.left, window.innerWidth - width - 12));
    const top = Math.max(12, Math.min((sourceRect.bottom || sourceRect.top) + 6, window.innerHeight - 240));
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}

function closePartialCompletePanel(options = {}) {
    const panel = document.getElementById('partialCompletePanel');
    if (panel) panel.remove();
    document.removeEventListener('click', closePartialCompletePanelOnOutside);
    if (options.refresh !== false && partialCompletePanelNeedsRefresh) {
        partialCompletePanelNeedsRefresh = false;
        TaskApp.refresh();
    }
}

function closePartialCompletePanelOnOutside(event) {
    if (event.target.closest('#partialCompletePanel')
        || event.target.closest('[data-task-menu-action="partial-complete"]')
        || event.target.closest('.task-card-menu-btn')
        || event.target.closest('.task-detail-menu-btn')) {
        return;
    }
    closePartialCompletePanel();
}

async function handlePartialCompletePanelClick(event) {
    const ratioButton = event.target.closest('[data-partial-action="ratio"]');
    if (!ratioButton) return;
    event.preventDefault();
    event.stopPropagation();
    await savePartialCompleteRatio(ratioButton.dataset.taskId, parseInt(ratioButton.dataset.percent || '50', 10));
}

async function handlePartialCompletePanelChange(event) {
    const checkbox = event.target.closest('[data-partial-action="checklist"]');
    if (!checkbox) return;
    await savePartialCompleteChecklistItem(
        checkbox.dataset.taskId,
        checkbox.dataset.partialChecklistId,
        checkbox.checked
    );
}

async function savePartialCompleteRatio(taskId, percent) {
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) return false;
    if (TimeWhereManageBac?.isManageBacTask(task)) {
        showToast('ManageBac 来源任务不能使用部分完成', 'error');
        return false;
    }

    const currentChecklist = Array.isArray(task.checklist) ? task.checklist : [];
    const partialGroup = findPartialCompletionGroup(currentChecklist);
    const partialItems = buildPartialCompletionChecklist(percent, partialGroup);
    const nextChecklist = replacePartialCompletionChecklistGroup(currentChecklist, partialGroup, partialItems);

    await TimeWhereDB.updateChecklist(taskId, nextChecklist);
    closePartialCompletePanel({ refresh: false });
    await TaskApp.refresh();
    showToast('部分完成已更新', 'success');
    return true;
}

async function savePartialCompleteChecklistItem(taskId, checklistId, checked) {
    const task = await TimeWhereDB.getTaskById(taskId);
    if (!task) return false;
    if (TimeWhereManageBac?.isManageBacTask(task)) {
        showToast('ManageBac 来源任务不能使用部分完成', 'error');
        return false;
    }

    const nextChecklist = (task.checklist || []).map(item => ({
        ...item,
        checked: String(item.id) === String(checklistId) ? !!checked : !!item.checked
    }));
    await TimeWhereDB.updateChecklist(taskId, nextChecklist);
    partialCompletePanelNeedsRefresh = true;
    showToast('部分完成已更新', 'success');
    return true;
}

