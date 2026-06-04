/**
 * TimeWhere Storage Layer - IndexedDB + Dexie.js
 * 版本: v3.0 (Planner architecture)
 * 日期: 2026-04-14
 */

const db = new Dexie('TimeWhere');

const SUBJECT_DEFAULT_BUCKETS = ['上课', '作业', '单元测试', '阶段考试'];
const OTHER_SCHOOL_PLAN_NAME = 'Other School Plan';
const OTHER_SCHOOL_DEFAULT_BUCKETS = ['事项', '活动', '申请', '其他'];
const LEGACY_DEFAULT_BUCKETS = ['Homework', 'Test', 'IA / EE', 'Notes', 'Review', 'Project', 'Other'];

// --- Schema v2 (original) ---
db.version(2).stores({
    settings: 'key',
    tasks: '++id, subject, bucket, deadline, status, createdAt, priority, completed_at',
    containers: '++id, name, repeat, enabled',
    habits: '++id, frequency, status_today',
    sync_log: '++id, type, action, timestamp, entity_id',
    events: '++id, title, date, time_start, time_end, container_id, created_at'
});

// --- Schema v3 (added events.source) ---
db.version(3).stores({
    events: '++id, title, date, time_start, time_end, container_id, created_at, source'
});

// --- Schema v4 (Planner architecture: plans, buckets, labels) ---
db.version(4).stores({
    plans:   '++id, name, created_at',
    buckets: '++id, plan_id, name, sort_order',
    labels:  '++id, plan_id, color, name',
    tasks:   '++id, plan_id, bucket_id, due_date, progress, priority, created_at, updated_at'
}).upgrade(async tx => {
    // 1. Create default plan
    const defaultPlanId = await tx.table('plans').add({
        name: 'My Tasks',
        color: '#2b56e3',
        icon_char: '✓',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    // 2. Collect unique bucket values from existing tasks → create Bucket records
    const existingTasks = await tx.table('tasks').toArray();
    const bucketValueSet = new Set();
    for (const t of existingTasks) {
        if (t.bucket) bucketValueSet.add(t.bucket);
    }

    const BUCKET_LABELS = {
        homework: '作业', test: '考试', ia: 'IA', notes: '笔记',
        review: '复习', project: '项目', other: '其他'
    };

    const bucketValueToId = {};
    let sortOrder = 0;
    for (const val of bucketValueSet) {
        const bucketId = await tx.table('buckets').add({
            plan_id: defaultPlanId,
            name: BUCKET_LABELS[val] || val,
            sort_order: sortOrder++,
            created_at: new Date().toISOString()
        });
        bucketValueToId[val] = bucketId;
    }
    // 3. Migrate each task
    const STATUS_TO_PROGRESS = {
        'pending': 'not_started',
        'in_progress': 'in_progress',
        'completed': 'completed'
    };

    for (const task of existingTasks) {
        const updates = {
            plan_id: defaultPlanId,
            bucket_id: bucketValueToId[task.bucket] || null,
            progress: STATUS_TO_PROGRESS[task.status] || 'not_started',
            due_date: task.deadline || null,
            start_date: null,
            labels: [],
            notes: task.description || '',
            checklist: [],
            updated_at: new Date().toISOString()
        };

        // Map old priority P1-P4 → new priority names
        const PRIORITY_MAP = {
            'P1': 'urgent', 'P2': 'important', 'P3': 'medium', 'P4': 'low'
        };
        if (PRIORITY_MAP[task.priority]) {
            updates.priority = PRIORITY_MAP[task.priority];
        }

        await tx.table('tasks').update(task.id, updates);
    }

});

// --- Schema v5 (Daily journal snapshots) ---
db.version(5).stores({
    daily_journals: '&date, status, updated_at, submitted_at, snapshot_at'
});

const TimeWhereDB = {
    db: db,

    generateId: () => {
        return crypto.randomUUID();
    },

    getNowISO: () => new Date().toISOString(),

    formatDateISO(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    addDaysISO(dateStr, days) {
        if (!dateStr) return null;
        const date = new Date(`${dateStr}T00:00:00`);
        if (Number.isNaN(date.getTime())) return null;
        date.setDate(date.getDate() + days);
        return this.formatDateISO(date);
    },

    normalizeSubjectKey(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    getSubjectIdSegments(value) {
        const raw = String(value || '');
        const candidates = new Set();
        const dashParts = raw.split(/\s+[-–—|]\s+/).map(part => part.trim()).filter(Boolean);
        for (let i = 0; i < dashParts.length; i++) {
            candidates.add(this.normalizeSubjectKey(dashParts.slice(i).join(' ')));
        }
        for (const part of raw.split(/\s+[-–—|]\s+|\s*:\s*/)) {
            candidates.add(this.normalizeSubjectKey(part));
        }
        return Array.from(candidates).filter(Boolean);
    },

    subjectIdMatchesPlan(subjectInMatrixView, plan) {
        const matrixKey = this.normalizeSubjectKey(subjectInMatrixView);
        if (!matrixKey || !plan) return false;
        const planKeys = [
            this.normalizeSubjectKey(plan.subject),
            this.normalizeSubjectKey(plan.name)
        ].filter(Boolean);
        if (!planKeys.length) return false;
        const matrixSegments = this.getSubjectIdSegments(subjectInMatrixView);
        return planKeys.some(planKey =>
            matrixKey === planKey ||
            matrixSegments.includes(planKey)
        );
    },

    async resolvePlanSubjectInMatrixViewFromEvents(plan) {
        if (!plan) return null;
        const events = await this.getEvents();
        const candidates = Array.from(new Set((events || [])
            .filter(event => event.source === 'timetable')
            .map(event => event.subject_in_matrixview)
            .filter(Boolean)));
        const exact = candidates.find(subjectInMatrixView => this.subjectIdMatchesPlan(subjectInMatrixView, plan));
        return exact || null;
    },

    async resolvePlanSubjectInMatrixView(plan, explicitValue = null) {
        if (explicitValue) return explicitValue;
        if (plan?.subject_in_matrixview) return plan.subject_in_matrixview;
        const subjectKey = this.normalizeSubjectKey(plan?.subject || plan?.name || '');
        if (!subjectKey) return null;
        const mappings = await this.getSetting('matrixview_subject_mappings');
        const matched = (mappings || []).find(mapping => {
            const mappingSubject = this.normalizeSubjectKey(mapping.subject || mapping.plan_name || '');
            const mappingPlanName = this.normalizeSubjectKey(mapping.plan_name || '');
            return mappingSubject === subjectKey || mappingPlanName === subjectKey;
        });
        return matched?.subject_in_matrixview || await this.resolvePlanSubjectInMatrixViewFromEvents(plan);
    },

    async backfillMatrixViewSubjectIds(options = {}) {
        const now = this.getNowISO();
        const plans = await this.getPlans();
        const planUpdates = [];
        const existingMappings = await this.getSetting('matrixview_subject_mappings');
        const mappings = Array.isArray(existingMappings)
            ? [...existingMappings]
            : [];
        const mappingKeys = new Set(mappings.map(mapping => [
            this.normalizeSubjectKey(mapping.plan_name || ''),
            this.normalizeSubjectKey(mapping.subject || ''),
            this.normalizeSubjectKey(mapping.subject_in_matrixview || '')
        ].join('|')));

        for (const plan of plans) {
            if (!plan?.subject || plan.subject_in_matrixview) continue;
            const subjectInMatrixView = await this.resolvePlanSubjectInMatrixViewFromEvents(plan);
            if (!subjectInMatrixView) continue;
            const updated = await this.updatePlan(plan.id, {
                subject_in_matrixview: subjectInMatrixView,
                matrixview_managed: plan.matrixview_managed === true,
                source: plan.source || 'matrixview_backfill'
            });
            planUpdates.push(updated);
            const mapping = {
                plan_name: plan.name || plan.subject,
                subject: plan.subject,
                subject_in_matrixview: subjectInMatrixView,
                source: 'matrixview_backfill',
                updated_at: now
            };
            const key = [
                this.normalizeSubjectKey(mapping.plan_name),
                this.normalizeSubjectKey(mapping.subject),
                this.normalizeSubjectKey(mapping.subject_in_matrixview)
            ].join('|');
            if (!mappingKeys.has(key)) {
                mappings.push(mapping);
                mappingKeys.add(key);
            }
        }

        if (planUpdates.length > 0) {
            await this.setSetting('matrixview_subject_mappings', mappings);
        }

        const latestPlans = await this.getPlans();
        const plansById = new Map(latestPlans.map(plan => [String(plan.id), plan]));
        const tasks = await this.getAllTasks();
        const taskUpdates = [];
        for (const task of tasks) {
            if (task.subject_in_matrixview || !task.plan_id) continue;
            const plan = plansById.get(String(task.plan_id));
            const subjectInMatrixView = await this.resolvePlanSubjectInMatrixView(plan);
            if (!subjectInMatrixView) continue;
            const updateData = {
                subject_in_matrixview: subjectInMatrixView,
                updated_at: now
            };
            await db.tasks.update(task.id, updateData);
            const updatedTask = await db.tasks.get(task.id);
            await this.addSyncLog('task', 'update', updatedTask);
            await this.markGoogleSyncDirty('tasks', task.id, updatedTask, options);
            taskUpdates.push(updatedTask);
        }

        if ((planUpdates.length || taskUpdates.length) && !options.skipTaskArrangeDirty) {
            await this.markTaskArrangeDirty('matrixview_subject_id_backfill', options);
        }

        return {
            plan_updates: planUpdates.length,
            task_updates: taskUpdates.length,
            mappings: mappings.length
        };
    },

    getInitialTaskStartDate(task = {}, referenceDate = new Date()) {
        const dueDate = task.due_date || task.deadline || null;
        if (!dueDate) return task.start_date || null;
        if (task.start_date) return task.start_date;
        const todayStr = typeof referenceDate === 'string' ? referenceDate.slice(0, 10) : this.formatDateISO(referenceDate);
        if (dueDate < todayStr) return dueDate;
        const leadDays = this.isManageBacSourceTask(task) ? 14 : 7;
        const earlyStart = this.addDaysISO(dueDate, -leadDays);
        if (!earlyStart) return dueDate;
        const candidate = todayStr > earlyStart ? todayStr : earlyStart;
        return candidate > dueDate ? dueDate : candidate;
    },

    normalizeRecurrenceOptions(options = {}) {
        const frequency = options.frequency || options.recurrence_frequency || 'none';
        const count = Number(options.count || options.recurrence_count || 0);
        if (!['weekly', 'monthly'].includes(frequency)) return null;
        if (!Number.isInteger(count) || count < 2 || count > 12) {
            throw new Error('周期任务次数必须在 2 到 12 之间');
        }
        return { frequency, count };
    },

    addMonthsClampedISO(dateStr, months) {
        if (!dateStr) return null;
        const [year, month, day] = dateStr.split('-').map(Number);
        if (!year || !month || !day) return null;
        const target = new Date(year, month - 1 + months, 1);
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(day, lastDay));
        return this.formatDateISO(target);
    },

    getRecurrenceDate(anchorDate, frequency, indexOffset) {
        if (!anchorDate) return null;
        if (frequency === 'weekly') return this.addDaysISO(anchorDate, indexOffset * 7);
        if (frequency === 'monthly') return this.addMonthsClampedISO(anchorDate, indexOffset);
        return anchorDate;
    },

    cloneRecurringChecklist(checklist = []) {
        return (checklist || []).map((item, index) => ({
            ...item,
            id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `recurrence-check-${Date.now()}-${index}`,
            checked: false
        }));
    },

    getGoogleSyncApi() {
        return typeof globalThis !== 'undefined' ? globalThis.TimeWhereGoogleSync : null;
    },

    async markGoogleSyncDirty(table, id, record, options = {}) {
        if (options.skipGoogleSync) return;
        const api = this.getGoogleSyncApi();
        if (!api?.markEntityDirty) return;
        try {
            await api.markEntityDirty(this, table, id, record, options);
            if (api.schedulePageAutoSync) {
                api.schedulePageAutoSync(this, { debounce_ms: 30 * 1000 });
            }
        } catch (error) {
            console.warn('Google sync dirty marker failed:', error);
        }
    },

    async markGoogleSyncDeleted(table, id, record, options = {}) {
        if (options.skipGoogleSync) return;
        const api = this.getGoogleSyncApi();
        if (!api?.markEntityDeleted) return;
        try {
            await api.markEntityDeleted(this, table, id, record, options);
            if (api.schedulePageAutoSync) {
                api.schedulePageAutoSync(this, { debounce_ms: 30 * 1000 });
            }
        } catch (error) {
            console.warn('Google sync tombstone marker failed:', error);
        }
    },

    getTaskArrangeAutoApi() {
        return typeof globalThis !== 'undefined' ? globalThis.TimeWhereTaskArrangeAuto : null;
    },

    async markTaskArrangeDirty(reason = 'arrange_relevant_change', options = {}) {
        if (options.skipTaskArrangeDirty) return;
        const api = this.getTaskArrangeAutoApi();
        if (api?.markTaskArrangeDirty) {
            await api.markTaskArrangeDirty(this, reason);
        }
    },

    hasArrangeRelevantTaskDate(task = {}) {
        return !!(task.start_date || task.due_date || task.deadline || task.plan_id);
    },

    hasArrangeRelevantTaskUpdate(data = {}) {
        return ['start_date', 'due_date', 'deadline', 'plan_id', 'subject_in_matrixview'].some(field =>
            Object.prototype.hasOwnProperty.call(data || {}, field)
        );
    },

    isRecurringTask(task = {}) {
        return !!(task && task.recurrence_series_id);
    },

    async getRecurringSeriesTasks(taskOrId) {
        const task = typeof taskOrId === 'object' ? taskOrId : await db.tasks.get(taskOrId);
        if (!task?.recurrence_series_id) return task ? [task] : [];
        const allTasks = await db.tasks.toArray();
        const tasks = allTasks.filter(item => item.recurrence_series_id === task.recurrence_series_id);
        return tasks.sort((a, b) => (a.recurrence_index || 0) - (b.recurrence_index || 0));
    },

    getRecurringScopeTargets(seriesTasks, currentTask, scope = 'single') {
        if (!currentTask?.recurrence_series_id) return currentTask ? [currentTask] : [];
        if (scope === 'all') return seriesTasks;
        if (scope === 'future') {
            const currentIndex = currentTask.recurrence_index || 1;
            return seriesTasks.filter(task => (task.recurrence_index || 1) >= currentIndex);
        }
        return seriesTasks.filter(task => String(task.id) === String(currentTask.id));
    },

    // ========== Plans ==========
    async getPlans() {
        const plans = await db.plans.toArray();
        return plans.sort((a, b) => {
            const aOrder = Number.isFinite(a.sort_order) ? a.sort_order : Number.MAX_SAFE_INTEGER;
            const bOrder = Number.isFinite(b.sort_order) ? b.sort_order : Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return (a.created_at || '').localeCompare(b.created_at || '');
        });
    },

    async getPlanById(id) {
        return await db.plans.get(id);
    },

    async ensureDefaultPlan() {
        let plan = (await this.getPlans())[0];
        if (plan) {
            await this.ensureBucketTemplatesForExistingPlans();
            return plan;
        }

        plan = await this.addPlan({
            name: 'My Tasks',
            color: '#2b56e3',
            icon_char: '✓'
        });

        await this.ensureBucketTemplateForPlan(plan.id, SUBJECT_DEFAULT_BUCKETS);

        return plan;
    },

    async addPlan(plan) {
        const now = this.getNowISO();
        const existing = await this.getPlans();
        const baseSortOrder = existing.reduce((max, item, index) => {
            const order = Number.isFinite(item.sort_order) ? item.sort_order : index;
            return Math.max(max, order);
        }, -1) + 1;
        const newPlan = {
            name: plan.name || 'New Plan',
            color: plan.color || '#2b56e3',
            icon_char: plan.icon_char || (plan.name ? plan.name.charAt(0) : 'P'),
            subject: plan.subject || null,
            subject_in_matrixview: plan.subject_in_matrixview || null,
            subject_active: plan.subject ? plan.subject_active !== false : null,
            matrixview_managed: plan.matrixview_managed === true,
            source: plan.source || null,
            sort_order: plan.sort_order ?? baseSortOrder,
            created_at: now,
            updated_at: now
        };
        const id = await db.plans.add(newPlan);
        const created = { ...newPlan, id };
        await this.markGoogleSyncDirty('plans', id, created);
        return created;
    },

    async updatePlan(id, data) {
        const updateData = { ...data, updated_at: this.getNowISO() };
        await db.plans.update(id, updateData);
        const updated = await db.plans.get(id);
        await this.markGoogleSyncDirty('plans', id, updated);
        if (['subject', 'subject_in_matrixview', 'subject_active', 'matrixview_managed'].some(field => Object.prototype.hasOwnProperty.call(data || {}, field))) {
            await this.markTaskArrangeDirty('plan_subject_changed');
        }
        return updated;
    },

    async deletePlan(id) {
        // Cascade: delete buckets, labels, and tasks belonging to this plan
        const plan = await db.plans.get(id);
        if (plan?.subject && plan.subject_active !== false) {
            throw new Error('启用学科 Plan 只能通过 MatrixView 导入更新，不能手动删除。');
        }
        const buckets = await db.buckets.where('plan_id').equals(id).toArray();
        const labels = await db.labels.where('plan_id').equals(id).toArray();
        const tasks = await db.tasks.where('plan_id').equals(id).toArray();
        for (const bucket of buckets) await this.markGoogleSyncDeleted('buckets', bucket.id, bucket);
        for (const label of labels) await this.markGoogleSyncDeleted('labels', label.id, label);
        for (const task of tasks) await this.markGoogleSyncDeleted('tasks', task.id, task);
        await db.buckets.where('plan_id').equals(id).delete();
        await db.labels.where('plan_id').equals(id).delete();
        await db.tasks.where('plan_id').equals(id).delete();
        await db.plans.delete(id);
        await this.markGoogleSyncDeleted('plans', id, plan);
    },

    async reorderPlans(orderedIds) {
        const now = this.getNowISO();
        for (let i = 0; i < orderedIds.length; i++) {
            await db.plans.update(orderedIds[i], { sort_order: i, updated_at: now });
            const updated = await db.plans.get(orderedIds[i]);
            await this.markGoogleSyncDirty('plans', orderedIds[i], updated);
        }
        return await this.getPlans();
    },

    // ========== Buckets ==========
    async getBucketsByPlan(planId) {
        return await db.buckets.where('plan_id').equals(planId).sortBy('sort_order');
    },

    async getBucketById(id) {
        return await db.buckets.get(id);
    },

    async addBucket(bucket) {
        const newBucket = {
            plan_id: bucket.plan_id,
            name: bucket.name || 'New Bucket',
            sort_order: bucket.sort_order ?? 0,
            created_at: this.getNowISO()
        };
        const id = await db.buckets.add(newBucket);
        const created = { ...newBucket, id };
        await this.markGoogleSyncDirty('buckets', id, created);
        return created;
    },

    async ensureBucketTemplateForPlan(planId, bucketNames) {
        const existing = await this.getBucketsByPlan(planId);
        const existingNames = new Set(existing.map(bucket => bucket.name));
        const created = [];
        const baseSortOrder = existing.reduce((max, bucket) => Math.max(max, bucket.sort_order ?? -1), -1) + 1;

        for (const name of bucketNames) {
            if (existingNames.has(name)) continue;
            const bucket = await this.addBucket({
                plan_id: planId,
                name,
                sort_order: baseSortOrder + created.length
            });
            created.push(bucket);
            existingNames.add(name);
        }

        return created;
    },

    async ensureBucketTemplatesForExistingPlans() {
        const plans = await this.getPlans();
        const result = [];

        for (const plan of plans) {
            const buckets = await this.getBucketsByPlan(plan.id);
            const bucketNames = new Set(buckets.map(bucket => bucket.name));
            const hasLegacyDefaults = LEGACY_DEFAULT_BUCKETS.some(name => bucketNames.has(name));
            let template = null;

            if (plan.name === OTHER_SCHOOL_PLAN_NAME) {
                template = OTHER_SCHOOL_DEFAULT_BUCKETS;
            } else if (plan.name === 'My Tasks' || plan.subject || hasLegacyDefaults) {
                template = SUBJECT_DEFAULT_BUCKETS;
            }

            if (!template) continue;

            const created = await this.ensureBucketTemplateForPlan(plan.id, template);
            const removed = await this.deleteEmptyLegacyBucketsForPlan(plan.id);
            result.push({
                plan_id: plan.id,
                plan_name: plan.name,
                created_count: created.length,
                created_names: created.map(bucket => bucket.name),
                removed_empty_legacy_count: removed.length,
                removed_empty_legacy_names: removed.map(bucket => bucket.name)
            });
        }

        return result;
    },

    async deleteEmptyLegacyBucketsForPlan(planId) {
        const buckets = await this.getBucketsByPlan(planId);
        const removed = [];

        for (const bucket of buckets) {
            if (!LEGACY_DEFAULT_BUCKETS.includes(bucket.name)) continue;
            const taskCount = await db.tasks.where('bucket_id').equals(bucket.id).count();
            if (taskCount > 0) continue;
            await this.markGoogleSyncDeleted('buckets', bucket.id, bucket);
            await db.buckets.delete(bucket.id);
            removed.push(bucket);
        }

        return removed;
    },

    async updateBucket(id, data) {
        await db.buckets.update(id, data);
        const updated = await db.buckets.get(id);
        await this.markGoogleSyncDirty('buckets', id, updated);
        return updated;
    },

    async deleteBucket(id) {
        // Unlink tasks that reference this bucket
        const tasks = await db.tasks.where('bucket_id').equals(id).toArray();
        for (const t of tasks) {
            await db.tasks.update(t.id, { bucket_id: null });
            const updatedTask = await db.tasks.get(t.id);
            await this.markGoogleSyncDirty('tasks', t.id, updatedTask);
        }
        const bucket = await db.buckets.get(id);
        await db.buckets.delete(id);
        await this.markGoogleSyncDeleted('buckets', id, bucket);
    },

    async reorderBuckets(planId, orderedIds) {
        for (let i = 0; i < orderedIds.length; i++) {
            await db.buckets.update(orderedIds[i], { sort_order: i });
            const updated = await db.buckets.get(orderedIds[i]);
            await this.markGoogleSyncDirty('buckets', orderedIds[i], updated);
        }
    },

    // ========== Labels ==========
    async getLabelsByPlan(planId) {
        return await db.labels.where('plan_id').equals(planId).toArray();
    },

    async getLabelById(id) {
        return await db.labels.get(id);
    },

    async addLabel(label) {
        const newLabel = {
            plan_id: label.plan_id,
            color: label.color || '#4A90D9',
            name: label.name || '',
            created_at: this.getNowISO()
        };
        const id = await db.labels.add(newLabel);
        const created = { ...newLabel, id };
        await this.markGoogleSyncDirty('labels', id, created);
        return created;
    },

    async updateLabel(id, data) {
        await db.labels.update(id, data);
        const updated = await db.labels.get(id);
        await this.markGoogleSyncDirty('labels', id, updated);
        return updated;
    },

    async deleteLabel(id) {
        // Remove this label ID from all tasks' labels arrays
        const allTasks = await db.tasks.toArray();
        for (const t of allTasks) {
            if (t.labels && t.labels.includes(id)) {
                const newLabels = t.labels.filter(lid => lid !== id);
                await db.tasks.update(t.id, { labels: newLabels });
                const updatedTask = await db.tasks.get(t.id);
                await this.markGoogleSyncDirty('tasks', t.id, updatedTask);
            }
        }
        const label = await db.labels.get(id);
        await db.labels.delete(id);
        await this.markGoogleSyncDeleted('labels', id, label);
    },

    // ========== Tasks ==========
    async getTasks(filter = {}) {
        let collection = db.tasks.toCollection();

        if (filter.plan_id) {
            collection = db.tasks.where('plan_id').equals(filter.plan_id);
        }
        if (filter.progress) {
            collection = collection.filter(t => t.progress === filter.progress);
        }
        if (filter.bucket_id) {
            collection = collection.filter(t => t.bucket_id === filter.bucket_id);
        }
        if (filter.priority) {
            collection = collection.filter(t => t.priority === filter.priority);
        }
        if (filter.due_date) {
            collection = collection.filter(t => t.due_date === filter.due_date);
        }
        // Legacy filter compat
        if (filter.status) {
            collection = collection.filter(t => t.status === filter.status || t.progress === filter.status);
        }
        if (filter.subject) {
            collection = collection.filter(t => t.subject === filter.subject);
        }

        return await collection.toArray();
    },

    async getTasksByPlan(planId, filter = {}) {
        let tasks = await db.tasks.where('plan_id').equals(planId).toArray();

        if (filter.progress) {
            tasks = tasks.filter(t => t.progress === filter.progress);
        }
        if (filter.priority) {
            tasks = tasks.filter(t => t.priority === filter.priority);
        }
        if (filter.bucket_id) {
            tasks = tasks.filter(t => t.bucket_id === filter.bucket_id);
        }

        return tasks;
    },

    async getAllTasks(filter = {}) {
        let tasks = await db.tasks.toArray();
        if (filter.progress) {
            tasks = tasks.filter(t => t.progress === filter.progress);
        }
        if (filter.priority) {
            tasks = tasks.filter(t => t.priority === filter.priority);
        }
        return tasks;
    },

    async getTaskById(id) {
        return await db.tasks.get(id);
    },

    async getInProgressTask() {
        // Try indexed query first, fall back to scan
        let task = await db.tasks.where('progress').equals('in_progress').first();
        if (!task) {
            // Legacy compat: check status field for pre-migration tasks
            task = await db.tasks.filter(t => t.status === 'in_progress' || t.progress === 'in_progress').first();
        }
        return task;
    },

    isManageBacSourceTask(task) {
        return !!task && (
            task.source === 'managebac' ||
            task.source_type === 'managebac_ics' ||
            (task.readonly === true && !!task.managebac_subject)
        );
    },

    isManageBacLocalStatusUpdate(data = {}) {
        const allowedFields = new Set(['progress', 'completed_at', 'status', 'start_date', 'priority']);
        const fields = Object.keys(data || {});
        return fields.length > 0 && fields.every(field => allowedFields.has(field));
    },

    assertTaskWritable(task, options = {}, data = null) {
        if (this.isManageBacSourceTask(task) && !options.allowManageBacSync) {
            if (data && this.isManageBacLocalStatusUpdate(data)) return;
            throw new Error('ManageBac source content is read-only. Local progress updates are allowed.');
        }
    },

    async addTask(task, options = {}) {
        this.assertTaskWritable(task, options);
        const now = this.getNowISO();
        const normalizedTask = {
            ...task,
            due_date: task.due_date || task.deadline || null
        };
        normalizedTask.start_date = this.getInitialTaskStartDate(normalizedTask, new Date(now));
        const plan = task.plan_id ? await db.plans.get(task.plan_id) : await this.ensureDefaultPlan();
        const planId = task.plan_id || plan.id;
        const subject = plan?.subject || null;
        const subjectInMatrixView = await this.resolvePlanSubjectInMatrixView(plan, task.subject_in_matrixview || null);
        const progressVal = task.progress || 'not_started';
        const newTask = {
            // Use UUID for consistency with existing tasks
            id: this.generateId(),
            // Core Planner fields
            title: task.title || '',
            plan_id: planId,
            bucket_id: task.bucket_id || null,
            progress: progressVal,
            priority: task.priority || 'medium',
            start_date: normalizedTask.start_date || null,
            due_date: normalizedTask.due_date || null,
            labels: task.labels || [],
            notes: task.notes || '',
            checklist: task.checklist || [],
            schedule_time: task.schedule_time || null,
            duration: task.duration || 45,
            subject: subject,
            subject_in_matrixview: subjectInMatrixView,
            deferred_until: task.deferred_until || null,
            completed_at: null,
            google_task_id: null,
            source: task.source || null,
            source_type: task.source_type || null,
            source_uid: task.source_uid || null,
            source_updated_at: task.source_updated_at || null,
            source_url: task.source_url || null,
            managebac_subject: task.managebac_subject || null,
            readonly: task.readonly === true,
            synced_at: task.synced_at || null,
            created_at: now,
            updated_at: now
        };
        if (task.recurrence_series_id) {
            Object.assign(newTask, {
                recurrence_series_id: task.recurrence_series_id,
                recurrence_index: task.recurrence_index || null,
                recurrence_count: task.recurrence_count || null,
                recurrence_frequency: task.recurrence_frequency || null,
                recurrence_anchor_start_date: task.recurrence_anchor_start_date || null,
                recurrence_anchor_due_date: task.recurrence_anchor_due_date || null
            });
        }

        await db.tasks.add(newTask);
        await this.addSyncLog('task', 'create', newTask);
        await this.markGoogleSyncDirty('tasks', newTask.id, newTask, options);
        if (this.hasArrangeRelevantTaskDate(newTask)) {
            await this.markTaskArrangeDirty('task_created_with_arrange_date', options);
        }
        return newTask;
    },

    async addRecurringTaskSeries(task, recurrenceOptions = {}, options = {}) {
        const recurrence = this.normalizeRecurrenceOptions(recurrenceOptions);
        if (!recurrence) return [await this.addTask(task, options)];
        if (this.isManageBacSourceTask(task)) {
            throw new Error('ManageBac 来源任务不能创建周期任务');
        }

        const firstTaskInput = {
            ...task,
            due_date: task.due_date || task.deadline || null
        };
        if (!firstTaskInput.due_date) {
            throw new Error('周期任务必须设置截止日期');
        }
        firstTaskInput.start_date = this.getInitialTaskStartDate(firstTaskInput, new Date(this.getNowISO()));
        const seriesId = this.generateId();
        const anchorStartDate = firstTaskInput.start_date || null;
        const anchorDueDate = firstTaskInput.due_date;
        const created = [];

        for (let index = 1; index <= recurrence.count; index++) {
            const offset = index - 1;
            const instanceInput = {
                ...firstTaskInput,
                start_date: this.getRecurrenceDate(anchorStartDate, recurrence.frequency, offset),
                due_date: this.getRecurrenceDate(anchorDueDate, recurrence.frequency, offset),
                deadline: this.getRecurrenceDate(anchorDueDate, recurrence.frequency, offset),
                progress: 'not_started',
                status: 'pending',
                completed_at: null,
                checklist: this.cloneRecurringChecklist(firstTaskInput.checklist || []),
                recurrence_series_id: seriesId,
                recurrence_index: index,
                recurrence_count: recurrence.count,
                recurrence_frequency: recurrence.frequency,
                recurrence_anchor_start_date: anchorStartDate,
                recurrence_anchor_due_date: anchorDueDate
            };
            created.push(await this.addTask(instanceInput, options));
        }

        return created;
    },

    async createRecurringTaskSeriesFromTask(taskId, recurrenceOptions = {}, options = {}) {
        const task = await db.tasks.get(taskId);
        if (!task) throw new Error('找不到任务');
        if (this.isManageBacSourceTask(task)) throw new Error('ManageBac 来源任务不能创建周期任务');
        if (task.recurrence_series_id) throw new Error('该任务已经属于周期任务');
        const recurrence = this.normalizeRecurrenceOptions(recurrenceOptions);
        if (!recurrence) return [task];
        const dueDate = task.due_date || task.deadline || null;
        if (!dueDate) throw new Error('周期任务必须设置截止日期');

        const anchorStartDate = this.getInitialTaskStartDate({ ...task, due_date: dueDate }, new Date(this.getNowISO()));
        const seriesId = this.generateId();
        const sharedSeriesFields = {
            recurrence_series_id: seriesId,
            recurrence_index: 1,
            recurrence_count: recurrence.count,
            recurrence_frequency: recurrence.frequency,
            recurrence_anchor_start_date: anchorStartDate,
            recurrence_anchor_due_date: dueDate,
            start_date: anchorStartDate,
            due_date: dueDate,
            deadline: dueDate
        };
        const first = await this.updateTask(taskId, sharedSeriesFields, options);
        const created = [first];

        for (let index = 2; index <= recurrence.count; index++) {
            const offset = index - 1;
            const instanceInput = {
                ...task,
                id: undefined,
                start_date: this.getRecurrenceDate(anchorStartDate, recurrence.frequency, offset),
                due_date: this.getRecurrenceDate(dueDate, recurrence.frequency, offset),
                deadline: this.getRecurrenceDate(dueDate, recurrence.frequency, offset),
                progress: 'not_started',
                status: 'pending',
                completed_at: null,
                checklist: this.cloneRecurringChecklist(task.checklist || []),
                recurrence_series_id: seriesId,
                recurrence_index: index,
                recurrence_count: recurrence.count,
                recurrence_frequency: recurrence.frequency,
                recurrence_anchor_start_date: anchorStartDate,
                recurrence_anchor_due_date: dueDate
            };
            delete instanceInput.google_task_id;
            created.push(await this.addTask(instanceInput, options));
        }

        return created;
    },

    async resizeRecurringTaskSeries(taskId, newCount, options = {}) {
        const task = await db.tasks.get(taskId);
        if (!task) throw new Error('找不到任务');
        if (this.isManageBacSourceTask(task)) throw new Error('ManageBac 来源任务不能调整周期任务');
        if (!task.recurrence_series_id) throw new Error('该任务不属于周期任务');

        const targetCount = Number(newCount);
        if (!Number.isInteger(targetCount) || targetCount < 2 || targetCount > 12) {
            throw new Error('周期任务次数必须在 2 到 12 之间');
        }

        const seriesTasks = await this.getRecurringSeriesTasks(task);
        if (!seriesTasks.length) throw new Error('找不到周期任务系列');
        const frequency = task.recurrence_frequency || seriesTasks[0].recurrence_frequency;
        if (!['weekly', 'monthly'].includes(frequency)) {
            throw new Error('周期任务频率无效');
        }

        const currentMaxIndex = Math.max(...seriesTasks.map(item => item.recurrence_index || 1));
        const anchorTask = seriesTasks[0];
        const anchorStartDate = task.recurrence_anchor_start_date || anchorTask.recurrence_anchor_start_date || anchorTask.start_date || null;
        const anchorDueDate = task.recurrence_anchor_due_date || anchorTask.recurrence_anchor_due_date || anchorTask.due_date || anchorTask.deadline || null;
        if (!anchorDueDate) throw new Error('周期任务必须设置截止日期');

        const deleted = [];
        const created = [];
        if (targetCount < currentMaxIndex) {
            const tailTasks = seriesTasks.filter(item => (item.recurrence_index || 1) > targetCount);
            const completedTailTask = tailTasks.find(item => item.progress === 'completed' || !!item.completed_at);
            if (completedTailTask) {
                throw new Error('不能减少到该次数：后续周期任务中已有已完成实例');
            }
            for (const tailTask of tailTasks) {
                await this.deleteTask(tailTask.id, options);
                deleted.push(tailTask);
            }
        }

        const template = anchorTask;
        if (targetCount > currentMaxIndex) {
            for (let index = currentMaxIndex + 1; index <= targetCount; index++) {
                const offset = index - 1;
                const instanceInput = {
                    ...template,
                    id: undefined,
                    start_date: this.getRecurrenceDate(anchorStartDate, frequency, offset),
                    due_date: this.getRecurrenceDate(anchorDueDate, frequency, offset),
                    deadline: this.getRecurrenceDate(anchorDueDate, frequency, offset),
                    progress: 'not_started',
                    status: 'pending',
                    completed_at: null,
                    checklist: this.cloneRecurringChecklist(template.checklist || []),
                    recurrence_series_id: task.recurrence_series_id,
                    recurrence_index: index,
                    recurrence_count: targetCount,
                    recurrence_frequency: frequency,
                    recurrence_anchor_start_date: anchorStartDate,
                    recurrence_anchor_due_date: anchorDueDate
                };
                delete instanceInput.google_task_id;
                created.push(await this.addTask(instanceInput, options));
            }
        }

        const remainingTasks = (await this.getRecurringSeriesTasks(task))
            .filter(item => (item.recurrence_index || 1) <= targetCount);
        const updated = [];
        for (const remainingTask of remainingTasks) {
            if (remainingTask.recurrence_count !== targetCount) {
                updated.push(await this.updateTask(remainingTask.id, { recurrence_count: targetCount }, options));
            } else {
                updated.push(remainingTask);
            }
        }

        return { updated, created, deleted, recurrence_count: targetCount };
    },

    getChecklistProgressUpdate(checklist = [], existingTask = {}) {
        if (!Array.isArray(checklist) || checklist.length === 0) return {};
        const checkedCount = checklist.filter(item => item && item.checked === true).length;
        if (checkedCount === 0) {
            return { progress: 'not_started', status: 'pending', completed_at: null };
        }
        if (checkedCount === checklist.length) {
            return {
                progress: 'completed',
                status: 'completed',
                completed_at: existingTask.completed_at || this.getNowISO()
            };
        }
        return { progress: 'in_progress', status: 'in_progress', completed_at: null };
    },

    async updateTask(id, data, options = {}) {
        const existingTask = await db.tasks.get(id);
        this.assertTaskWritable(existingTask, options, data);
        const updateData = {
            ...data,
            updated_at: this.getNowISO()
        };
        if (Object.prototype.hasOwnProperty.call(updateData, 'subject')) {
            delete updateData.subject;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'plan_id')) {
            const nextPlan = data.plan_id ? await db.plans.get(data.plan_id) : null;
            updateData.subject = nextPlan?.subject || null;
            updateData.subject_in_matrixview = await this.resolvePlanSubjectInMatrixView(nextPlan, data.subject_in_matrixview || null);
        }
        // Bidirectional sync: progress ↔ status
        if (data.progress) {
            updateData.status = data.progress === 'completed' ? 'completed' : (data.progress === 'in_progress' ? 'in_progress' : 'pending');
        } else if (data.status) {
            const statusToProgress = { 'pending': 'not_started', 'in_progress': 'in_progress', 'completed': 'completed' };
            updateData.progress = statusToProgress[data.status] || 'not_started';
        }
        if (data.due_date !== undefined) {
            updateData.deadline = data.due_date;
        }
        if (data.deadline !== undefined && data.due_date === undefined) {
            updateData.due_date = data.deadline;
        }
        if (
            Object.prototype.hasOwnProperty.call(data, 'checklist') &&
            !Object.prototype.hasOwnProperty.call(data, 'progress') &&
            !Object.prototype.hasOwnProperty.call(data, 'status')
        ) {
            Object.assign(updateData, this.getChecklistProgressUpdate(data.checklist, existingTask));
        }

        await db.tasks.update(id, updateData);
        const updatedTask = await db.tasks.get(id);
        await this.addSyncLog('task', 'update', updatedTask);
        await this.markGoogleSyncDirty('tasks', id, updatedTask, options);
        if (this.hasArrangeRelevantTaskUpdate(data)) {
            await this.markTaskArrangeDirty('task_arrange_field_changed', options);
        }
        return updatedTask;
    },

    getDayDeltaISO(fromDate, toDate) {
        if (!fromDate || !toDate) return null;
        const from = new Date(`${fromDate}T00:00:00`);
        const to = new Date(`${toDate}T00:00:00`);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
        return Math.round((to.getTime() - from.getTime()) / 86400000);
    },

    buildRecurringScopedUpdates(currentTask, targetTask, data = {}) {
        const updates = { ...data };
        const startDelta = Object.prototype.hasOwnProperty.call(data, 'start_date')
            ? this.getDayDeltaISO(currentTask.start_date || null, data.start_date || null)
            : null;
        const dueDelta = Object.prototype.hasOwnProperty.call(data, 'due_date')
            ? this.getDayDeltaISO(currentTask.due_date || currentTask.deadline || null, data.due_date || null)
            : null;
        const deadlineDelta = Object.prototype.hasOwnProperty.call(data, 'deadline')
            ? this.getDayDeltaISO(currentTask.deadline || currentTask.due_date || null, data.deadline || null)
            : null;

        if (String(targetTask.id) !== String(currentTask.id)) {
            if (startDelta !== null) updates.start_date = this.addDaysISO(targetTask.start_date, startDelta);
            if (dueDelta !== null) updates.due_date = this.addDaysISO(targetTask.due_date || targetTask.deadline, dueDelta);
            if (deadlineDelta !== null) updates.deadline = this.addDaysISO(targetTask.deadline || targetTask.due_date, deadlineDelta);
            if (Object.prototype.hasOwnProperty.call(data, 'checklist')) {
                updates.checklist = this.cloneRecurringChecklist(data.checklist || []);
            }
        }

        return updates;
    },

    async updateRecurringTaskScope(id, data, scope = 'single', options = {}) {
        const currentTask = await db.tasks.get(id);
        if (!currentTask) throw new Error('找不到任务');
        if (!currentTask.recurrence_series_id || scope === 'single') {
            return [await this.updateTask(id, data, options)];
        }

        const seriesTasks = await this.getRecurringSeriesTasks(currentTask);
        const targets = this.getRecurringScopeTargets(seriesTasks, currentTask, scope);
        const updated = [];
        for (const target of targets) {
            const scopedUpdates = this.buildRecurringScopedUpdates(currentTask, target, data);
            updated.push(await this.updateTask(target.id, scopedUpdates, options));
        }
        return updated;
    },

    async deleteTask(id, options = {}) {
        const task = await db.tasks.get(id);
        this.assertTaskWritable(task, options);
        await db.tasks.delete(id);
        await this.addSyncLog('task', 'delete', task);
        await this.markGoogleSyncDeleted('tasks', id, task, options);
    },

    async deleteRecurringTaskScope(id, scope = 'single', options = {}) {
        const task = await db.tasks.get(id);
        if (!task) return [];
        if (!task.recurrence_series_id || scope === 'single') {
            await this.deleteTask(id, options);
            return [task];
        }

        const seriesTasks = await this.getRecurringSeriesTasks(task);
        const targets = this.getRecurringScopeTargets(seriesTasks, task, scope);
        for (const target of targets) {
            await this.deleteTask(target.id, options);
        }
        return targets;
    },

    async completeTask(id) {
        return await this.updateTask(id, {
            progress: 'completed',
            completed_at: this.getNowISO()
        });
    },

    async startTask(id) {
        return await this.updateTask(id, {
            progress: 'in_progress'
        });
    },

    async updateChecklist(taskId, checklist) {
        return await this.updateTask(taskId, { checklist });
    },

    async toggleChecklistItem(taskId, itemId) {
        const task = await db.tasks.get(taskId);
        if (!task || !task.checklist) return null;
        const newChecklist = task.checklist.map(item =>
            item.id === itemId ? { ...item, checked: !item.checked } : item
        );
        return await this.updateTask(taskId, { checklist: newChecklist });
    },

    async getTodayCompletedCount() {
        const today = this.formatDateISO(new Date());
        const allTasks = await db.tasks.toArray();
        return allTasks.filter(t => t.completed_at && t.completed_at.startsWith(today)).length;
    },

    async getPendingCount() {
        const allTasks = await db.tasks.toArray();
        return allTasks.filter(t => t.progress === 'not_started' || t.progress === 'in_progress').length;
    },

    // ========== Daily Journals ==========
    getDailyJournalDate(date = new Date()) {
        if (typeof date === 'string') return date.slice(0, 10);
        return this.formatDateISO(date);
    },

    getLocalDateFromISO(value) {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
        return this.formatDateISO(date);
    },

    cloneJournalValue(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    },

    normalizeJournalChecklistItem(item, index = 0) {
        return {
            id: String(item?.id ?? `index:${index}`),
            title: String(item?.title || item?.text || ''),
            checked: item?.checked === true,
            type: item?.type || null,
            partial_group_id: item?.partial_group_id || null,
            partial_role: item?.partial_role || null,
            partial_percent: Number.isFinite(Number(item?.partial_percent))
                ? Number(item.partial_percent)
                : null
        };
    },

    createJournalChecklistBaseline(task = {}) {
        const items = Array.isArray(task.checklist)
            ? task.checklist.map((item, index) => this.normalizeJournalChecklistItem(item, index))
            : [];
        const checkedItems = items.filter(item => item.checked);
        const partialDone = items
            .filter(item => item.type === 'partial_completion' && item.partial_role === 'done')
            .map(item => item.partial_percent)
            .filter(value => value != null);
        const fingerprintItems = items.map(item => ({
            id: item.id,
            title: item.title,
            checked: item.checked,
            type: item.type,
            partial_group_id: item.partial_group_id,
            partial_role: item.partial_role,
            partial_percent: item.partial_percent
        }));
        return {
            checklist_total_count: items.length,
            checklist_checked_count: checkedItems.length,
            checklist_checked_ids: checkedItems.map(item => item.id).sort(),
            checklist_fingerprint: JSON.stringify(fingerprintItems),
            checklist_partial_percent: partialDone.length > 0 ? Math.max(...partialDone) : null
        };
    },

    createJournalTaskSnapshot(task) {
        const checklistBaseline = this.createJournalChecklistBaseline(task);
        return {
            id: task.id,
            title: task.title || '',
            plan_id: task.plan_id || null,
            bucket_id: task.bucket_id || null,
            subject: task.subject || null,
            start_date: task.start_date || null,
            due_date: task.due_date || task.deadline || null,
            progress: task.progress || task.status || 'not_started',
            priority: task.priority || 'medium',
            completed_at: task.completed_at || null,
            source: task.source || null,
            source_uid: task.source_uid || null,
            duration: task.duration || null,
            schedule_time: task.schedule_time || null,
            assignment: task.assignment ? {
                status: task.assignment.status || null,
                label: task.assignment.label || null,
                reason: task.assignment.reason || null,
                container_id: task.assignment.container_id || null,
                container_name: task.assignment.container_name || null,
                time_start: task.assignment.time_start || null,
                time_end: task.assignment.time_end || null
            } : null,
            ...checklistBaseline
        };
    },

    getJournalTaskCompletionStatus(snapshot = {}, currentTask = null, analysis = null, journalDate = null) {
        const progress = currentTask?.progress || currentTask?.status || snapshot?.progress || 'not_started';
        const completedAt = currentTask?.completed_at || snapshot?.completed_at || null;
        const completedOnDate = journalDate
            ? this.getLocalDateFromISO(completedAt) === journalDate
            : !!completedAt;
        if (progress === 'completed' || completedOnDate) {
            return { status: 'completed', label: '完成' };
        }

        const partialPercent = currentTask?.checklist_partial_percent != null && Number.isFinite(Number(currentTask.checklist_partial_percent))
            ? Number(currentTask.checklist_partial_percent)
            : snapshot?.checklist_partial_percent != null && Number.isFinite(Number(snapshot.checklist_partial_percent))
                ? Number(snapshot.checklist_partial_percent)
                : null;
        const checkedCount = Number.isFinite(Number(currentTask?.checklist_checked_count))
            ? Number(currentTask.checklist_checked_count)
            : Number.isFinite(Number(snapshot?.checklist_checked_count))
                ? Number(snapshot.checklist_checked_count)
                : 0;
        if (analysis?.has_new_progress || (partialPercent != null && partialPercent > 0) || checkedCount > 0) {
            return { status: 'partial', label: '部分完成' };
        }

        return { status: 'incomplete', label: '未完成' };
    },

    withJournalTaskCompletionStatus(snapshot, currentTask = null, analysis = null, journalDate = null) {
        const completion = this.getJournalTaskCompletionStatus(snapshot, currentTask, analysis, journalDate);
        return {
            ...snapshot,
            journal_status: completion.status,
            journal_status_label: completion.label
        };
    },

    getJournalSnapshotForTask(journal, taskId) {
        const id = String(taskId);
        const candidates = [
            ...(journal?.planned_task_snapshots || []),
            ...(journal?.daily_pool_snapshots || [])
        ];
        return candidates.find(snapshot => String(snapshot.id) === id) || null;
    },

    analyzeJournalChecklistProgress(snapshot, currentTask, journalDate) {
        const taskId = currentTask?.id ?? snapshot?.id ?? null;
        const current = this.createJournalChecklistBaseline(currentTask || {});
        const hasChecklistBaseline = snapshot != null
            && Object.prototype.hasOwnProperty.call(snapshot, 'checklist_checked_count')
            && Array.isArray(snapshot.checklist_checked_ids);
        const completedToday = this.getLocalDateFromISO(currentTask?.completed_at) === journalDate;
        const wasCompletedAtSnapshot = snapshot?.progress === 'completed'
            || this.getLocalDateFromISO(snapshot?.completed_at) === journalDate;

        if (!hasChecklistBaseline) {
            return {
                task_id: taskId,
                title: currentTask?.title || snapshot?.title || '',
                has_checklist_baseline: false,
                has_new_progress: completedToday && !wasCompletedAtSnapshot,
                progress_source: completedToday && !wasCompletedAtSnapshot ? 'completion_only' : 'no_checklist_baseline',
                completed_today: completedToday
            };
        }

        const baselineCheckedIds = new Set((snapshot.checklist_checked_ids || []).map(String));
        const currentCheckedIds = new Set((current.checklist_checked_ids || []).map(String));
        const newlyCheckedIds = [...currentCheckedIds].filter(id => !baselineCheckedIds.has(id));
        const uncheckedBaselineIds = [...baselineCheckedIds].filter(id => !currentCheckedIds.has(id));
        const baselinePartial = snapshot.checklist_partial_percent != null && Number.isFinite(Number(snapshot.checklist_partial_percent))
            ? Number(snapshot.checklist_partial_percent)
            : null;
        const currentPartial = current.checklist_partial_percent != null && Number.isFinite(Number(current.checklist_partial_percent))
            ? Number(current.checklist_partial_percent)
            : null;
        const checkedCountIncreased = current.checklist_checked_count > (snapshot.checklist_checked_count || 0);
        const partialIncreased = currentPartial != null
            && (baselinePartial == null || currentPartial > baselinePartial);
        const checklistStructureChanged = current.checklist_fingerprint !== (snapshot.checklist_fingerprint || null);
        const checklistRegressed = current.checklist_checked_count < (snapshot.checklist_checked_count || 0)
            || uncheckedBaselineIds.length > 0
            || (currentPartial != null && baselinePartial != null && currentPartial < baselinePartial);
        const hasNewProgress = newlyCheckedIds.length > 0
            || checkedCountIncreased
            || partialIncreased
            || (completedToday && !wasCompletedAtSnapshot);

        return {
            task_id: taskId,
            title: currentTask?.title || snapshot?.title || '',
            has_checklist_baseline: true,
            has_new_progress: hasNewProgress,
            progress_source: hasNewProgress ? 'checklist_or_completion' : 'none',
            completed_today: completedToday,
            checked_count_before: snapshot.checklist_checked_count || 0,
            checked_count_now: current.checklist_checked_count,
            checklist_total_before: snapshot.checklist_total_count || 0,
            checklist_total_now: current.checklist_total_count,
            newly_checked_ids: newlyCheckedIds,
            unchecked_baseline_ids: uncheckedBaselineIds,
            partial_percent_before: baselinePartial,
            partial_percent_now: currentPartial,
            partial_percent_increased: partialIncreased,
            checklist_structure_changed: checklistStructureChanged,
            checklist_regressed: checklistRegressed
        };
    },

    buildDailyJournalPoolSnapshot(tasks, date, referenceDate = new Date(`${date}T12:00:00`)) {
        return (tasks || [])
            .filter(task => task.progress !== 'completed')
            .filter(task => task.start_date == null || task.start_date <= date)
            .filter(task => task.deferred_until == null || new Date(task.deferred_until) <= referenceDate)
            .map(task => this.createJournalTaskSnapshot(task));
    },

    getDailyJournalScheduling() {
        return globalThis.TimeWhereScheduling || null;
    },

    getDailyJournalContainersForDate(containers = [], date, scheduling = this.getDailyJournalScheduling()) {
        if (!scheduling?.containerAppliesToDate) return [];
        const dateObj = new Date(`${date}T00:00:00`);
        const dow = dateObj.getDay();
        const isWeekday = dow >= 1 && dow <= 5;
        const isWeekend = dow === 0 || dow === 6;
        return (containers || [])
            .filter(container => container?.enabled !== false)
            .filter(container => scheduling.containerAppliesToDate(container, dateObj, date, dow, isWeekday, isWeekend));
    },

    buildDailyJournalSettleSnapshot(tasks, containers, date, referenceDate = new Date(`${date}T00:00:00`)) {
        const scheduling = this.getDailyJournalScheduling();
        if (!scheduling?.buildDailyTaskPool || !scheduling?.dailySettle) {
            return this.buildDailyJournalPoolSnapshot(tasks, date, referenceDate);
        }
        const taskPool = scheduling.buildDailyTaskPool(tasks || [], referenceDate);
        const todayContainers = this.getDailyJournalContainersForDate(containers || [], date, scheduling);
        const settle = scheduling.dailySettle(taskPool, todayContainers, referenceDate);
        const displayTasks = settle?.displayTasks || settle?.currentTasks || taskPool;
        return displayTasks.map(task => this.createJournalTaskSnapshot(task));
    },

    buildDailyJournalExtraTaskSnapshots(tasks, plannedIds, snapshotAt) {
        const snapshotTime = snapshotAt ? new Date(snapshotAt).getTime() : null;
        if (!Number.isFinite(snapshotTime)) return [];
        return (tasks || [])
            .filter(task => !plannedIds.has(String(task.id)))
            .filter(task => {
                const createdTime = new Date(task.created_at || task.createdAt || 0).getTime();
                return Number.isFinite(createdTime) && createdTime > snapshotTime;
            })
            .map(task => this.createJournalTaskSnapshot(task));
    },

    buildDailyJournalCompletionSnapshots(journal, tasks, journalDate) {
        const taskById = new Map((tasks || []).map(task => [String(task.id), task]));
        const plannedSnapshots = Array.isArray(journal?.planned_task_snapshots) ? journal.planned_task_snapshots : [];
        const plannedIds = new Set(plannedSnapshots.map(task => String(task.id)));
        const plannedCompletion = plannedSnapshots.map(snapshot => {
            const current = taskById.get(String(snapshot.id)) || null;
            const analysis = this.analyzeJournalChecklistProgress(snapshot, current || snapshot, journalDate);
            return this.withJournalTaskCompletionStatus(snapshot, current, analysis, journalDate);
        });
        const extraCompletion = this.buildDailyJournalExtraTaskSnapshots(tasks, plannedIds, journal?.snapshot_at)
            .map(snapshot => {
                const current = taskById.get(String(snapshot.id)) || null;
                return this.withJournalTaskCompletionStatus(snapshot, current, null, journalDate);
            });
        return {
            completion_task_snapshots: plannedCompletion,
            completion_extra_task_snapshots: extraCompletion
        };
    },

    async getDailyJournal(date) {
        const journalDate = this.getDailyJournalDate(date);
        return await db.daily_journals.get(journalDate) || null;
    },

    async listDailyJournals() {
        const rows = await db.daily_journals.toArray();
        return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    },

    async ensureDailyJournalSnapshot(date = new Date(), referenceDate = new Date(), options = {}) {
        const journalDate = this.getDailyJournalDate(date);
        const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

        const existing = await this.getDailyJournal(journalDate);
        if (existing?.snapshot_at && Array.isArray(existing.planned_task_snapshots)) {
            return { status: 'exists', date: journalDate, journal: existing };
        }

        const now = this.getNowISO();
        const tasks = await this.getAllTasks();
        const containers = await this.getContainers({ enabled: true });
        const planned = this.buildDailyJournalSettleSnapshot(tasks, containers, journalDate, ref);
        const dailyPool = this.buildDailyJournalPoolSnapshot(tasks, journalDate, ref);
        const journal = {
            ...(existing || {}),
            date: journalDate,
            status: existing?.status || 'snapshot',
            planned_task_snapshots: planned,
            daily_pool_snapshots: dailyPool,
            completed_task_snapshots: existing?.completed_task_snapshots || [],
            delayed_task_snapshots: existing?.delayed_task_snapshots || [],
            extra_done_task_snapshots: existing?.extra_done_task_snapshots || [],
            planned_notes: existing?.planned_notes || '',
            delayed_notes: existing?.delayed_notes || '',
            extra_done_notes: existing?.extra_done_notes || '',
            general_notes: existing?.general_notes || '',
            snapshot_at: now,
            created_at: existing?.created_at || now,
            updated_at: now,
            submitted_at: existing?.submitted_at || null
        };
        await db.daily_journals.put(journal);
        await this.markGoogleSyncDirty('daily_journals', journal.date, journal, options);
        return { status: 'created', date: journalDate, journal };
    },

    async ensureDailyJournalCompletionSnapshot(date = new Date(), referenceDate = new Date(), options = {}) {
        const journalDate = this.getDailyJournalDate(date);
        let journal = await this.getDailyJournal(journalDate);
        if (!journal?.snapshot_at || !Array.isArray(journal.planned_task_snapshots)) {
            journal = (await this.ensureDailyJournalSnapshot(journalDate, new Date(`${journalDate}T23:59:00`), options)).journal;
        }
        if (journal?.completion_snapshot_at && Array.isArray(journal.completion_task_snapshots)) {
            return { status: 'exists', date: journalDate, journal };
        }

        const tasks = await this.getAllTasks();
        const now = this.getNowISO();
        const completion = this.buildDailyJournalCompletionSnapshots(journal, tasks, journalDate);
        const updated = {
            ...journal,
            ...completion,
            completion_snapshot_at: referenceDate instanceof Date ? referenceDate.toISOString() : new Date(referenceDate).toISOString(),
            updated_at: now
        };
        await db.daily_journals.put(updated);
        await this.markGoogleSyncDirty('daily_journals', updated.date, updated, options);
        return { status: 'created', date: journalDate, journal: updated };
    },

    async buildDailyJournalDraft(date = new Date(), referenceDate = new Date()) {
        const journalDate = this.getDailyJournalDate(date);
        let journal = await this.getDailyJournal(journalDate);
        if (!journal) {
            journal = (await this.ensureDailyJournalSnapshot(journalDate, referenceDate)).journal;
        }
        const tasks = await this.getAllTasks();
        const taskById = new Map(tasks.map(task => [String(task.id), task]));
        const plannedSnapshots = journal?.planned_task_snapshots || [];
        const plannedIds = new Set(plannedSnapshots.map(task => String(task.id)));
        const progressAnalyses = tasks.map(task => {
            const snapshot = this.getJournalSnapshotForTask(journal, task.id);
            return this.analyzeJournalChecklistProgress(snapshot, task, journalDate);
        });
        const completed = tasks
            .filter(task => this.getLocalDateFromISO(task.completed_at) === journalDate)
            .map(task => this.createJournalTaskSnapshot(task));
        const completedPlanned = completed.filter(snapshot => plannedIds.has(String(snapshot.id)));
        const completedIds = new Set(completed.map(task => String(task.id)));
        const delayed = plannedSnapshots.filter(snapshot => {
            const current = taskById.get(String(snapshot.id));
            if (!current) return true;
            return current.progress !== 'completed' && this.getLocalDateFromISO(current.completed_at) !== journalDate;
        });
        const extraTasks = this.buildDailyJournalExtraTaskSnapshots(tasks, plannedIds, journal?.snapshot_at);
        const progressByTaskId = new Map(progressAnalyses.map(analysis => [String(analysis.task_id), analysis]));
        const completionByTaskId = new Map((journal?.completion_task_snapshots || []).map(snapshot => [String(snapshot.id), snapshot]));
        const extraCompletionByTaskId = new Map((journal?.completion_extra_task_snapshots || []).map(snapshot => [String(snapshot.id), snapshot]));
        const plannedReviewSnapshots = plannedSnapshots.map(snapshot => {
            const frozen = completionByTaskId.get(String(snapshot.id));
            if (frozen) return frozen;
            const current = taskById.get(String(snapshot.id)) || null;
            return this.withJournalTaskCompletionStatus(snapshot, current, progressByTaskId.get(String(snapshot.id)), journalDate);
        });
        const extraReviewSnapshots = extraTasks.map(snapshot => {
            const frozen = extraCompletionByTaskId.get(String(snapshot.id));
            if (frozen) return frozen;
            const current = taskById.get(String(snapshot.id)) || null;
            return this.withJournalTaskCompletionStatus(snapshot, current, null, journalDate);
        });
        return {
            ...(journal || {}),
            date: journalDate,
            status: journal?.status || 'snapshot',
            planned_task_snapshots: plannedReviewSnapshots,
            daily_pool_snapshots: journal?.daily_pool_snapshots || this.buildDailyJournalPoolSnapshot(tasks, journalDate, referenceDate),
            completed_task_snapshots: completedPlanned,
            all_completed_task_snapshots: completed,
            delayed_task_snapshots: delayed,
            extra_done_task_snapshots: extraReviewSnapshots,
            task_progress_analyses: progressAnalyses,
            progressed_task_ids: progressAnalyses
                .filter(analysis => analysis.has_new_progress)
                .map(analysis => String(analysis.task_id)),
            completed_planned_count: completedPlanned.length,
            completed_count: completed.length,
            delayed_count: delayed.length,
            extra_done_count: extraTasks.length,
            planned_count: plannedSnapshots.length,
            completed_ids: Array.from(completedIds)
        };
    },

    async saveDailyJournalDraft(date, data = {}, options = {}) {
        const journalDate = this.getDailyJournalDate(date);
        const base = await this.buildDailyJournalDraft(journalDate);
        const now = this.getNowISO();
        const journal = {
            ...base,
            planned_notes: data.planned_notes ?? base.planned_notes ?? '',
            delayed_notes: data.delayed_notes ?? base.delayed_notes ?? '',
            extra_done_notes: data.extra_done_notes ?? base.extra_done_notes ?? '',
            general_notes: data.general_notes ?? base.general_notes ?? '',
            status: base.status === 'submitted' ? 'submitted' : 'draft',
            created_at: base.created_at || now,
            updated_at: now,
            submitted_at: base.submitted_at || null
        };
        await db.daily_journals.put(journal);
        await this.markGoogleSyncDirty('daily_journals', journal.date, journal, options);
        return journal;
    },

    async submitDailyJournal(date, data = {}, options = {}) {
        const draft = await this.saveDailyJournalDraft(date, data, options);
        const now = this.getNowISO();
        const journal = {
            ...draft,
            status: 'submitted',
            submitted_at: now,
            updated_at: now
        };
        await db.daily_journals.put(journal);
        await this.markGoogleSyncDirty('daily_journals', journal.date, journal, options);
        return journal;
    },

    // ========== Containers ==========
    async getContainers(filter = {}) {
        let collection = db.containers.orderBy('name');
        
        if (filter.enabled !== undefined) {
            collection = collection.filter(c => c.enabled === filter.enabled);
        }
        if (filter.repeat) {
            collection = collection.filter(c => c.repeat === filter.repeat);
        }
        
        return await collection.toArray();
    },

    async getContainerById(id) {
        return await db.containers.get(id);
    },

    async addContainer(container) {
        const now = this.getNowISO();
        const newContainer = {
            id: this.generateId(),
            name: container.name || '新容器',
            color: container.color || '#4A90D9',
            time_start: container.time_start || '18:30',
            time_end: container.time_end || '21:30',
            repeat: container.repeat || 'weekday',
            repeat_days: container.repeat_days ?? null,
            monthly_week: container.monthly_week ?? null,
            monthly_dow: container.monthly_dow ?? null,
            yearly_month: container.yearly_month ?? null,
            yearly_dom: container.yearly_dom ?? null,
            task_types: container.task_types || ['homework', 'test', 'ia', 'notes'],
            subjects: container.subjects || null,
            defense: container.defense || 'soft',
            squeezing: container.squeezing || 'p1_only',
            layer: container.layer ?? null,
            enabled: true,
            google_calendar_event_id: null,
            created_at: now,
            updated_at: now
        };
        
        await db.containers.add(newContainer);
        await this.addSyncLog('container', 'create', newContainer);
        await this.markGoogleSyncDirty('containers', newContainer.id, newContainer);
        return newContainer;
    },

    async updateContainer(id, data) {
        const updateData = {
            ...data,
            updated_at: this.getNowISO()
        };
        
        await db.containers.update(id, updateData);
        const updatedContainer = await db.containers.get(id);
        await this.addSyncLog('container', 'update', updatedContainer);
        await this.markGoogleSyncDirty('containers', id, updatedContainer);
        return updatedContainer;
    },

    async deleteContainer(id) {
        const container = await db.containers.get(id);
        await db.containers.delete(id);
        await this.addSyncLog('container', 'delete', container);
        await this.markGoogleSyncDeleted('containers', id, container);
    },

    async toggleContainerEnabled(id) {
        const container = await db.containers.get(id);
        return await this.updateContainer(id, { enabled: !container.enabled });
    },

    // ========== Events ==========
    async getEvents(filter = {}) {
        let collection = db.events.orderBy('date');
        
        if (filter.date) {
            collection = collection.filter(e => e.date === filter.date);
        }
        if (filter.container_id) {
            collection = collection.filter(e => e.container_id === filter.container_id);
        }
        
        return await collection.toArray();
    },

    async getEventById(id) {
        return await db.events.get(id);
    },

    async getEventsByDateRange(startDate, endDate) {
        const allEvents = await db.events.orderBy('date').toArray();
        return allEvents.filter(e => e.date >= startDate && e.date <= endDate);
    },

    async addEvent(event) {
        const now = this.getNowISO();
        const newEvent = {
            id: this.generateId(),
            title: event.title || '新事件',
            subject_in_matrixview: event.subject_in_matrixview || event.subject || null,
            date: event.date || this.formatDateISO(new Date()),
            time_start: event.time_start ?? '09:00',
            time_end: event.time_end ?? '10:00',
            color: event.color || '#4A90D9',
            description: event.description || null,
            repeat: event.repeat || 'none',
            repeat_days: event.repeat_days ?? null,
            monthly_week: event.monthly_week ?? null,
            monthly_dow: event.monthly_dow ?? null,
            yearly_month: event.yearly_month ?? null,
            yearly_dom: event.yearly_dom ?? null,
            once_date: event.once_date ?? null,
            source: event.source || 'manual',
            container_id: event.container_id || null,
            google_calendar_event_id: null,
            created_at: now,
            updated_at: now
        };
        
        await db.events.add(newEvent);
        await this.addSyncLog('event', 'create', newEvent);
        await this.markGoogleSyncDirty('events', newEvent.id, newEvent);
        if (newEvent.source === 'timetable') {
            await this.markTaskArrangeDirty('timetable_event_created');
        }
        return newEvent;
    },

    async updateEvent(id, data) {
        const updateData = {
            ...data,
            updated_at: this.getNowISO()
        };
        
        await db.events.update(id, updateData);
        const updatedEvent = await db.events.get(id);
        await this.addSyncLog('event', 'update', updatedEvent);
        await this.markGoogleSyncDirty('events', id, updatedEvent);
        if (updatedEvent?.source === 'timetable') {
            await this.markTaskArrangeDirty('timetable_event_updated');
        }
        return updatedEvent;
    },

    async deleteEvent(id) {
        const event = await db.events.get(id);
        await db.events.delete(id);
        await this.addSyncLog('event', 'delete', event);
        await this.markGoogleSyncDeleted('events', id, event);
        if (event?.source === 'timetable') {
            await this.markTaskArrangeDirty('timetable_event_deleted');
        }
    },

    // ========== Habits ==========
    async getHabits() {
        const habits = await db.habits.toArray();
        return habits.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    },

    async getHabitById(id) {
        return await db.habits.get(id);
    },

    async addHabit(habit) {
        const now = this.getNowISO();
        const newHabit = {
            id: this.generateId(),
            title: habit.title || '',
            description: habit.description || '',
            frequency: habit.frequency || 'daily',
            target_count: habit.target_count || 1,
            repeat_days: habit.repeat_days || null,
            completed_count: 0,
            streak: 0,
            best_streak: 0,
            status_today: 'pending',
            container_id: habit.container_id || null,
            total_completed: 0,
            last_completed: null,
            created_at: now,
            updated_at: now
        };
        
        await db.habits.add(newHabit);
        await this.markGoogleSyncDirty('habits', newHabit.id, newHabit);
        return newHabit;
    },

    async updateHabit(id, data) {
        const updateData = {
            ...data,
            updated_at: this.getNowISO()
        };
        
        await db.habits.update(id, updateData);
        const updated = await db.habits.get(id);
        await this.markGoogleSyncDirty('habits', id, updated);
        return updated;
    },

    async completeHabit(id) {
        const habit = await db.habits.get(id);
        const now = this.getNowISO();
        const today = now.split('T')[0];
        
        let newStreak = habit.streak;
        const lastCompleted = habit.last_completed ? habit.last_completed.split('T')[0] : null;
        
        if (lastCompleted !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = this.formatDateISO(yesterday);
            
            if (lastCompleted === yesterdayStr) {
                newStreak = habit.streak + 1;
            } else if (lastCompleted !== today) {
                newStreak = 1;
            }
        }
        
        const bestStreak = Math.max(newStreak, habit.best_streak);
        
        return await this.updateHabit(id, {
            completed_count: habit.completed_count + 1,
            streak: newStreak,
            best_streak: bestStreak,
            status_today: 'done',
            total_completed: habit.total_completed + 1,
            last_completed: now
        });
    },

    async resetDailyHabits() {
        const habits = await db.habits.toArray();
        for (const habit of habits) {
            if (habit.status_today !== 'done') {
                await db.habits.update(habit.id, {
                    status_today: 'pending',
                    completed_count: 0,
                    streak: 0
                });
            }
        }
    },

    // ========== Settings ==========
    async getSetting(key) {
        const result = await db.settings.get(key);
        return result ? result.value : null;
    },

    async setSetting(key, value) {
        await db.settings.put({ key: key, value: value });
        if (this.getGoogleSyncApi()?.SELECTED_SETTING_KEYS?.includes(key)) {
            await this.markGoogleSyncDirty('settings', key, { key, value });
        }
    },

    async getSettings() {
        const all = await db.settings.toArray();
        const settings = {};
        for (const item of all) {
            settings[item.key] = item.value;
        }
        return settings;
    },

    async initDefaultSettings() {
        try {
            const defaults = {
                initialized: false,
                first_launch: null,
                google_connected: false,
                google_email: null,
                access_token: null,
                refresh_token: null,
                sync_enabled: false,
                sync_interval: 5,
                last_sync: null,
                pomodoro_work: 25,
                pomodoro_break: 5,
                pomodoro_long_break: 15,
                pomodoro_interval: 4,
                theme: 'light',
                start_week_on: 1,
                notification_enabled: true,
                reminder_before: 15,
                arrange_trigger: 'manual',
                defensive_threshold: 24,
                heal_time: '23:00',
                default_duration: 45,
                default_priority: 'medium',
                appearance_background: 'calm',
                appearance_avatar: 'default',
                task_arrange_last_run_at: null
            };
            
            for (const [key, value] of Object.entries(defaults)) {
                const existing = await db.settings.get(key);
                if (!existing) {
                    await db.settings.put({ key: key, value: value });
                }
            }

            await this.ensureBucketTemplatesForExistingPlans();
            await this.backfillMatrixViewSubjectIds({ source: 'init_default_settings' });
            
            return defaults;
        } catch(e) {
            console.warn('[DB] initDefaultSettings skipped:', e.message || e);
            return null;
        }
    },

    // ========== Sync Log ==========
    async addSyncLog(type, action, data) {
        await db.sync_log.add({
            type: type,
            action: action,
            entity_id: data ? data.id : null,
            data: JSON.stringify(data),
            timestamp: this.getNowISO(),
            synced: false
        });
    },

    async getPendingSyncLogs() {
        const logs = await db.sync_log.toArray();
        return logs.filter(log => log.synced === false);
    },

    async clearSyncLog(id) {
        await db.sync_log.delete(id);
    },

    async markSynced(ids) {
        for (const id of ids) {
            await db.sync_log.update(id, { synced: true });
        }
    },

    // ========== Utility ==========
    async clearAllData() {
        await db.plans.clear();
        await db.buckets.clear();
        await db.labels.clear();
        await db.tasks.clear();
        await db.containers.clear();
        await db.habits.clear();
        await db.events.clear();
        await db.daily_journals.clear();
        await db.sync_log.clear();
    },

    async getDatabaseInfo() {
        return {
            plans: await db.plans.count(),
            buckets: await db.buckets.count(),
            labels: await db.labels.count(),
            tasks: await db.tasks.count(),
            containers: await db.containers.count(),
            habits: await db.habits.count(),
            events: await db.events.count(),
            daily_journals: await db.daily_journals.count(),
            settings: await db.settings.count(),
            sync_logs: await db.sync_log.count()
        };
    },

    async exportAllData() {
        const data = {
            _meta: { version: 1, exported_at: new Date().toISOString(), app: 'TimeWhere' }
        };
        data.plans = await db.plans.toArray();
        data.buckets = await db.buckets.toArray();
        data.labels = await db.labels.toArray();
        data.tasks = await db.tasks.toArray();
        data.containers = await db.containers.toArray();
        data.habits = await db.habits.toArray();
        data.events = await db.events.toArray();
        data.daily_journals = await db.daily_journals.toArray();
        data.settings = await db.settings.toArray();
        return data;
    },

    async importAllData(data) {
        if (!data || typeof data !== 'object') throw new Error('Invalid backup format');
        const tables = ['plans', 'buckets', 'labels', 'tasks', 'containers', 'habits', 'events', 'daily_journals', 'settings'];
        for (const table of tables) {
            if (!Array.isArray(data[table])) continue;
            await db[table].clear();
            if (data[table].length > 0) {
                await db[table].bulkAdd(data[table]);
            }
        }
    }
};

window.TimeWhereDB = TimeWhereDB;
