/**
 * script.js — Entry point for the Task Module (Planner)
 * Loaded last: initializes app and sets up event delegation.
 */

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Init default settings
        await TimeWhereDB.initDefaultSettings();
        globalThis.TimeWhereGoogleSyncStatusUI?.init?.();

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
            await TaskApp.loadMyTasks();
        }

        // Render everything
        TaskApp.renderAll();
        showNoPlanState(false);
        if (initialTaskId) {
            updateSidebarActiveState('my_tasks');
            openDetailPanel(initialTaskId);
        } else {
            updateSidebarActiveState('my_tasks');
        }
        runPlannerTaskArrangeCheck();
        runGoogleSyncCheck();
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
                refreshManageBacPendingCount();
                return;
            }
        });
    }

    // ========== Event Delegation: Kanban Board ==========
    const kanbanBoard = document.getElementById('kanbanBoard');
    if (kanbanBoard) {
        kanbanBoard.addEventListener('click', async (e) => {
            const taskMenuBtn = e.target.closest('.task-card-menu-btn');
            if (taskMenuBtn) {
                e.preventDefault();
                e.stopPropagation();
                showTaskActionMenu(taskMenuBtn);
                return;
            }

            // Progress toggle button
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

            const groupFocusTarget = e.target.closest('[data-group-focus-target]');
            if (groupFocusTarget) {
                e.preventDefault();
                const column = groupFocusTarget.closest('.kanban-column');
                const groupKey = column?.dataset?.columnKey || null;
                if (groupKey && TaskApp.focusedGroupKey !== groupKey) {
                    TaskApp.focusedGroupKey = groupKey;
                    TaskApp.renderBoard();
                }
                return;
            }
        });
    }

    document.addEventListener('click', async (e) => {
        const taskMenuBtn = e.target.closest('.task-detail-menu-btn');
        if (taskMenuBtn) {
            e.preventDefault();
            e.stopPropagation();
            showTaskActionMenu(taskMenuBtn);
            return;
        }

        const taskMenuAction = e.target.closest('[data-task-menu-action]');
        if (taskMenuAction) {
            e.preventDefault();
            e.stopPropagation();
            const taskId = taskMenuAction.dataset.taskId;
            const actionRect = taskMenuAction.getBoundingClientRect();
            closeTaskActionMenu();
            if (taskMenuAction.dataset.taskMenuAction === 'copy') {
                await showCopyTaskDialog(taskId);
            } else if (taskMenuAction.dataset.taskMenuAction === 'partial-complete') {
                await openPartialCompleteDialog(taskId, actionRect);
            }
            return;
        }

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
            const row = e.target.closest('.task-list-row');
            if (row) {
                const taskId = row.dataset.taskId;
                openDetailPanel(taskId);
                return;
            }
        });
    }

    // ========== Event Delegation: Calendar View ==========
    const calendarView = document.getElementById('taskCalendarView');
    if (calendarView) {
        calendarView.addEventListener('click', (e) => {
            const item = e.target.closest('.task-calendar-item');
            if (!item) return;
            const taskId = item.dataset.taskId;
            openDetailPanel(taskId);
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

    const debugSnapshotBtn = document.getElementById('btnCopyPlannerDebugSnapshot');
    if (debugSnapshotBtn) {
        debugSnapshotBtn.addEventListener('click', () => {
            copyPlannerDebugSnapshot(debugSnapshotBtn);
        });
    }

    // View tabs
    document.querySelectorAll('.btn-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.btn-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            TaskApp.currentView = tab.dataset.view;
            TaskApp.focusedGroupKey = null;
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

function runGoogleSyncCheck() {
    if (typeof TimeWhereGoogleSync === 'undefined' || typeof TimeWhereDB === 'undefined') return;
    TimeWhereGoogleSync.runPageAutoSync(TimeWhereDB).catch(error => {
        console.warn('Google auto sync check failed:', error);
    }).finally(() => {
        globalThis.TimeWhereGoogleSyncStatusUI?.refreshAll?.();
    });
}

async function runPlannerTaskArrangeCheck() {
    if (!window.TimeWhereTaskArrangeAuto?.runTaskArrangeAutoReview || !window.TimeWhereDB) return;
    try {
        const result = await TimeWhereTaskArrangeAuto.runTaskArrangeAutoReview(TimeWhereDB, { source: 'planner_auto' });
        if (result?.ran && !result.no_changes) {
            await TaskApp.refresh();
        }
    } catch (error) {
        console.warn('[Tasks] Task Arrange check skipped:', error);
    }
}

// ========== Planner Diagnostics ==========

function sanitizePlannerTask(task) {
    if (!task) return null;
    return {
        id: task.id || null,
        title: task.title || '',
        progress: task.progress || null,
        status: task.status || null,
        priority: task.priority || null,
        plan_id: task.plan_id ?? null,
        bucket_id: task.bucket_id ?? null,
        start_date: task.start_date || null,
        arranged_date: task.arranged_date || null,
        due_date: task.due_date || task.deadline || null,
        schedule_time: task.schedule_time || null,
        duration: task.duration ?? null,
        source: task.source || task.source_type || null,
        subject: task.subject || null,
        subject_in_matrixview: task.subject_in_matrixview || null,
        managebac_subject: task.managebac_subject || null,
        readonly: task.readonly === true,
        has_source_url: Boolean(task.source_url),
        checklist_count: Array.isArray(task.checklist) ? task.checklist.length : 0,
        checklist_checked_count: Array.isArray(task.checklist)
            ? task.checklist.filter(item => item && item.checked === true).length
            : 0,
        recurrence_series_id: task.recurrence_series_id || null,
        recurrence_index: task.recurrence_index || null,
        recurrence_count: task.recurrence_count || null,
        recurrence_frequency: task.recurrence_frequency || null
    };
}

function sanitizePlannerPlan(plan) {
    if (!plan) return null;
    return {
        id: plan.id ?? null,
        name: plan.name || '',
        subject: plan.subject || null,
        subject_in_matrixview: plan.subject_in_matrixview || null,
        subject_active: plan.subject ? plan.subject_active !== false : null,
        matrixview_managed: plan.matrixview_managed === true,
        source: plan.source || null
    };
}

function sanitizePlannerBucket(bucket) {
    if (!bucket) return null;
    return {
        id: bucket.id ?? null,
        plan_id: bucket.plan_id ?? null,
        name: bucket.name || '',
        sort_order: bucket.sort_order ?? null
    };
}

function sanitizePlannerLabel(label) {
    if (!label) return null;
    return {
        id: label.id ?? null,
        plan_id: label.plan_id ?? null,
        name: label.name || '',
        color: label.color || null
    };
}

function sanitizePlannerEvent(event) {
    if (!event) return null;
    return {
        id: event.id || null,
        title: event.title || event.name || '',
        source: event.source || null,
        type: event.type || null,
        date: event.date || null,
        time_start: event.time_start || null,
        time_end: event.time_end || null,
        subject: event.subject || null,
        subject_in_matrixview: event.subject_in_matrixview || null,
        repeat: event.repeat || null,
        repeat_days: Array.isArray(event.repeat_days) ? event.repeat_days : null
    };
}

function sanitizePlannerArrangeChange(change) {
    if (!change) return null;
    const task = change.task || {};
    return {
        task_id: change.task_id || null,
        title: change.title || task.title || '',
        source: change.source || task.source || task.source_type || null,
        old_start_date: change.old_start_date || task.start_date || null,
        new_start_date: change.new_start_date || change.start_date || task.start_date || null,
        old_arranged_date: change.old_arranged_date || task.arranged_date || null,
        new_arranged_date: change.new_arranged_date || change.arranged_date || null,
        old_priority: change.old_priority || task.priority || null,
        new_priority: change.new_priority || change.priority || null,
        updates: {
            start_date: change.updates?.start_date || null,
            arranged_date: change.updates?.arranged_date || null,
            priority: change.updates?.priority || null
        }
    };
}

function sanitizePlannerSettings(settings = {}) {
    const matrixMappings = Array.isArray(settings.matrixview_subject_mappings)
        ? settings.matrixview_subject_mappings.map(mapping => ({
            plan_name: mapping.plan_name || null,
            subject: mapping.subject || null,
            subject_in_matrixview: mapping.subject_in_matrixview || null,
            source: mapping.source || null,
            updated_at: mapping.updated_at || null
        }))
        : [];
    return {
        task_arrange_dirty_at: settings.task_arrange_dirty_at || null,
        task_arrange_last_checked_at: settings.task_arrange_last_checked_at || null,
        task_arrange_last_run_at: settings.task_arrange_last_run_at || null,
        matrixview_subject_mappings: matrixMappings,
        managebac_pending_event_count: Array.isArray(settings.managebac_pending_event_mappings)
            ? settings.managebac_pending_event_mappings.length
            : 0,
        task_board_preferences: settings.task_board_preferences || null
    };
}

function getPlannerDomSnapshot() {
    const cards = Array.from(document.querySelectorAll('.task-card')).slice(0, 20).map(card => ({
        task_id: card.dataset.taskId || null,
        class_name: card.className || '',
        text: (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180)
    }));
    const rows = Array.from(document.querySelectorAll('.task-list-row')).slice(0, 20).map(row => ({
        task_id: row.dataset.taskId || null,
        class_name: row.className || '',
        text: (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180)
    }));
    const calendarItems = Array.from(document.querySelectorAll('.task-calendar-item')).slice(0, 20).map(item => ({
        task_id: item.dataset.taskId || null,
        class_name: item.className || '',
        text: (item.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    }));
    return {
        current_plan_title: document.querySelector('.bc-current')?.textContent?.trim() || '',
        visible_task_cards: cards,
        visible_list_rows: rows,
        visible_calendar_items: calendarItems
    };
}

async function buildPlannerDebugSnapshot() {
    const now = new Date();
    const [allTasks, plans, events, settings] = await Promise.all([
        TimeWhereDB.getAllTasks(),
        TimeWhereDB.getPlans(),
        typeof TimeWhereDB.getEvents === 'function' ? TimeWhereDB.getEvents() : Promise.resolve([]),
        typeof TimeWhereDB.getSettings === 'function' ? TimeWhereDB.getSettings() : Promise.resolve({})
    ]);
    const buckets = [];
    const labels = [];
    for (const plan of plans || []) {
        const [planBuckets, planLabels] = await Promise.all([
            TimeWhereDB.getBucketsByPlan(plan.id),
            TimeWhereDB.getLabelsByPlan(plan.id)
        ]);
        buckets.push(...(planBuckets || []));
        labels.push(...(planLabels || []));
    }

    let arrangePreview = null;
    if (window.TimeWhereScheduling?.arrangeTasks) {
        try {
            const preview = await TimeWhereScheduling.arrangeTasks(TimeWhereDB, now, { apply: false });
            arrangePreview = {
                proposed: preview.proposed || 0,
                summary: preview.summary || null,
                changes: (preview.changes || []).map(sanitizePlannerArrangeChange)
            };
        } catch (error) {
            arrangePreview = { error: error.message || String(error) };
        }
    }

    return {
        schema: 'timewhere-planner-debug-v1',
        generated_at: now.toISOString(),
        page: {
            url: window.location.href,
            title: document.title,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            today: typeof formatDateISO === 'function' ? formatDateISO(now) : now.toISOString().slice(0, 10),
            now_local: now.toString()
        },
        state: {
            view_mode: TaskApp.viewMode,
            current_view: TaskApp.currentView,
            current_plan_id: TaskApp.currentPlanId,
            group_by: TaskApp.groupBy,
            search_query: TaskApp.searchQuery,
            filters: TaskApp.filters,
            selected_task_id: TaskApp.selectedTaskId,
            current_plan_task_count: TaskApp.currentPlanTasks.length,
            filtered_task_count: TaskApp.getFilteredTasks().length
        },
        counts: {
            all_tasks: allTasks.length,
            current_tasks: TaskApp.currentPlanTasks.length,
            filtered_tasks: TaskApp.getFilteredTasks().length,
            plans: plans.length,
            buckets: buckets.length,
            labels: labels.length,
            events: events.length,
            timetable_events: events.filter(event => event.source === 'timetable').length
        },
        plans: plans.map(sanitizePlannerPlan),
        buckets: buckets.map(sanitizePlannerBucket),
        labels: labels.map(sanitizePlannerLabel),
        current_tasks: TaskApp.currentPlanTasks.map(sanitizePlannerTask),
        filtered_tasks: TaskApp.getFilteredTasks().map(sanitizePlannerTask),
        all_tasks: allTasks.map(sanitizePlannerTask),
        events: events.map(sanitizePlannerEvent),
        settings: sanitizePlannerSettings(settings),
        arrange_preview: arrangePreview,
        dom: getPlannerDomSnapshot()
    };
}

async function copyPlannerDebugSnapshot(button = null) {
    try {
        if (button) button.disabled = true;
        const snapshot = await buildPlannerDebugSnapshot();
        const text = JSON.stringify(snapshot, null, 2);
        await navigator.clipboard.writeText(text);
        showToast('Plan 诊断快照已复制，可直接粘贴给我', 'success');
    } catch (error) {
        console.error('[Tasks] debug snapshot failed:', error);
        showToast(`复制诊断快照失败：${error.message}`, 'error');
    } finally {
        if (button) button.disabled = false;
    }
}

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
    const list = document.getElementById('taskListView');
    const calendar = document.getElementById('taskCalendarView');
    const header = document.querySelector('.board-header');
    const tabs = document.querySelector('.view-tabs');

    if (noPlanState) noPlanState.style.display = show ? 'flex' : 'none';
    if (board) board.style.display = show ? 'none' : '';
    if (list) list.style.display = 'none';
    if (calendar) calendar.style.display = 'none';
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
        if (pendingRows.length === 0) {
            await refreshManageBacPendingCount();
            showToast('ManageBac 没有新增任务', 'success');
            if (TaskApp.viewMode === 'my_managebac') {
                await TaskApp.loadMyManageBac();
                TaskApp.renderAll();
            }
            return;
        }
        await refreshManageBacPendingCount();

        if (openPending) {
            openManageBacPendingConfirmation();
            return;
        }
        showToast(`ManageBac 同步完成：${pendingRows.length} 个新增事件待确认。`, 'info');
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


