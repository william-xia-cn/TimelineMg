/**
 * TimeWhere Storage Layer - IndexedDB + Dexie.js
 * 版本: v3.0 (Planner architecture)
 * 日期: 2026-04-14
 */

console.log('[DB] Loading db.js...');

const db = new Dexie('TimeWhere');
console.log('[DB] Dexie db created:', db.name);

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
    console.log('[DB] Running v4 migration...');

    // 1. Create default plan
    const defaultPlanId = await tx.table('plans').add({
        name: 'My Tasks',
        color: '#2b56e3',
        icon_char: '✓',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });
    console.log('[DB] Created default plan, id:', defaultPlanId);

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
    console.log('[DB] Migrated buckets:', bucketValueToId);

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

    console.log('[DB] v4 migration complete. Migrated', existingTasks.length, 'tasks');
});

console.log('[DB] Schema defined (v2 → v3 → v4)');

const TimeWhereDB = {
    db: db,

    generateId: () => {
        return crypto.randomUUID();
    },

    getNowISO: () => new Date().toISOString(),

    // ========== Plans ==========
    async getPlans() {
        return await db.plans.orderBy('created_at').toArray();
    },

    async getPlanById(id) {
        return await db.plans.get(id);
    },

    async addPlan(plan) {
        const now = this.getNowISO();
        const newPlan = {
            name: plan.name || 'New Plan',
            color: plan.color || '#2b56e3',
            icon_char: plan.icon_char || plan.name ? plan.name.charAt(0) : 'P',
            created_at: now,
            updated_at: now
        };
        const id = await db.plans.add(newPlan);
        return { ...newPlan, id };
    },

    async updatePlan(id, data) {
        const updateData = { ...data, updated_at: this.getNowISO() };
        await db.plans.update(id, updateData);
        return await db.plans.get(id);
    },

    async deletePlan(id) {
        // Cascade: delete buckets, labels, and tasks belonging to this plan
        await db.buckets.where('plan_id').equals(id).delete();
        await db.labels.where('plan_id').equals(id).delete();
        await db.tasks.where('plan_id').equals(id).delete();
        await db.plans.delete(id);
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
        return { ...newBucket, id };
    },

    async updateBucket(id, data) {
        await db.buckets.update(id, data);
        return await db.buckets.get(id);
    },

    async deleteBucket(id) {
        // Unlink tasks that reference this bucket
        const tasks = await db.tasks.where('bucket_id').equals(id).toArray();
        for (const t of tasks) {
            await db.tasks.update(t.id, { bucket_id: null });
        }
        await db.buckets.delete(id);
    },

    async reorderBuckets(planId, orderedIds) {
        for (let i = 0; i < orderedIds.length; i++) {
            await db.buckets.update(orderedIds[i], { sort_order: i });
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
        return { ...newLabel, id };
    },

    async updateLabel(id, data) {
        await db.labels.update(id, data);
        return await db.labels.get(id);
    },

    async deleteLabel(id) {
        // Remove this label ID from all tasks' labels arrays
        const allTasks = await db.tasks.toArray();
        for (const t of allTasks) {
            if (t.labels && t.labels.includes(id)) {
                const newLabels = t.labels.filter(lid => lid !== id);
                await db.tasks.update(t.id, { labels: newLabels });
            }
        }
        await db.labels.delete(id);
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

    async addTask(task) {
        const now = this.getNowISO();
        const progressVal = task.progress || 'not_started';
        const newTask = {
            // Use UUID for consistency with existing tasks
            id: this.generateId(),
            // Core Planner fields
            title: task.title || '',
            plan_id: task.plan_id,
            bucket_id: task.bucket_id || null,
            progress: progressVal,
            priority: task.priority || 'medium',
            start_date: task.start_date || null,
            due_date: task.due_date || null,
            labels: task.labels || [],
            notes: task.notes || '',
            checklist: task.checklist || [],
            // Legacy / extended fields (kept for compat with focus/popup)
            description: task.description || task.notes || '',
            duration: task.duration || null,
            deadline: task.due_date || task.deadline || null,
            deadline_time: task.deadline_time || null,
            subject: task.subject || null,
            bucket: task.bucket || null,
            status: progressVal === 'completed' ? 'completed' : (progressVal === 'in_progress' ? 'in_progress' : 'pending'),
            completed_at: null,
            container_id: task.container_id || null,
            google_task_id: null,
            created_at: now,
            updated_at: now
        };

        await db.tasks.add(newTask);
        await this.addSyncLog('task', 'create', newTask);
        return newTask;
    },

    async updateTask(id, data) {
        const updateData = {
            ...data,
            updated_at: this.getNowISO()
        };
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

        await db.tasks.update(id, updateData);
        const updatedTask = await db.tasks.get(id);
        await this.addSyncLog('task', 'update', updatedTask);
        return updatedTask;
    },

    async deleteTask(id) {
        const task = await db.tasks.get(id);
        await db.tasks.delete(id);
        await this.addSyncLog('task', 'delete', task);
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
        const today = new Date().toISOString().split('T')[0];
        const allTasks = await db.tasks.toArray();
        return allTasks.filter(t => t.completed_at && t.completed_at.startsWith(today)).length;
    },

    async getPendingCount() {
        const allTasks = await db.tasks.toArray();
        return allTasks.filter(t => t.progress === 'not_started' || t.progress === 'in_progress').length;
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
            enabled: true,
            google_calendar_event_id: null,
            created_at: now,
            updated_at: now
        };
        
        console.log('[DB] Adding container:', newContainer.name, newContainer.time_start, newContainer.repeat);
        await db.containers.add(newContainer);
        await this.addSyncLog('container', 'create', newContainer);
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
        return updatedContainer;
    },

    async deleteContainer(id) {
        const container = await db.containers.get(id);
        await db.containers.delete(id);
        await this.addSyncLog('container', 'delete', container);
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
            date: event.date || new Date().toISOString().split('T')[0],
            time_start: event.time_start || '09:00',
            time_end: event.time_end || '10:00',
            color: event.color || '#4A90D9',
            description: event.description || null,
            source: event.source || 'manual',
            container_id: event.container_id || null,
            google_calendar_event_id: null,
            created_at: now,
            updated_at: now
        };
        
        await db.events.add(newEvent);
        await this.addSyncLog('event', 'create', newEvent);
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
        return updatedEvent;
    },

    async deleteEvent(id) {
        const event = await db.events.get(id);
        await db.events.delete(id);
        await this.addSyncLog('event', 'delete', event);
    },

    // ========== Habits ==========
    async getHabits() {
        return await db.habits.orderBy('created_at').reverse().toArray();
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
        return newHabit;
    },

    async updateHabit(id, data) {
        const updateData = {
            ...data,
            updated_at: this.getNowISO()
        };
        
        await db.habits.update(id, updateData);
        return await db.habits.get(id);
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
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
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
                reminder_before: 15
            };
            
            for (const [key, value] of Object.entries(defaults)) {
                const existing = await db.settings.get(key);
                if (!existing) {
                    await db.settings.put({ key: key, value: value });
                }
            }
            
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
        return await db.sync_log.where('synced').equals(false).toArray();
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
            settings: await db.settings.count(),
            sync_logs: await db.sync_log.count()
        };
    }
};

console.log('[DB] TimeWhereDB defined, assigning to window...');
window.TimeWhereDB = TimeWhereDB;
console.log('[DB] Done! TimeWhereDB on window:', typeof window.TimeWhereDB);