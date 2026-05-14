/**
 * script.js — Entry point for the Task Module (Planner)
 * Loaded last: initializes app and sets up event delegation.
 */

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Init default settings
        await TimeWhereDB.initDefaultSettings();

        // Load all plans
        await TaskApp.loadPlans();
        await TaskApp.loadPreferences();

        // Fresh MVP installs should get an empty default planner, not demo coursework.
        if (TaskApp.plans.length === 0) {
            await TimeWhereDB.ensureDefaultPlan();
            await TaskApp.loadPlans();
        }

        const initialTaskId = getInitialTaskIdFromUrl();
        if (initialTaskId) {
            await TaskApp.loadMyTasks();
        } else {
            await TaskApp.loadPlan(TaskApp.plans[0].id);
        }

        // Render everything
        TaskApp.renderAll();
        showNoPlanState(false);
        if (initialTaskId) {
            updateSidebarActiveState('my_tasks');
            openDetailPanel(initialTaskId);
        }
        runTaskArrangeInBackground();
    } catch (err) {
        console.error('[Tasks] Init failed:', err);
    }

    // ========== Event Delegation: Context Sidebar ==========
    const contextSidebar = document.querySelector('.context-sidebar');
    if (contextSidebar) {
        contextSidebar.addEventListener('click', async (e) => {
            const pendingCountBtn = e.target.closest('#managebacPendingCountBtn');
            if (pendingCountBtn) {
                e.preventDefault();
                e.stopPropagation();
                openManageBacPendingConfirmation();
                return;
            }

            const sidebarSyncBtn = e.target.closest('#sidebarSyncManageBacBtn');
            if (sidebarSyncBtn) {
                e.preventDefault();
                e.stopPropagation();
                await syncManageBacFromSidebar({ force: true, openPending: true });
                return;
            }

            // Create plan button
            if (e.target.closest('#btnCreatePlan')) {
                e.preventDefault();
                showCreatePlanDialog();
                return;
            }

            // Plan menu button (three dots)
            const menuBtn = e.target.closest('.plan-menu-btn');
            if (menuBtn) {
                e.preventDefault();
                e.stopPropagation();
                const planId = parseInt(menuBtn.dataset.planId);
                showPlanContextMenu(planId, menuBtn);
                return;
            }

            // Plan link click
            const planLink = e.target.closest('.plan-link');
            if (planLink) {
                e.preventDefault();
                const planId = parseInt(planLink.dataset.planId);
                await selectPlan(planId);
                showNoPlanState(false);
                return;
            }

            // My Day
            if (e.target.closest('#navMyDay')) {
                e.preventDefault();
                await TaskApp.loadMyDay();
                updateSidebarActiveState('my_day');
                showNoPlanState(false);
                TaskApp.renderAll();
                if (typeof closeDetailPanel === 'function') closeDetailPanel();
                return;
            }

            // My Tasks
            if (e.target.closest('#navMyTasks')) {
                e.preventDefault();
                await TaskApp.loadMyTasks();
                updateSidebarActiveState('my_tasks');
                showNoPlanState(false);
                TaskApp.renderAll();
                if (typeof closeDetailPanel === 'function') closeDetailPanel();
                return;
            }

            // MyManageBac
            if (e.target.closest('#navMyManageBac')) {
                e.preventDefault();
                await TaskApp.loadMyManageBac();
                updateSidebarActiveState('my_managebac');
                showNoPlanState(false);
                TaskApp.renderAll();
                if (typeof closeDetailPanel === 'function') closeDetailPanel();
                checkManageBacSyncWhenOpening();
                return;
            }
        });
    }

    // ========== Event Delegation: Kanban Board ==========
    const kanbanBoard = document.getElementById('kanbanBoard');
    if (kanbanBoard) {
        kanbanBoard.addEventListener('click', async (e) => {
            // Progress toggle button
            const progressBtn = e.target.closest('.task-progress-btn');
            if (progressBtn) {
                e.stopPropagation();
                const taskId = progressBtn.dataset.taskId;
                await cycleTaskProgress(taskId);
                return;
            }

            // Task card click → open detail panel
            const card = e.target.closest('.task-card');
            if (card) {
                const taskId = card.dataset.taskId;
                openDetailPanel(taskId);
                return;
            }

            // Column add-task button
            const addBtn = e.target.closest('.col-add-task');
            if (addBtn) {
                const column = addBtn.closest('.kanban-column');
                showQuickAdd(column);
                return;
            }

            const bucketMenuBtn = e.target.closest('.bucket-menu-btn');
            if (bucketMenuBtn) {
                e.preventDefault();
                e.stopPropagation();
                showBucketColumnMenu(bucketMenuBtn);
                return;
            }
        });
    }

    document.addEventListener('click', async (e) => {
        const bucketAction = e.target.closest('[data-bucket-action]');
        if (!bucketAction) return;
        const bucketId = parseInt(bucketAction.dataset.bucketId, 10);
        if (!bucketId) return;
        if (bucketAction.dataset.bucketAction === 'rename') {
            await renameBucketColumn(bucketId);
        } else if (bucketAction.dataset.bucketAction === 'delete') {
            confirmDeleteBucketColumn(bucketId);
        }
    });

    // ========== Event Delegation: List View ==========
    const listView = document.getElementById('taskListView');
    if (listView) {
        listView.addEventListener('click', async (e) => {
            const progressBtn = e.target.closest('.task-list-progress-btn');
            if (progressBtn) {
                e.stopPropagation();
                const taskId = progressBtn.dataset.taskId;
                await cycleTaskProgress(taskId);
                return;
            }

            const row = e.target.closest('.task-list-row');
            if (row) {
                const taskId = row.dataset.taskId;
                openDetailPanel(taskId);
                return;
            }
        });
    }

    // ========== Header Actions ==========

    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                TaskApp.searchQuery = searchInput.value.trim();
                TaskApp.renderBoard();
            }, 200);
        });
    }

    // Filter button
    const filterBtn = document.getElementById('btnFilter');
    if (filterBtn) {
        filterBtn.addEventListener('click', showFilterPanel);
    }

    // Group By button
    const groupByBtn = document.getElementById('btnGroupBy');
    if (groupByBtn) {
        groupByBtn.addEventListener('click', showGroupByMenu);
    }

    // View tabs
    document.querySelectorAll('.btn-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.btn-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            TaskApp.currentView = tab.dataset.view;
            TaskApp.renderAll();
        });
    });

    // Create plan alt button (in empty state)
    const createPlanAlt = document.getElementById('btnCreatePlanAlt');
    if (createPlanAlt) {
        createPlanAlt.addEventListener('click', showCreatePlanDialog);
    }

    // ========== Global Keyboard Shortcuts ==========
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (TaskApp.selectedTaskId) {
                closeDetailPanel();
            } else {
                closeDialog();
                closePlanContextMenu();
            }
        }
    });
});

