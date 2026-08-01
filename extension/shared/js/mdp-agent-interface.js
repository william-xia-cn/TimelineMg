/**
 * TimeWhere MDP Agent Interface.
 * Minimal Data Protocol for agent-facing task CRUD and local summaries.
 */
(function initTimeWhereMDPAgentInterface(global) {
    'use strict';

    const MDP_AGENT_SCHEMA = 'timewhere-mdp-agent-v1';
    const IDEMPOTENCY_SETTING_KEY = 'mcp_idempotency_log';
    const AUDIT_SETTING_KEY = 'mcp_audit_log';
    const IDEMPOTENCY_LIMIT = 100;
    const AUDIT_LIMIT = 100;
    const DEFAULT_CURRENT_LIMIT = 5;
    const DEFAULT_UPCOMING_LIMIT = 20;
    const ALLOWED_PROGRESS_VALUES = new Set(['not_started', 'in_progress', 'completed']);
    const ALLOWED_PRIORITY_VALUES = new Set(['urgent', 'important', 'medium', 'low', 'P1', 'P2', 'P3', 'P4']);
    const MUTATING_ACTIONS = new Set([
        'task.create_manual',
        'task.update',
        'task.delete',
        'task.update_progress',
        'task.start',
        'task.complete',
        'task.reopen'
    ]);
    const TASK_PATCH_ALLOWLIST = new Set([
        'title',
        'start_date',
        'arranged_date',
        'due_date',
        'deadline',
        'schedule_time',
        'duration',
        'priority',
        'progress',
        'status',
        'notes',
        'description',
        'checklist',
        'labels',
        'bucket_id',
        'plan_id'
    ]);

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function nowISO(now = new Date()) {
        const date = now instanceof Date ? now : new Date(now);
        return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function formatDateISO(date) {
        const value = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(value.getTime())) return formatDateISO(new Date());
        return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    }

    function isIsoDate(value) {
        return value == null || value === '' || /^\d{4}-\d{2}-\d{2}$/.test(String(value));
    }

    function isCompleted(task = {}) {
        return task.progress === 'completed' || task.status === 'completed';
    }

    function isCompletedToday(task = {}, todayStr) {
        const completedAt = task.completed_at || task.completedAt || '';
        return isCompleted(task) && String(completedAt).slice(0, 10) === todayStr;
    }

    function getTaskDateKey(task = {}) {
        return task.arranged_date || task.start_date || task.due_date || task.deadline || '';
    }

    function normalizeProgress(value) {
        const raw = String(value || '').trim();
        if (raw === 'pending') return 'not_started';
        if (!ALLOWED_PROGRESS_VALUES.has(raw)) throw new Error('Invalid task progress');
        return raw;
    }

    function normalizePriority(value, fallback = 'medium') {
        const raw = String(value || fallback).trim();
        if (!ALLOWED_PRIORITY_VALUES.has(raw)) throw new Error('Invalid task priority');
        const map = { P1: 'urgent', P2: 'important', P3: 'medium', P4: 'low' };
        return map[raw] || raw;
    }

    function getPlanName(task = {}, planById = new Map()) {
        const plan = task.plan_id != null ? planById.get(String(task.plan_id)) : null;
        return plan?.name || task.plan_name || task.planName || '';
    }

    function taskBaseSummary(task = {}, planById = new Map()) {
        const assignment = task.assignment || {};
        return {
            id: String(task.id || ''),
            title: String(task.title || '无标题任务').slice(0, 200),
            plan_id: task.plan_id ?? null,
            plan_name: String(getPlanName(task, planById)).slice(0, 100),
            bucket_id: task.bucket_id ?? null,
            start_date: task.start_date || null,
            arranged_date: task.arranged_date || null,
            due_date: task.due_date || task.deadline || null,
            schedule_time: task.schedule_time || null,
            duration: Number.isFinite(Number(task.duration)) ? Number(task.duration) : 45,
            priority: task.priority || 'medium',
            progress: task.progress || task.status || 'not_started',
            source: task.source || task.source_type || 'manual',
            readonly: task.readonly === true,
            notes: String(task.notes ?? task.description ?? '').slice(0, 5000),
            assignment_label: assignment.label || assignment.container_name || assignment.status || ''
        };
    }

    function sanitizeTask(task = {}, planById = new Map()) {
        return taskBaseSummary(task, planById);
    }

    function sanitizeTaskDetail(task = {}, planById = new Map()) {
        return {
            ...taskBaseSummary(task, planById),
            description: String(task.description ?? task.notes ?? '').slice(0, 5000),
            checklist: Array.isArray(task.checklist) ? clone(task.checklist).slice(0, 100) : [],
            labels: Array.isArray(task.labels) ? clone(task.labels).slice(0, 50) : [],
            completed_at: task.completed_at || null,
            created_at: task.created_at || null,
            updated_at: task.updated_at || null,
            recurrence_series_id: task.recurrence_series_id || null,
            recurrence_index: task.recurrence_index || null,
            recurrence_count: task.recurrence_count || null
        };
    }

    function sanitizeEvent(event = {}) {
        return {
            id: String(event.id || ''),
            title: String(event.title || '无标题日程').slice(0, 160),
            date: event.date || null,
            time_start: event.time_start || null,
            time_end: event.time_end || null,
            repeat: event.repeat || 'none',
            source: event.source || 'manual',
            container_id: event.container_id || null
        };
    }

    function sanitizeContainer(container = {}) {
        return {
            id: String(container.id || ''),
            name: String(container.name || '未命名容器').slice(0, 120),
            time_start: container.time_start || null,
            time_end: container.time_end || null,
            repeat: container.repeat || 'none',
            layer: container.layer ?? null,
            enabled: container.enabled !== false
        };
    }

    function sanitizeSyncStatus(status = {}) {
        const out = {};
        const safeKeys = [
            'status',
            'reason',
            'platform_scope',
            'running',
            'paused',
            'pending',
            'conflict_count',
            'last_success_at',
            'last_run_at',
            'last_failed_at',
            'retryable'
        ];
        for (const key of safeKeys) {
            if (Object.prototype.hasOwnProperty.call(status, key)) out[key] = clone(status[key]);
        }
        return out;
    }

    async function safeCall(fn, fallback = null) {
        try {
            return await fn();
        } catch (_) {
            return fallback;
        }
    }

    async function readPlansById(db) {
        const plans = await safeCall(() => db.getPlans(), []);
        return new Map((plans || []).map(plan => [String(plan.id), plan]));
    }

    function buildDailyTaskPool(tasks = [], now, scheduling = null) {
        if (scheduling?.buildDailyTaskPool) return scheduling.buildDailyTaskPool(tasks, now);
        const todayStr = formatDateISO(now);
        return tasks.filter(task => {
            if (isCompleted(task)) return false;
            const effectiveStartDate = task.arranged_date || task.start_date || null;
            if (effectiveStartDate && effectiveStartDate > todayStr) return false;
            if (task.deferred_until && new Date(task.deferred_until) > now) return false;
            return true;
        });
    }

    function getTodayContainers(containers = [], now, scheduling = null) {
        const todayStr = scheduling?.formatDateISO ? scheduling.formatDateISO(now) : formatDateISO(now);
        const dateObj = new Date(`${todayStr}T00:00:00`);
        const dow = dateObj.getDay();
        const isWeekday = dow >= 1 && dow <= 5;
        const isWeekend = dow === 0 || dow === 6;
        return containers
            .filter(container => container.enabled !== false)
            .filter(container => !scheduling?.containerAppliesToDate || scheduling.containerAppliesToDate(container, dateObj, todayStr, dow, isWeekday, isWeekend));
    }

    function selectCurrentTasks(tasks = [], containers = [], now, scheduling = null) {
        const taskPool = buildDailyTaskPool(tasks, now, scheduling);
        const todayContainers = getTodayContainers(containers, now, scheduling);
        const settle = scheduling?.dailySettle
            ? scheduling.dailySettle(taskPool, todayContainers, now)
            : { displayTasks: taskPool };
        const displayTasks = settle?.displayTasks || settle?.currentTasks || taskPool;
        const current = displayTasks.filter(task => task?.assignment?.status === 'current');
        const pool = current.length ? current : displayTasks;
        const inProgress = pool.filter(task => task.progress === 'in_progress');
        return (inProgress.length ? [...inProgress, ...pool.filter(task => task.progress !== 'in_progress')] : pool)
            .filter(task => !isCompleted(task));
    }

    function getCapabilities() {
        return {
            schema: MDP_AGENT_SCHEMA,
            version: 1,
            read: ['tasks.list', 'tasks.get', 'snapshot.current_tasks', 'snapshot.upcoming_tasks', 'snapshot.calendar', 'status.sync'],
            write: ['task.create_manual', 'task.update', 'task.delete', 'task.update_progress', 'task.start', 'task.complete', 'task.reopen'],
            binding: 'current_desktop_active_profile',
            transport: 'desktop_mcp_stdio'
        };
    }

    async function assertProfileAllowed(options = {}) {
        const expected = options.expected_profile_id || null;
        const current = options.current_profile_id || options.profile?.profile_id || null;
        if (expected && current && expected !== current) {
            const error = new Error('MCP profile changed');
            error.code = 'profile_changed';
            error.data = { expected_profile_id: expected, current_profile_id: current };
            throw error;
        }
    }

    function requireIdempotency(action = {}, options = {}) {
        if (!MUTATING_ACTIONS.has(action.type)) return null;
        const key = String(action.idempotency_key || action.payload?.idempotency_key || options.idempotency_key || '').trim();
        if (!key) throw new Error('MCP write action requires idempotency_key');
        return key.slice(0, 160);
    }

    async function readIdempotencyLog(db) {
        if (!db?.getSetting) return {};
        const value = await db.getSetting(IDEMPOTENCY_SETTING_KEY);
        return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : {};
    }

    async function rememberIdempotencyResult(db, key, result) {
        if (!db?.setSetting || !key) return;
        const log = await readIdempotencyLog(db);
        log[key] = {
            recorded_at: nowISO(),
            result: clone(result)
        };
        const entries = Object.entries(log)
            .sort((a, b) => String(b[1]?.recorded_at || '').localeCompare(String(a[1]?.recorded_at || '')))
            .slice(0, IDEMPOTENCY_LIMIT);
        await db.setSetting(IDEMPOTENCY_SETTING_KEY, Object.fromEntries(entries));
    }

    async function getIdempotencyResult(db, key) {
        if (!key) return null;
        const log = await readIdempotencyLog(db);
        return log[key]?.result ? clone(log[key].result) : null;
    }

    async function appendAuditLog(db, entry = {}) {
        if (!db?.setSetting || !db?.getSetting) return;
        const existing = await db.getSetting(AUDIT_SETTING_KEY);
        const rows = Array.isArray(existing) ? existing : [];
        rows.unshift({
            ...entry,
            recorded_at: nowISO()
        });
        await db.setSetting(AUDIT_SETTING_KEY, rows.slice(0, AUDIT_LIMIT));
    }

    function assertWriteAllowed(action = {}, options = {}) {
        if (options.allow_write !== true) {
            throw new Error('MCP write action requires allow_write=true');
        }
        if (action.type === 'task.delete' && action.user_confirmed !== true && action.payload?.user_confirmed !== true) {
            throw new Error('task.delete requires user_confirmed=true');
        }
    }

    function normalizeManualTaskPayload(payload = {}) {
        const title = String(payload.title || '').trim();
        const dueDate = String(payload.due_date || payload.deadline || '').slice(0, 10);
        if (!title) throw new Error('task.create_manual requires title');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('task.create_manual requires due_date');
        if (!isIsoDate(payload.start_date)) throw new Error('task.create_manual has invalid start_date');
        return {
            title: title.slice(0, 200),
            plan_id: payload.plan_id ?? null,
            bucket_id: payload.bucket_id ?? null,
            due_date: dueDate,
            start_date: payload.start_date || dueDate,
            schedule_time: payload.schedule_time || null,
            duration: Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : 45,
            priority: normalizePriority(payload.priority || 'medium'),
            progress: 'not_started',
            labels: Array.isArray(payload.labels) ? clone(payload.labels).slice(0, 50) : [],
            checklist: Array.isArray(payload.checklist) ? clone(payload.checklist).slice(0, 100) : [],
            notes: String(payload.notes || payload.description || '').slice(0, 5000),
            description: String(payload.description || payload.notes || '').slice(0, 5000),
            source: 'manual',
            readonly: false
        };
    }

    function normalizeTaskPatch(patch = {}) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
            throw new Error('task.update requires object patch');
        }
        const out = {};
        for (const [key, value] of Object.entries(patch)) {
            if (!TASK_PATCH_ALLOWLIST.has(key)) {
                throw new Error(`task.update field is not allowed: ${key}`);
            }
            out[key] = clone(value);
        }
        if (Object.keys(out).length === 0) throw new Error('task.update requires at least one patch field');
        if (Object.prototype.hasOwnProperty.call(out, 'progress')) out.progress = normalizeProgress(out.progress);
        if (Object.prototype.hasOwnProperty.call(out, 'status')) out.status = normalizeProgress(out.status) === 'not_started' ? 'pending' : out.status;
        if (Object.prototype.hasOwnProperty.call(out, 'priority')) out.priority = normalizePriority(out.priority);
        if (!isIsoDate(out.start_date)) throw new Error('task.update has invalid start_date');
        if (!isIsoDate(out.arranged_date)) throw new Error('task.update has invalid arranged_date');
        if (!isIsoDate(out.due_date)) throw new Error('task.update has invalid due_date');
        if (!isIsoDate(out.deadline)) throw new Error('task.update has invalid deadline');
        if (Object.prototype.hasOwnProperty.call(out, 'notes')) out.notes = String(out.notes || '').slice(0, 5000);
        if (Object.prototype.hasOwnProperty.call(out, 'description')) out.description = String(out.description || '').slice(0, 5000);
        if (Object.prototype.hasOwnProperty.call(out, 'checklist')) out.checklist = Array.isArray(out.checklist) ? clone(out.checklist).slice(0, 100) : [];
        if (Object.prototype.hasOwnProperty.call(out, 'labels')) out.labels = Array.isArray(out.labels) ? clone(out.labels).slice(0, 50) : [];
        return out;
    }

    function filterTasks(tasks = [], filter = {}) {
        const dateFrom = filter.date_from || null;
        const dateTo = filter.date_to || null;
        const limit = Math.max(1, Math.min(200, Number(filter.limit) || DEFAULT_UPCOMING_LIMIT));
        return tasks
            .filter(task => !filter.progress || (task.progress || task.status) === filter.progress)
            .filter(task => filter.plan_id == null || String(task.plan_id) === String(filter.plan_id))
            .filter(task => !filter.source || (task.source || task.source_type || 'manual') === filter.source)
            .filter(task => {
                const taskDate = task.due_date || task.deadline || task.arranged_date || task.start_date || null;
                if (!taskDate) return true;
                if (dateFrom && taskDate < dateFrom) return false;
                if (dateTo && taskDate > dateTo) return false;
                return true;
            })
            .sort((a, b) => {
                const dateCompare = getTaskDateKey(a).localeCompare(getTaskDateKey(b));
                if (dateCompare) return dateCompare;
                return String(a.title || '').localeCompare(String(b.title || ''));
            })
            .slice(0, limit);
    }

    async function listTasks(db, filter = {}) {
        const tasks = await db.getAllTasks(filter);
        const planById = await readPlansById(db);
        const rows = filterTasks(tasks || [], filter).map(task => sanitizeTask(task, planById));
        return { status: 'ok', tasks: rows, count: rows.length };
    }

    async function getTask(db, taskId) {
        if (!taskId) throw new Error('task.get requires task_id');
        const task = await db.getTaskById(taskId);
        if (!task) return { status: 'not_found', task_id: taskId };
        const planById = await readPlansById(db);
        return { status: 'ok', task: sanitizeTaskDetail(task, planById) };
    }

    async function createTask(db, payload = {}, options = {}) {
        const task = await db.addTask(normalizeManualTaskPayload(payload), { source: options.source || 'mcp_agent' });
        const planById = await readPlansById(db);
        return { status: 'created', task: sanitizeTaskDetail(task, planById) };
    }

    async function updateTask(db, payload = {}, options = {}) {
        const taskId = payload.task_id;
        if (!taskId) throw new Error('task.update requires task_id');
        const patch = normalizeTaskPatch(payload.patch || {});
        const task = await db.updateTask(taskId, patch, { source: options.source || 'mcp_agent' });
        const planById = await readPlansById(db);
        return { status: 'updated', task: sanitizeTaskDetail(task, planById) };
    }

    async function deleteTask(db, payload = {}, options = {}) {
        const taskId = payload.task_id;
        if (!taskId) throw new Error('task.delete requires task_id');
        const existing = await db.getTaskById(taskId);
        if (!existing) return { status: 'not_found', task_id: taskId };
        await appendAuditLog(db, {
            action: 'task.delete',
            task_id: String(taskId),
            title: String(existing.title || '').slice(0, 200),
            source: existing.source || existing.source_type || 'manual',
            idempotency_key: payload.idempotency_key || options.idempotency_key || null
        });
        await db.deleteTask(taskId, { source: options.source || 'mcp_agent', allowManageBacSync: true });
        return { status: 'deleted', task_id: String(taskId) };
    }

    async function updateProgress(db, payload = {}, options = {}) {
        const taskId = payload.task_id;
        const progress = normalizeProgress(payload.progress);
        if (!taskId) throw new Error('task.update_progress requires task_id');
        const updates = {
            progress,
            completed_at: progress === 'completed' ? nowISO(options.now || new Date()) : null
        };
        const task = await db.updateTask(taskId, updates, { source: options.source || 'mcp_agent' });
        const planById = await readPlansById(db);
        return { status: 'updated', task: sanitizeTaskDetail(task, planById) };
    }

    function actionFromTool(toolName, args = {}) {
        const map = {
            timewhere_task_create: 'task.create_manual',
            timewhere_task_update: 'task.update',
            timewhere_task_delete: 'task.delete',
            timewhere_task_start: 'task.start',
            timewhere_task_complete: 'task.complete',
            timewhere_task_reopen: 'task.reopen'
        };
        return {
            type: map[toolName] || toolName,
            payload: clone(args),
            idempotency_key: args.idempotency_key,
            user_confirmed: args.user_confirmed === true
        };
    }

    async function executeAction(db, action = {}, options = {}) {
        if (!db) throw new Error('TimeWhereDB is required');
        await assertProfileAllowed(options);
        assertWriteAllowed(action, options);
        const idempotencyKey = requireIdempotency(action, options);
        const existingResult = await getIdempotencyResult(db, idempotencyKey);
        if (existingResult) return { ...existingResult, idempotent_replay: true };

        let result;
        if (action.type === 'task.create_manual') {
            result = await createTask(db, action.payload || {}, options);
        } else if (action.type === 'task.update') {
            result = await updateTask(db, action.payload || {}, options);
        } else if (action.type === 'task.delete') {
            result = await deleteTask(db, action.payload || action, { ...options, idempotency_key: idempotencyKey });
        } else if (action.type === 'task.update_progress') {
            result = await updateProgress(db, action.payload || action, options);
        } else if (action.type === 'task.start') {
            result = await updateProgress(db, { ...(action.payload || {}), progress: 'in_progress' }, options);
        } else if (action.type === 'task.complete') {
            result = await updateProgress(db, { ...(action.payload || {}), progress: 'completed' }, options);
        } else if (action.type === 'task.reopen') {
            result = await updateProgress(db, { ...(action.payload || {}), progress: 'not_started' }, options);
        } else {
            throw new Error(`Unsupported MDP action: ${action.type || 'unknown'}`);
        }
        await rememberIdempotencyResult(db, idempotencyKey, result);
        return result;
    }

    async function handleMcpToolCall(db, toolName, args = {}, options = {}) {
        await assertProfileAllowed(options);
        if (toolName === 'timewhere_tasks_list') return await listTasks(db, args);
        if (toolName === 'timewhere_task_get') return await getTask(db, args.task_id);
        return await executeAction(db, actionFromTool(toolName, args), { ...options, allow_write: true });
    }

    async function buildSnapshot(db, options = {}) {
        if (!db) throw new Error('TimeWhereDB is required');
        await assertProfileAllowed(options);
        const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
        const todayStr = formatDateISO(now);
        const scheduling = options.scheduling || global.TimeWhereScheduling || null;
        const platform = options.platform || global.TimeWherePlatform || null;
        const currentLimit = Math.max(1, Number(options.current_limit) || DEFAULT_CURRENT_LIMIT);
        const upcomingLimit = Math.max(1, Number(options.upcoming_limit) || DEFAULT_UPCOMING_LIMIT);

        const [tasks, plans, containers, events, databaseInfo, syncStatus] = await Promise.all([
            safeCall(() => db.getAllTasks(), []),
            safeCall(() => db.getPlans(), []),
            safeCall(() => db.getContainers(), []),
            safeCall(() => db.getEvents(), []),
            safeCall(() => db.getDatabaseInfo(), null),
            safeCall(() => platform?.sync?.getStatus?.(), null)
        ]);
        const planById = new Map((plans || []).map(plan => [String(plan.id), plan]));
        const taskPool = buildDailyTaskPool(tasks || [], now, scheduling)
            .sort((a, b) => {
                const dateCompare = getTaskDateKey(a).localeCompare(getTaskDateKey(b));
                if (dateCompare) return dateCompare;
                return String(a.title || '').localeCompare(String(b.title || ''));
            });
        const currentTasks = selectCurrentTasks(tasks || [], containers || [], now, scheduling);
        const rangeStart = options.calendar_start || todayStr;
        const rangeEnd = options.calendar_end || options.calendar_start || todayStr;

        return {
            schema: MDP_AGENT_SCHEMA,
            generated_at: nowISO(now),
            capabilities: getCapabilities(),
            status: {
                platform: platform?.name || 'unknown',
                database: databaseInfo,
                sync: sanitizeSyncStatus(syncStatus || {})
            },
            today: {
                date: todayStr,
                completed_count: (tasks || []).filter(task => isCompletedToday(task, todayStr)).length,
                pending_count: taskPool.length
            },
            current_tasks: currentTasks.slice(0, currentLimit).map(task => sanitizeTask(task, planById)),
            upcoming_tasks: taskPool.slice(0, upcomingLimit).map(task => sanitizeTask(task, planById)),
            containers: (containers || []).map(sanitizeContainer),
            calendar: {
                range_start: rangeStart,
                range_end: rangeEnd,
                events: (events || [])
                    .filter(event => !event.date || (event.date >= rangeStart && event.date <= rangeEnd))
                    .map(sanitizeEvent)
            }
        };
    }

    const api = {
        MDP_AGENT_SCHEMA,
        IDEMPOTENCY_SETTING_KEY,
        AUDIT_SETTING_KEY,
        getCapabilities,
        buildSnapshot,
        listTasks,
        getTask,
        createTask,
        updateTask,
        deleteTask,
        updateProgress,
        executeAction,
        handleMcpToolCall,
        sanitizeTask,
        sanitizeTaskDetail,
        sanitizeEvent,
        sanitizeContainer,
        sanitizeSyncStatus,
        _test: {
            normalizeManualTaskPayload,
            normalizeTaskPatch,
            actionFromTool
        }
    };

    global.TimeWhereMDPAgentInterface = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);