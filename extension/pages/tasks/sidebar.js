/**
 * Sidebar — Plan list rendering, plan CRUD UI
 */

// ========== Plan Colors ==========
const PLAN_COLORS = [
    '#2b56e3', '#7c4dff', '#ef4444', '#f97316',
    '#22c55e', '#06b6d4', '#ec4899', '#8b5cf6'
];

// ========== Render Sidebar ==========

function renderSidebar() {
    const container = document.getElementById('plansList');
    if (!container) return;

    const plans = TaskApp.plans;
    let html = '';

    for (const plan of plans) {
        const isActive = plan.id === TaskApp.currentPlanId;
        const bgColor = plan.color || '#2b56e3';
        const iconChar = plan.icon_char || plan.name.charAt(0);

        html += `
            <a href="#" class="context-item plan-link ${isActive ? 'active' : ''}" data-plan-id="${plan.id}" draggable="true">
                <div class="subject-icon" style="background:${bgColor}">${escapeHTML(iconChar)}</div>
                ${escapeHTML(plan.name)}
                <button class="plan-menu-btn" data-plan-id="${plan.id}" title="Plan options">
                    <span class="material-symbols-outlined">more_horiz</span>
                </button>
            </a>`;
    }

    if (plans.length === 0) {
        html = '<p class="sidebar-empty">No plans yet. Create one!</p>';
    }

    container.innerHTML = html;
    setupPlanReorderHandlers(container);
}

// ========== Plan Selection ==========

async function selectPlan(planId) {
    await TaskApp.loadPlan(planId);
    renderSidebar();
    renderBoard();

    // Deactivate My Day / My Tasks links
    document.querySelectorAll('.context-menu .context-item').forEach(el => {
        el.classList.remove('active');
    });

    // Close detail panel if open
    if (typeof closeDetailPanel === 'function') closeDetailPanel();
}

// ========== Create Plan Dialog ==========