// ========== Helpers ==========

function getInitialTaskIdFromUrl() {
    try {
        return new URLSearchParams(window.location.search).get('task_id') || '';
    } catch (error) {
        return '';
    }
}

function showNoPlanState(show) {
    const noPlanState = document.getElementById('noPlanState');
    const board = document.getElementById('kanbanBoard');
    const header = document.querySelector('.board-header');
    const tabs = document.querySelector('.view-tabs');

    if (noPlanState) noPlanState.style.display = show ? 'flex' : 'none';
    if (board) board.style.display = show ? 'none' : '';
    if (header) header.style.display = show ? 'none' : '';
    if (tabs) tabs.style.display = show ? 'none' : '';
}

function updateSidebarActiveState(mode) {
    // Clear all active states in sidebar
    document.querySelectorAll('.context-sidebar .context-item').forEach(el => {
        el.classList.remove('active');
    });
    document.querySelectorAll('.plan-link').forEach(el => {
        el.classList.remove('active');
    });

    // Set active
    if (mode === 'my_day') {
        document.getElementById('navMyDay')?.classList.add('active');
    } else if (mode === 'my_tasks') {
        document.getElementById('navMyTasks')?.classList.add('active');
    } else if (mode === 'my_managebac') {
        document.getElementById('navMyManageBac')?.classList.add('active');
    }
    // For plan mode, sidebar.js renderSidebar() handles active state
}

