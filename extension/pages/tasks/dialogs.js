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
    panel.querySelector('#filterApply').addEventListener('click', () => {
        // Read priority checkboxes
        TaskApp.filters.priority = Array.from(panel.querySelectorAll('[data-filter="priority"]:checked')).map(cb => cb.value);
        // Read progress checkboxes
        TaskApp.filters.progress = Array.from(panel.querySelectorAll('[data-filter="progress"]:checked')).map(cb => cb.value);
        // Read bucket
        const bucketVal = panel.querySelector('#filterBucket').value;
        TaskApp.filters.bucket_id = bucketVal ? parseInt(bucketVal) : null;
        // Read labels
        TaskApp.filters.labels = Array.from(panel.querySelectorAll('.filter-label-chip.selected')).map(c => parseInt(c.dataset.labelId));

        panel.remove();
        TaskApp.renderBoard();
    });

    // Clear
    panel.querySelector('#filterClear').addEventListener('click', () => {
        TaskApp.clearFilters();
        panel.remove();
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

    const options = Object.entries(GROUP_BY_CONFIG).map(([key, cfg]) => {
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

    menu.addEventListener('click', (e) => {
        const opt = e.target.closest('.groupby-option');
        if (!opt) return;
        TaskApp.groupBy = opt.dataset.groupby;
        menu.remove();
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

console.log('[Dialogs] Dialogs module loaded');