function showCreatePlanDialog() {
    if (typeof showDialog !== 'function') {
        console.warn('[Sidebar] showDialog not available');
        return;
    }

    showDialog({
        title: 'New plan',
        content: `
            <div class="dialog-field">
                <label>Plan name</label>
                <input type="text" id="dialogPlanName" class="dialog-input" placeholder="e.g. English HL" autofocus>
            </div>
            <div class="dialog-field">
                <label>Color</label>
                <div class="color-picker" id="dialogPlanColor">
                    ${PLAN_COLORS.map((c, i) => `
                        <button class="color-option ${i === 0 ? 'selected' : ''}" data-color="${c}" style="background:${c}"></button>
                    `).join('')}
                </div>
            </div>
            <div class="dialog-field">
                <label>Icon character</label>
                <input type="text" id="dialogPlanIcon" class="dialog-input" maxlength="2" placeholder="e.g. E">
            </div>`,
        confirmText: 'Create',
        onConfirm: async () => {
            const name = document.getElementById('dialogPlanName').value.trim();
            if (!name) return false; // prevent close

            const colorEl = document.querySelector('#dialogPlanColor .color-option.selected');
            const color = colorEl ? colorEl.dataset.color : PLAN_COLORS[0];
            const iconChar = document.getElementById('dialogPlanIcon').value.trim() || name.charAt(0);

            const plan = await TimeWhereDB.addPlan({ name, color, icon_char: iconChar });
            await TaskApp.loadPlans();
            await selectPlan(plan.id);
            showToast(`Plan "${name}" created`, 'success');
            return true;
        }
    });

    // Wire up color picker after dialog renders
    setTimeout(() => {
        const picker = document.getElementById('dialogPlanColor');
        if (picker) {
            picker.addEventListener('click', (e) => {
                const btn = e.target.closest('.color-option');
                if (!btn) return;
                picker.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        }
    }, 50);
}

// ========== Plan Context Menu ==========

function showPlanContextMenu(planId, anchorEl) {
    const plan = TaskApp.plans.find(p => p.id === planId);
    if (!plan) return;
    const planIndex = TaskApp.plans.findIndex(p => p.id === planId);
    const isFirst = planIndex <= 0;
    const isLast = planIndex === TaskApp.plans.length - 1;
    const canDeletePlan = !(plan.subject && plan.subject_active !== false);

    // Remove existing menu
    closePlanContextMenu();

    const rect = anchorEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'plan-context-menu';
    menu.innerHTML = `
        <button class="ctx-menu-item" data-action="move_top" ${isFirst ? 'disabled' : ''}><span class="material-symbols-outlined">vertical_align_top</span> Move top</button>
        <button class="ctx-menu-item" data-action="move_up" ${isFirst ? 'disabled' : ''}><span class="material-symbols-outlined">arrow_upward</span> Move up</button>
        <button class="ctx-menu-item" data-action="move_down" ${isLast ? 'disabled' : ''}><span class="material-symbols-outlined">arrow_downward</span> Move down</button>
        <button class="ctx-menu-item" data-action="move_bottom" ${isLast ? 'disabled' : ''}><span class="material-symbols-outlined">vertical_align_bottom</span> Move bottom</button>
        <div class="ctx-menu-divider"></div>
        <button class="ctx-menu-item" data-action="rename"><span class="material-symbols-outlined">edit</span> Rename</button>
        <button class="ctx-menu-item" data-action="buckets"><span class="material-symbols-outlined">view_column</span> Manage buckets</button>
        <button class="ctx-menu-item" data-action="labels"><span class="material-symbols-outlined">label</span> Manage labels</button>
        <div class="ctx-menu-divider"></div>
        <button class="ctx-menu-item ctx-menu-danger" data-action="delete" ${canDeletePlan ? '' : 'disabled title="启用学科 Plan 只能通过 MatrixView 导入更新"'}><span class="material-symbols-outlined">delete</span> Delete plan</button>`;

    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.left = rect.left + 'px';
    document.body.appendChild(menu);

    menu.addEventListener('click', async (e) => {
        const item = e.target.closest('.ctx-menu-item');
        if (!item) return;
        if (item.disabled) return;
        const action = item.dataset.action;
        closePlanContextMenu();

        switch (action) {
            case 'move_top':
                await movePlanToSidebarEdge(plan.id, 'top');
                break;
            case 'move_up':
                await movePlanInSidebar(plan.id, -1);
                break;
            case 'move_down':
                await movePlanInSidebar(plan.id, 1);
                break;
            case 'move_bottom':
                await movePlanToSidebarEdge(plan.id, 'bottom');
                break;
            case 'rename':
                showRenamePlanDialog(plan);
                break;
            case 'buckets':
                if (typeof showManageBucketsDialog === 'function') showManageBucketsDialog(plan.id);
                break;
            case 'labels':
                if (typeof showManageLabelsDialog === 'function') showManageLabelsDialog(plan.id);
                break;
            case 'delete':
                showDeletePlanDialog(plan);
                break;
        }
    });

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', closePlanContextMenuOnOutsideClick);
    }, 10);
}

function closePlanContextMenu() {
    document.querySelectorAll('.plan-context-menu').forEach(m => m.remove());
    document.removeEventListener('click', closePlanContextMenuOnOutsideClick);
}

function closePlanContextMenuOnOutsideClick(e) {
    if (!e.target.closest('.plan-context-menu')) {
        closePlanContextMenu();
    }
}

// ========== Plan Reorder ==========

function setupPlanReorderHandlers(container) {
    if (container.dataset.reorderBound === 'true') return;
    container.dataset.reorderBound = 'true';

    container.addEventListener('dragstart', (e) => {
        const link = e.target.closest('.plan-link');
        if (!link || e.target.closest('.plan-menu-btn')) {
            e.preventDefault();
            return;
        }
        link.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', link.dataset.planId);
    });

    container.addEventListener('dragover', (e) => {
        const link = e.target.closest('.plan-link');
        if (!link) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.plan-link.drag-over').forEach(el => el.classList.remove('drag-over'));
        link.classList.add('drag-over');
    });

    container.addEventListener('dragleave', (e) => {
        const link = e.target.closest('.plan-link');
        if (link) link.classList.remove('drag-over');
    });

    container.addEventListener('drop', async (e) => {
        const target = e.target.closest('.plan-link');
        const sourceId = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const targetId = target ? parseInt(target.dataset.planId, 10) : null;
        const rect = target ? target.getBoundingClientRect() : null;
        const insertAfter = rect ? e.clientY > rect.top + rect.height / 2 : false;
        clearPlanDragState();
        if (!sourceId || !targetId || sourceId === targetId) return;
        await reorderPlanNearTarget(sourceId, targetId, insertAfter);
    });

    container.addEventListener('dragend', clearPlanDragState);
}

