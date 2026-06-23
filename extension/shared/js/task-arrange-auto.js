/**
 * Shared automatic Task Arrange runner and review log helpers.
 */
(function(global) {
    const PENDING_KEY = 'task_arrange_pending';
    const LAST_CHECKED_KEY = 'task_arrange_last_checked_at';
    const DIRTY_KEY = 'task_arrange_dirty_at';
    const REVIEW_LOG_KEY = 'task_arrange_review_log';
    const REVIEW_LOG_LIMIT = 20;

    function hasArrangeWork(pending) {
        return Array.isArray(pending?.arrange_changes) && pending.arrange_changes.length > 0;
    }

    function formatDateISO(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getArrangeChangeFinalValue(row, field) {
        const updates = row?.updates || {};
        if (Object.prototype.hasOwnProperty.call(updates, field)) return updates[field];
        if (Object.prototype.hasOwnProperty.call(row || {}, field)) return row[field];
        return row?.task?.[field] ?? null;
    }

    async function getTaskArrangeReviewLog(db) {
        const log = await db.getSetting(REVIEW_LOG_KEY);
        return Array.isArray(log) ? log : [];
    }

    async function saveTaskArrangeReviewLog(db, log) {
        await db.setSetting(REVIEW_LOG_KEY, (log || []).slice(0, REVIEW_LOG_LIMIT), { skipTaskArrangeDirty: true });
    }

    async function appendTaskArrangeReviewRecord(db, record) {
        if (!record || !Array.isArray(record.changes) || record.changes.length === 0) return;
        const log = await getTaskArrangeReviewLog(db);
        await saveTaskArrangeReviewLog(db, [record, ...log]);
    }

    function buildTaskArrangeReviewRecord({ source, runAt, changes, summary, errors = [], appliedCount = 0 }) {
        const errorByTaskId = new Map((errors || []).map(error => [String(error.task_id), error]));
        const rows = (changes || []).map(row => {
            const task = row.task || {};
            const taskId = String(row.task_id || task.id || '');
            const error = errorByTaskId.get(taskId);
            return {
                task_id: taskId,
                title: task.title || task.name || taskId || 'Untitled task',
                source: task.source || row.source || 'manual',
                from_start_date: task.start_date || null,
                to_start_date: task.start_date || null,
                from_arranged_date: task.arranged_date || null,
                to_arranged_date: getArrangeChangeFinalValue(row, 'arranged_date') || getArrangeChangeFinalValue(row, 'start_date'),
                from_priority: task.priority || 'medium',
                to_priority: getArrangeChangeFinalValue(row, 'priority'),
                updates: row.updates || {},
                status: error ? 'failed' : 'applied',
                error: error?.error || null
            };
        });
        const safeSummary = summary || {};
        return {
            id: `arrange-${runAt.getTime()}`,
            source: source || 'auto',
            created_at: runAt.toISOString(),
            viewed_at: null,
            status: errors.length > 0 ? (appliedCount > 0 ? 'partial' : 'failed') : 'applied',
            summary: {
                date_changes: safeSummary.date_changes || 0,
                priority_changes: safeSummary.priority_changes || 0,
                managebac_changes: safeSummary.managebac_changes || 0,
                applied: appliedCount,
                failed: errors.length
            },
            changes: rows
        };
    }

    async function markTaskArrangeDirty(db, reason = 'task_date_changed') {
        if (!db?.setSetting) return;
        await db.setSetting(DIRTY_KEY, new Date().toISOString(), { skipTaskArrangeDirty: true, reason });
    }

    async function clearTaskArrangeDirty(db) {
        if (!db?.setSetting) return;
        await db.setSetting(DIRTY_KEY, null, { skipTaskArrangeDirty: true });
    }

    async function applyPendingTaskArrangeReview(db, pending, runAt) {
        const rows = Array.isArray(pending?.arrange_changes) ? pending.arrange_changes : [];
        const errors = [];
        let appliedCount = 0;
        for (const row of rows) {
            if (!row?.task_id || !row.updates || Object.keys(row.updates).length === 0) continue;
            try {
                await db.updateTask(row.task_id, row.updates, {
                    skipTaskArrangeDirty: true,
                    skipUserUpdatedAt: true,
                    googleSyncDerivedFields: Object.keys(row.updates || {}).filter(field => field === 'arranged_date' || field === 'priority'),
                    googleSyncDerivedSource: 'task_arrange_auto'
                });
                appliedCount++;
            } catch (error) {
                errors.push({ task_id: row.task_id, error: error.message || String(error) });
            }
        }
        const record = buildTaskArrangeReviewRecord({
            source: pending?.source || 'auto',
            runAt,
            changes: rows,
            summary: pending?.arrange_summary || null,
            errors,
            appliedCount
        });
        await appendTaskArrangeReviewRecord(db, record);
        await db.setSetting(PENDING_KEY, null, { skipTaskArrangeDirty: true });
        await db.setSetting(LAST_CHECKED_KEY, runAt.toISOString(), { skipTaskArrangeDirty: true });
        await clearTaskArrangeDirty(db);
        return { ran: true, applied: appliedCount, errors, record };
    }

    async function shouldRunTaskArrange(db, now, options = {}) {
        const dirtyAt = await db.getSetting(DIRTY_KEY);
        const last = await db.getSetting(LAST_CHECKED_KEY);
        return { run: true, dirty: Boolean(dirtyAt), last: last || null };
    }

    async function runTaskArrangeAutoReview(db, options = {}) {
        if (!global.TimeWhereScheduling?.arrangeTasks || !db?.getSetting || !db?.setSetting) {
            return { ran: false, reason: 'unavailable' };
        }
        const now = options.now instanceof Date ? options.now : new Date();
        const existing = await db.getSetting(PENDING_KEY);
        if (hasArrangeWork(existing)) {
            return await applyPendingTaskArrangeReview(db, existing, now);
        }

        await shouldRunTaskArrange(db, now, options);

        const result = await global.TimeWhereScheduling.arrangeTasks(db, now, { apply: true });
        await db.setSetting(LAST_CHECKED_KEY, now.toISOString(), { skipTaskArrangeDirty: true });
        await clearTaskArrangeDirty(db);
        if (!Array.isArray(result.changes) || result.changes.length === 0) {
            return { ...result, ran: true, no_changes: true };
        }

        const record = buildTaskArrangeReviewRecord({
            source: options.source || 'auto',
            runAt: now,
            changes: result.changes,
            summary: result.summary || null,
            errors: result.errors || [],
            appliedCount: result.arranged || 0
        });
        await appendTaskArrangeReviewRecord(db, record);
        return { ...result, ran: true, record };
    }

    global.TimeWhereTaskArrangeAuto = {
        PENDING_KEY,
        LAST_CHECKED_KEY,
        DIRTY_KEY,
        REVIEW_LOG_KEY,
        hasArrangeWork,
        getTaskArrangeReviewLog,
        saveTaskArrangeReviewLog,
        appendTaskArrangeReviewRecord,
        buildTaskArrangeReviewRecord,
        markTaskArrangeDirty,
        clearTaskArrangeDirty,
        runTaskArrangeAutoReview
    };
})(typeof window !== 'undefined' ? window : globalThis);

