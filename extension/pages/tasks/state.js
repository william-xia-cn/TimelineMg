/**
 * TaskApp — Global state for the Task Module (Planner)
 * Loaded after db.js, before all other task module scripts.
 */

const TASK_BOARD_PREFS_KEY = 'task_board_preferences';

function createDefaultTaskFilters() {
    return { priority: [], progress: [], labels: [], bucket_id: null };
}

function sanitizeTaskFilters(filters) {
    if (!filters || typeof filters !== 'object') return createDefaultTaskFilters();
    return {
        priority: Array.isArray(filters.priority) ? filters.priority.filter(Boolean) : [],
        progress: Array.isArray(filters.progress) ? filters.progress.filter(Boolean) : [],
        labels: Array.isArray(filters.labels) ? filters.labels.map(Number).filter(Number.isFinite) : [],
        bucket_id: Number.isFinite(filters.bucket_id) ? filters.bucket_id : null
    };
}

function sanitizeTaskGroupBy(groupBy, fallback) {
    const valid = ['due_date', 'bucket', 'priority', 'progress', 'labels'];
    return valid.includes(groupBy) ? groupBy : fallback;
}

window.TaskApp = {
    // --- Current UI state ---
    currentPlanId: null,
    currentView: 'board',          // 'board' | 'list' | 'calendar'
    viewMode: 'plan',              // 'plan' | 'my_day' | 'my_tasks' | 'my_managebac'
    groupBy: 'due_date',           // 'due_date' | 'bucket' | 'priority' | 'progress' | 'labels'
    focusedGroupKey: null,
    loadRevision: 0,
    selectedTaskId: null,
    searchQuery: '',
    filters: createDefaultTaskFilters(),
    preferences: { views: {} },

    // --- Cached data (loaded from DB) ---
    plans: [],
    currentPlanBuckets: [],
    currentPlanLabels: [],
    currentPlanTasks: [],

    // --- Data loading ---
    async loadPlans() {
        this.plans = await TimeWhereDB.getPlans();
        return this.plans;
    },

    async loadPreferences() {
        const saved = await TimeWhereDB.getSetting(TASK_BOARD_PREFS_KEY);
        this.preferences = saved && typeof saved === 'object' ? saved : { views: {} };
        if (!this.preferences.views || typeof this.preferences.views !== 'object') {
            this.preferences.views = {};
        }
        return this.preferences;
    },

    getPreferenceKey(viewMode = this.viewMode, planId = this.currentPlanId) {
        return viewMode === 'plan' && planId ? `plan:${planId}` : viewMode;
    },

    getDefaultGroupBy(viewMode = this.viewMode) {
        if (viewMode === 'my_day') return 'progress';
        return 'due_date';
    },

    applySavedViewPreferences(viewMode = this.viewMode, planId = this.currentPlanId) {
        const key = this.getPreferenceKey(viewMode, planId);
        const saved = this.preferences.views[key] || {};
        this.groupBy = sanitizeTaskGroupBy(saved.groupBy, this.getDefaultGroupBy(viewMode));
        if (viewMode !== 'plan' && this.groupBy === 'bucket') {
            this.groupBy = this.getDefaultGroupBy(viewMode);
        }
        this.filters = sanitizeTaskFilters(saved.filters);
    },

    async saveCurrentViewPreferences() {
        if (!this.preferences.views) this.preferences.views = {};
        const key = this.getPreferenceKey();
        this.preferences.views[key] = {
            groupBy: this.groupBy,
            filters: sanitizeTaskFilters(this.filters)
        };
        await TimeWhereDB.setSetting(TASK_BOARD_PREFS_KEY, this.preferences);
    },

    resolvePlanId(planId) {
        const plan = (this.plans || []).find(item => String(item.id) === String(planId));
        return plan ? plan.id : planId;
    },

    clearTransientSearch() {
        this.searchQuery = '';
        const searchInput = typeof document !== 'undefined' ? document.getElementById('searchInput') : null;
        if (searchInput) searchInput.value = '';
    },

    async loadPlan(planId) {
        const resolvedPlanId = this.resolvePlanId(planId);
        const loadRevision = ++this.loadRevision;
        this.focusedGroupKey = null;
        this.clearTransientSearch();
        this.currentPlanId = resolvedPlanId;
        this.viewMode = 'plan';
        const [buckets, labels, tasks] = await Promise.all([
            TimeWhereDB.getBucketsByPlan(resolvedPlanId),
            TimeWhereDB.getLabelsByPlan(resolvedPlanId),
            TimeWhereDB.getTasksByPlan(resolvedPlanId)
        ]);
        if (loadRevision !== this.loadRevision || this.viewMode !== 'plan' || String(this.currentPlanId) !== String(resolvedPlanId)) {
            return false;
        }
        this.currentPlanBuckets = buckets;
        this.currentPlanLabels = labels;
        this.currentPlanTasks = tasks;
        this.applySavedViewPreferences('plan', resolvedPlanId);
        return true;
    },

    async loadMyDay() {
        const loadRevision = ++this.loadRevision;
        this.focusedGroupKey = null;
        this.clearTransientSearch();
        this.viewMode = 'my_day';
        this.currentPlanId = null;

        // Gather all buckets and labels across all plans for display
        const allBuckets = [];
        const allLabels = [];
        for (const plan of this.plans) {
            const [b, l] = await Promise.all([
                TimeWhereDB.getBucketsByPlan(plan.id),
                TimeWhereDB.getLabelsByPlan(plan.id)
            ]);
            allBuckets.push(...b);
            allLabels.push(...l);
        }
        if (loadRevision !== this.loadRevision || this.viewMode !== 'my_day') return false;
        this.currentPlanBuckets = allBuckets;
        this.currentPlanLabels = allLabels;

        // Load all tasks, filter to today + overdue
        const allTasks = await TimeWhereDB.getAllTasks();
        if (loadRevision !== this.loadRevision || this.viewMode !== 'my_day') return false;
        const today = new Date();
        const todayStr = formatDateISO(today);

        this.currentPlanTasks = allTasks.filter(t => {
            if (t.progress === 'completed') return false; // Hide completed in My Day
            if (!t.due_date) return false;
            return t.due_date <= todayStr; // Today + overdue
        });
        this.applySavedViewPreferences('my_day');
        return true;
    },

    async loadMyTasks() {
        const loadRevision = ++this.loadRevision;
        this.focusedGroupKey = null;
        this.clearTransientSearch();
        this.viewMode = 'my_tasks';
        this.currentPlanId = null;

        // Gather all buckets and labels
        const allBuckets = [];
        const allLabels = [];
        for (const plan of this.plans) {
            const [b, l] = await Promise.all([
                TimeWhereDB.getBucketsByPlan(plan.id),
                TimeWhereDB.getLabelsByPlan(plan.id)
            ]);
            allBuckets.push(...b);
            allLabels.push(...l);
        }
        if (loadRevision !== this.loadRevision || this.viewMode !== 'my_tasks') return false;
        this.currentPlanBuckets = allBuckets;
        this.currentPlanLabels = allLabels;

        // All tasks from all plans
        const allTasks = await TimeWhereDB.getAllTasks();
        if (loadRevision !== this.loadRevision || this.viewMode !== 'my_tasks') return false;
        this.currentPlanTasks = allTasks;
        this.applySavedViewPreferences('my_tasks');
        return true;
    },

    async loadMyManageBac() {
        const loadRevision = ++this.loadRevision;
        this.focusedGroupKey = null;
        this.clearTransientSearch();
        this.viewMode = 'my_managebac';
        this.currentPlanId = null;

        const allBuckets = [];
        const allLabels = [];
        for (const plan of this.plans) {
            const [b, l] = await Promise.all([
                TimeWhereDB.getBucketsByPlan(plan.id),
                TimeWhereDB.getLabelsByPlan(plan.id)
            ]);
            allBuckets.push(...b);
            allLabels.push(...l);
        }
        if (loadRevision !== this.loadRevision || this.viewMode !== 'my_managebac') return false;
        this.currentPlanBuckets = allBuckets;
        this.currentPlanLabels = allLabels;

        const allTasks = await TimeWhereDB.getAllTasks();
        if (loadRevision !== this.loadRevision || this.viewMode !== 'my_managebac') return false;
        this.currentPlanTasks = TimeWhereManageBac.filterManageBacTasks(allTasks);
        this.applySavedViewPreferences('my_managebac');
        return true;
    },

    async refresh() {
        let loaded = true;
        if (this.viewMode === 'my_day') {
            loaded = await this.loadMyDay();
        } else if (this.viewMode === 'my_tasks') {
            loaded = await this.loadMyTasks();
        } else if (this.viewMode === 'my_managebac') {
            loaded = await this.loadMyManageBac();
        } else if (this.currentPlanId) {
            loaded = await this.loadPlan(this.currentPlanId);
        }
        if (loaded === false) return false;
        await this.loadPlans();
        this.renderAll();
        return true;
    },

    // --- Filtering ---
    getFilteredTasks() {
        let tasks = [...this.currentPlanTasks];

        // Search
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            tasks = tasks.filter(t =>
                (t.title && t.title.toLowerCase().includes(q)) ||
                (t.notes && t.notes.toLowerCase().includes(q))
            );
        }

        // Filter by priority
        if (this.filters.priority.length > 0) {
            tasks = tasks.filter(t => this.filters.priority.includes(t.priority));
        }

        // Filter by progress
        if (this.filters.progress.length > 0) {
            tasks = tasks.filter(t => this.filters.progress.includes(t.progress));
        }

        // Filter by labels (task has ANY of the selected labels)
        if (this.filters.labels.length > 0) {
            tasks = tasks.filter(t =>
                t.labels && t.labels.some(lid => this.filters.labels.includes(lid))
            );
        }

        // Filter by bucket
        if (this.filters.bucket_id !== null) {
            tasks = tasks.filter(t => t.bucket_id === this.filters.bucket_id);
        }

        return tasks;
    },

    hasActiveFilters() {
        return this.searchQuery !== '' ||
            this.filters.priority.length > 0 ||
            this.filters.progress.length > 0 ||
            this.filters.labels.length > 0 ||
            this.filters.bucket_id !== null;
    },

    clearFilters() {
        this.searchQuery = '';
        this.filters = createDefaultTaskFilters();
        this.focusedGroupKey = null;
    },

    // --- Render triggers (implemented by other modules) ---
    renderAll() {
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof renderBoard === 'function') renderBoard();
        if (typeof updateManageBacSyncEntry === 'function') updateManageBacSyncEntry();
        if (this.selectedTaskId && typeof renderDetailPanel === 'function') {
            renderDetailPanel(this.selectedTaskId);
        }
    },

    renderBoard() {
        if (typeof renderBoard === 'function') renderBoard();
    },

    // --- Helpers ---
    getBucketName(bucketId) {
        if (!bucketId) return null;
        const b = this.currentPlanBuckets.find(b => b.id === bucketId);
        return b ? b.name : null;
    },

    getLabelInfo(labelId) {
        return this.currentPlanLabels.find(l => l.id === labelId) || null;
    },

    getCurrentPlan() {
        return this.plans.find(p => String(p.id) === String(this.currentPlanId)) || null;
    },

    getViewTitle() {
        if (this.viewMode === 'my_day') return 'My Day';
        if (this.viewMode === 'my_tasks') return 'My Tasks';
        if (this.viewMode === 'my_managebac') return 'My ManageBac';
        const plan = this.getCurrentPlan();
        return plan ? plan.name : 'Tasks';
    },

    getBreadcrumbParent() {
        if (this.viewMode === 'my_day') return '';
        if (this.viewMode === 'my_tasks') return '';
        if (this.viewMode === 'my_managebac') return 'My Tasks';
        return 'My plans';
    }
};

// Helper used by state — defined in board.js but needed here for loadMyDay
// Provide a fallback if board.js hasn't loaded yet
if (typeof formatDateISO !== 'function') {
    window.formatDateISO = function(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
}