function updateManageBacSyncEntry() {
    if (TaskApp.viewMode === 'my_managebac') {
        updateSidebarActiveState('my_managebac');
    }
    refreshManageBacPendingCount();
}

function setManageBacSidebarSyncState(inProgress) {
    const btn = document.getElementById('sidebarSyncManageBacBtn');
    if (!btn) return;
    btn.disabled = inProgress;
    btn.dataset.syncing = inProgress ? 'true' : 'false';
    btn.innerHTML = inProgress
        ? '<span class="material-symbols-outlined">sync</span> 同步中'
        : '<span class="material-symbols-outlined">sync</span> 同步';
}

async function refreshManageBacPendingCount() {
    const btn = document.getElementById('managebacPendingCountBtn');
    if (!btn || typeof TimeWhereManageBac === 'undefined') return;
    try {
        const rows = await TimeWhereManageBac.getPendingEventMappings(TimeWhereDB);
        btn.textContent = String(rows.length);
        btn.style.display = rows.length > 0 ? '' : 'none';
        btn.title = rows.length > 0 ? `${rows.length} 个 ManageBac 新事件待确认` : '';
    } catch (error) {
        console.warn('[Tasks] Failed to load ManageBac pending count:', error);
    }
}

function openManageBacPendingConfirmation() {
    window.location.href = '../settings/managebac-sync.html';
}

async function checkManageBacSyncWhenOpening() {
    try {
        await refreshManageBacPendingCount();
        const config = await TimeWhereManageBac.getManageBacIcsConfig(TimeWhereDB);
        if (!config?.link) return;
        if (TimeWhereManageBac.isManageBacSyncFresh(config, new Date(), 6)) return;
        await syncManageBacFromSidebar({ force: false, openPending: false });
    } catch (error) {
        showToast(`ManageBac 同步检查失败：${error.message}`, 'error');
    }
}

function runTaskArrangeInBackground() {
    if (!window.TimeWhereScheduling?.maybeRunTaskArrange || !window.TimeWhereDB) return;
    window.TimeWhereScheduling.maybeRunTaskArrange(TimeWhereDB)
        .then(async result => {
            if (result?.ran && result.arranged > 0) {
                await TaskApp.refresh();
            }
        })
        .catch(error => console.warn('[Tasks] Task Arrange skipped:', error));
}

async function syncManageBacFromSidebar({ force = false, openPending = false } = {}) {
    try {
        setManageBacSidebarSyncState(true);
        const config = await TimeWhereManageBac.getManageBacIcsConfig(TimeWhereDB);
        if (!config?.link) {
            showToast('请先到 Settings → Plan → ManageBac 链接保存订阅链接。', 'error');
            return;
        }
        if (!force && TimeWhereManageBac.isManageBacSyncFresh(config, new Date(), 6)) {
            await refreshManageBacPendingCount();
            return;
        }

        const icsText = await TimeWhereManageBac.fetchIcsText(config.link);
        const result = await TimeWhereManageBac.syncManageBacIcs(TimeWhereDB, icsText, config.link, { confirmLinkChange: true });
        const pendingRows = await TimeWhereManageBac.savePendingEventMappings(TimeWhereDB, result.pending_event_mappings || []);
        sessionStorage.setItem('timewhere_managebac_pending_event_mappings', JSON.stringify({
            saved_at: new Date().toISOString(),
            pending_event_mappings: pendingRows,
            status: result.status,
            events: result.events,
            created: result.created,
            updated: result.updated,
            deleted: result.deleted,
            skipped: result.skipped
        }));
        await refreshManageBacPendingCount();

        if (pendingRows.length && openPending) {
            openManageBacPendingConfirmation();
            return;
        }
        if (pendingRows.length) {
            showToast(`ManageBac 同步完成：${pendingRows.length} 个新增事件待确认。`, 'info');
        } else if (force) {
            showToast(`ManageBac 同步完成：没有新增事件；已更新 ${result.updated || 0} 个已有任务。`, 'success');
        }
        if (TaskApp.viewMode === 'my_managebac') {
            await TaskApp.loadMyManageBac();
            TaskApp.renderAll();
        }
    } catch (error) {
        showToast(`ManageBac 同步失败：${error.message}`, 'error');
    } finally {
        setManageBacSidebarSyncState(false);
    }
}
