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

        // Fresh MVP installs should get an empty default planner, not demo coursework.
        if (TaskApp.plans.length === 0) {
            await TimeWhereDB.ensureDefaultPlan();
            await TaskApp.loadPlans();
        }

        // Load first plan
        await TaskApp.loadPlan(TaskApp.plans[0].id);

        // Render everything
        TaskApp.renderAll();
        showNoPlanState(false);
    } catch (err) {
        console.error('[Tasks] Init failed:', err);
    }

    // ========== Event Delegation: Context Sidebar ==========
    const contextSidebar = document.querySelector('.context-sidebar');
    if (contextSidebar) {
        contextSidebar.addEventListener('click', async (e) => {
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
        });
    }

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
    }
    // For plan mode, sidebar.js renderSidebar() handles active state
}