function clearPlanDragState() {
    document.querySelectorAll('.plan-link.dragging, .plan-link.drag-over').forEach(el => {
        el.classList.remove('dragging', 'drag-over');
    });
}

async function reorderPlanNearTarget(sourceId, targetId, insertAfter = false) {
    const plans = [...TaskApp.plans];
    const sourceIndex = plans.findIndex(plan => plan.id === sourceId);
    const targetIndex = plans.findIndex(plan => plan.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const [moved] = plans.splice(sourceIndex, 1);
    const adjustedTargetIndex = plans.findIndex(plan => plan.id === targetId);
    plans.splice(adjustedTargetIndex + (insertAfter ? 1 : 0), 0, moved);
    await persistPlanOrder(plans.map(plan => plan.id));
}

async function movePlanInSidebar(planId, direction) {
    const plans = [...TaskApp.plans];
    const index = plans.findIndex(plan => plan.id === planId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= plans.length) return;
    [plans[index], plans[targetIndex]] = [plans[targetIndex], plans[index]];
    await persistPlanOrder(plans.map(plan => plan.id));
}

async function movePlanToSidebarEdge(planId, edge) {
    const plans = [...TaskApp.plans];
    const index = plans.findIndex(plan => plan.id === planId);
    if (index < 0) return;
    const [moved] = plans.splice(index, 1);
    if (edge === 'top') {
        plans.unshift(moved);
    } else {
        plans.push(moved);
    }
    await persistPlanOrder(plans.map(plan => plan.id));
}

async function persistPlanOrder(orderedIds) {
    await TimeWhereDB.reorderPlans(orderedIds);
    await TaskApp.loadPlans();
    renderSidebar();
    showToast('Plan order updated', 'success');
}

// ========== Rename Plan ==========

function showRenamePlanDialog(plan) {
    showDialog({
        title: 'Rename plan',
        content: `
            <div class="dialog-field">
                <label>Plan name</label>
                <input type="text" id="dialogPlanName" class="dialog-input" value="${escapeHTML(plan.name)}" autofocus>
            </div>`,
        confirmText: 'Save',
        onConfirm: async () => {
            const name = document.getElementById('dialogPlanName').value.trim();
            if (!name) return false;
            await TimeWhereDB.updatePlan(plan.id, { name });
            await TaskApp.refresh();
            showToast('Plan renamed', 'success');
            return true;
        }
    });
}

// ========== Delete Plan ==========

function showDeletePlanDialog(plan) {
    if (plan.subject && plan.subject_active !== false) {
        showToast('启用学科 Plan 只能通过 MatrixView 导入更新，不能手动删除。', 'error');
        return;
    }
    const subjectInactiveText = plan.subject && plan.subject_active === false
        ? '<p class="dialog-warning">这是已停用的学科 Plan。删除会同时删除该 Plan 下历史任务、Buckets 和 Labels。</p>'
        : '';
    showDialog({
        title: 'Delete plan',
        content: `<p>Delete <strong>${escapeHTML(plan.name)}</strong> and all its tasks? This cannot be undone.</p>${subjectInactiveText}`,
        confirmText: 'Delete',
        confirmDanger: true,
        onConfirm: async () => {
            await TimeWhereDB.deletePlan(plan.id);
            await TaskApp.loadPlans();

            // Select another plan or show empty
            if (TaskApp.plans.length > 0) {
                await selectPlan(TaskApp.plans[0].id);
            } else {
                TaskApp.currentPlanId = null;
                TaskApp.currentPlanTasks = [];
                TaskApp.currentPlanBuckets = [];
                TaskApp.currentPlanLabels = [];
                TaskApp.renderAll();
            }
            showToast(`Plan "${plan.name}" deleted`, 'success');
            return true;
        }
    });
}

