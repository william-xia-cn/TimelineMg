/**
 * script.js — Entry point for the Task Module (Planner)
 * Loaded last: initializes app and sets up event delegation.
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Tasks] Initializing...');

    try {
        // Init default settings
        await TimeWhereDB.initDefaultSettings();

        // Load all plans
        await TaskApp.loadPlans();

        // If no plans exist, seed demo data
        if (TaskApp.plans.length === 0) {
            console.log('[Tasks] No plans found, seeding demo data...');
            await seedDemoData();
            await TaskApp.loadPlans();
        }

        // Load first plan
        await TaskApp.loadPlan(TaskApp.plans[0].id);

        // Render everything
        TaskApp.renderAll();
        showNoPlanState(false);

        console.log('[Tasks] Initialized with plan:', TaskApp.getCurrentPlan()?.name);
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
            // TODO: render list view when implemented
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

// ========== Seed Demo Data ==========

async function seedDemoData() {
    const today = new Date();
    const fmt = (d) => formatDateISO(d);
    const daysFromNow = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };

    // --- Plan 1: English HL ---
    const english = await TimeWhereDB.addPlan({ name: 'English HL', color: '#3b82f6', icon_char: 'E' });

    const eBuckets = [
        await TimeWhereDB.addBucket({ plan_id: english.id, name: 'Reading', sort_order: 0 }),
        await TimeWhereDB.addBucket({ plan_id: english.id, name: 'Writing', sort_order: 1 }),
        await TimeWhereDB.addBucket({ plan_id: english.id, name: 'Listening', sort_order: 2 })
    ];

    const eLabels = [
        await TimeWhereDB.addLabel({ plan_id: english.id, color: '#ef4444', name: 'Urgent' }),
        await TimeWhereDB.addLabel({ plan_id: english.id, color: '#22c55e', name: 'Easy' }),
        await TimeWhereDB.addLabel({ plan_id: english.id, color: '#8b5cf6', name: 'IA Related' })
    ];

    const englishTasks = [
        { title: 'Read Chapter 5 - The Great Gatsby', bucket_id: eBuckets[0].id, priority: 'important', due_date: daysFromNow(0), labels: [eLabels[1].id], notes: 'Focus on symbolism and themes.', checklist: [{ id: crypto.randomUUID(), title: 'Read pages 80-120', checked: true }, { id: crypto.randomUUID(), title: 'Take notes on symbolism', checked: false }, { id: crypto.randomUUID(), title: 'Write 3 discussion questions', checked: false }] },
        { title: 'Essay Draft: Comparative Analysis', bucket_id: eBuckets[1].id, priority: 'urgent', due_date: daysFromNow(1), labels: [eLabels[0].id, eLabels[2].id], progress: 'in_progress', notes: 'Compare narrative techniques in Gatsby and 1984.' },
        { title: 'Wordly Wise Unit 7 Vocabulary', bucket_id: eBuckets[0].id, priority: 'medium', due_date: daysFromNow(3) },
        { title: 'Listening Comprehension Practice', bucket_id: eBuckets[2].id, priority: 'low', due_date: daysFromNow(5), labels: [eLabels[1].id] },
        { title: 'IO Recording - Prepare Passages', bucket_id: eBuckets[1].id, priority: 'urgent', due_date: daysFromNow(-1), labels: [eLabels[0].id, eLabels[2].id], notes: 'Select 2 passages from each text.' },
        { title: 'Grammar Worksheet - Conditionals', bucket_id: eBuckets[1].id, priority: 'low', progress: 'completed' },
        { title: 'Book Report Outline', bucket_id: eBuckets[0].id, priority: 'medium', due_date: daysFromNow(10) }
    ];

    for (const t of englishTasks) {
        await TimeWhereDB.addTask({ plan_id: english.id, ...t });
    }

    // --- Plan 2: Math AA HL ---
    const math = await TimeWhereDB.addPlan({ name: 'Math AA HL', color: '#f97316', icon_char: 'M' });

    const mBuckets = [
        await TimeWhereDB.addBucket({ plan_id: math.id, name: 'Homework', sort_order: 0 }),
        await TimeWhereDB.addBucket({ plan_id: math.id, name: 'Quiz Prep', sort_order: 1 }),
        await TimeWhereDB.addBucket({ plan_id: math.id, name: 'IA', sort_order: 2 })
    ];

    const mLabels = [
        await TimeWhereDB.addLabel({ plan_id: math.id, color: '#ef4444', name: 'Hard' }),
        await TimeWhereDB.addLabel({ plan_id: math.id, color: '#3b82f6', name: 'Calculus' }),
        await TimeWhereDB.addLabel({ plan_id: math.id, color: '#eab308', name: 'Statistics' })
    ];

    const mathTasks = [
        { title: 'Chapter 12 Exercises: Integration', bucket_id: mBuckets[0].id, priority: 'important', due_date: daysFromNow(0), labels: [mLabels[1].id], checklist: [{ id: crypto.randomUUID(), title: 'Q1-Q10 (basic)', checked: true }, { id: crypto.randomUUID(), title: 'Q11-Q15 (application)', checked: true }, { id: crypto.randomUUID(), title: 'Q16-Q20 (challenge)', checked: false }] },
        { title: 'Unit Quiz: Differential Equations', bucket_id: mBuckets[1].id, priority: 'urgent', due_date: daysFromNow(2), labels: [mLabels[0].id, mLabels[1].id] },
        { title: 'IA Draft: Data Collection', bucket_id: mBuckets[2].id, priority: 'important', due_date: daysFromNow(7), labels: [mLabels[2].id], progress: 'in_progress', notes: 'Collect 50+ data points for regression analysis.' },
        { title: 'Past Paper: May 2024 Paper 1', bucket_id: mBuckets[1].id, priority: 'medium', due_date: daysFromNow(4), labels: [mLabels[0].id] },
        { title: 'Review: Probability Distributions', bucket_id: mBuckets[0].id, priority: 'medium', labels: [mLabels[2].id] },
        { title: 'GDC Practice - TI-84 Functions', bucket_id: mBuckets[0].id, priority: 'low', due_date: daysFromNow(6) }
    ];

    for (const t of mathTasks) {
        await TimeWhereDB.addTask({ plan_id: math.id, ...t });
    }

    // --- Plan 3: Chemistry SL ---
    const chem = await TimeWhereDB.addPlan({ name: 'Chemistry SL', color: '#22c55e', icon_char: 'C' });

    const cBuckets = [
        await TimeWhereDB.addBucket({ plan_id: chem.id, name: 'Lab Work', sort_order: 0 }),
        await TimeWhereDB.addBucket({ plan_id: chem.id, name: 'Theory', sort_order: 1 }),
        await TimeWhereDB.addBucket({ plan_id: chem.id, name: 'Exam Prep', sort_order: 2 })
    ];

    const cLabels = [
        await TimeWhereDB.addLabel({ plan_id: chem.id, color: '#06b6d4', name: 'Lab Report' }),
        await TimeWhereDB.addLabel({ plan_id: chem.id, color: '#ec4899', name: 'Organic' })
    ];

    const chemTasks = [
        { title: 'Lab Report: Titration Experiment', bucket_id: cBuckets[0].id, priority: 'important', due_date: daysFromNow(1), labels: [cLabels[0].id], progress: 'in_progress', checklist: [{ id: crypto.randomUUID(), title: 'Write procedure', checked: true }, { id: crypto.randomUUID(), title: 'Record data tables', checked: true }, { id: crypto.randomUUID(), title: 'Error analysis', checked: false }, { id: crypto.randomUUID(), title: 'Conclusion', checked: false }] },
        { title: 'Read Topic 10: Organic Chemistry', bucket_id: cBuckets[1].id, priority: 'medium', due_date: daysFromNow(3), labels: [cLabels[1].id] },
        { title: 'Mock Exam Practice - Paper 2', bucket_id: cBuckets[2].id, priority: 'urgent', due_date: daysFromNow(0) },
        { title: 'Finish Stoichiometry Problem Set', bucket_id: cBuckets[1].id, priority: 'medium', due_date: daysFromNow(-2), notes: 'Mole calculations and limiting reagents.' },
        { title: 'Periodic Trends Flashcards', bucket_id: cBuckets[2].id, priority: 'low', progress: 'completed' }
    ];

    for (const t of chemTasks) {
        await TimeWhereDB.addTask({ plan_id: chem.id, ...t });
    }

    console.log('[Seed] Demo data created: 3 plans, 18 tasks');
}

// Expose for console access
window.seedDemoData = seedDemoData;
window.clearAndReseed = async function() {
    await TimeWhereDB.clearAllData();
    await seedDemoData();
    location.reload();
};

console.log('[Tasks] Script module loaded');
