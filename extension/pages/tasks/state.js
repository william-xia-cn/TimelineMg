/**
 * TaskApp — Global state for the Task Module (Planner)
 * Loaded after db.js, before all other task module scripts.
 */

window.TaskApp = {
    // --- Current UI state ---
    currentPlanId: null,
    currentView: 'board',          // 'board' | 'list'
    viewMode: 'plan',              // 'plan' | 'my_day' | 'my_tasks'
    groupBy: 'due_date',           // 'due_date' | 'bucket' | 'priority' | 'progress' | 'labels'
    selectedTaskId: null,
    searchQuery: '',
    filters: {
        priority: [],   // e.g. ['urgent', 'important']
        progress: [],   // e.g. ['not_started']
        labels: [],     // label IDs
        bucket_id: null // single bucket ID or null
    },

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

    async loadPlan(planId) {
        this.currentPlanId = planId;
        this.viewMode = 'plan';
        const [buckets, labels, tasks] = await Promise.all([
            TimeWhereDB.getBucketsByPlan(planId),
            TimeWhereDB.getLabelsByPlan(planId),
            TimeWhereDB.getTasksByPlan(planId)
        ]);
        this.currentPlanBuckets = buckets;
        this.currentPlanLabels = labels;
        this.currentPlanTasks = tasks;
        console.log('[TaskApp] Loaded plan', planId, ':', tasks.length, 'tasks,', buckets.length, 'buckets,', labels.length, 'labels');
    },

    async loadMyDay() {
        this.viewMode = 'my_day';
        this.currentPlanId = null;
        this.groupBy = 'progress';

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
        this.currentPlanBuckets = allBuckets;
        this.currentPlanLabels = allLabels;

        // Load all tasks, filter to today + overdue
        const allTasks = await TimeWhereDB.getAllTasks();
        const today = new Date();
        const todayStr = formatDateISO(today);

        this.currentPlanTasks = allTasks.filter(t => {
            if (t.progress === 'completed') return false; // Hide completed in My Day
            if (!t.due_date) return false;
            return t.due_date <= todayStr; // Today + overdue
        });

        console.log('[TaskApp] My Day loaded:', this.currentPlanTasks.length, 'tasks');
    },

    async loadMyTasks() {
        this.viewMode = 'my_tasks';
        this.currentPlanId = null;
        this.groupBy = 'due_date';

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
        this.currentPlanBuckets = allBuckets;
        this.currentPlanLabels = allLabels;

        // All tasks from all plans
        this.currentPlanTasks = await TimeWhereDB.getAllTasks();
        console.log('[TaskApp] My Tasks loaded:', this.currentPlanTasks.length, 'tasks');
    },

    async refresh() {
        if (this.viewMode === 'my_day') {
            await this.loadMyDay();
        } else if (this.viewMode === 'my_tasks') {
            await this.loadMyTasks();
        } else if (this.currentPlanId) {
            await this.loadPlan(this.currentPlanId);
        }
        await this.loadPlans();
        this.renderAll();
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
        this.filters = { priority: [], progress: [], labels: [], bucket_id: null };
    },

    // --- Render triggers (implemented by other modules) ---
    renderAll() {
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof renderBoard === 'function') renderBoard();
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
        return this.plans.find(p => p.id === this.currentPlanId) || null;
    },

    getViewTitle() {
        if (this.viewMode === 'my_day') return 'My Day';
        if (this.viewMode === 'my_tasks') return 'My Tasks';
        const plan = this.getCurrentPlan();
        return plan ? plan.name : 'Tasks';
    },

    getBreadcrumbParent() {
        if (this.viewMode === 'my_day') return '';
        if (this.viewMode === 'my_tasks') return '';
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

console.log('[TaskApp] State module loaded');
