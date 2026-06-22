/**
 * Shared Google Sync runtime service.
 *
 * Provides serialized sync jobs, pending trigger coalescing, conflict pause,
 * retry backoff, and long-running status for page-hosted platform shells.
 */
(function(global) {
    'use strict';

    const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;
    const DEFAULT_DEBOUNCE_MS = 3 * 60 * 1000;
    const LONG_RUNNING_MS = 90 * 1000;
    const BACKOFF_MS = [60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

    function nowISO() {
        return new Date().toISOString();
    }

    function isRetryableSyncError(error = {}) {
        const message = String(error.message || '');
        const httpStatus = Number(error.http_status || 0);
        return error.retryable === true
            || httpStatus === 429
            || httpStatus >= 500
            || /fetch failed|network request failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNABORTED|offline/i.test(message);
    }

    function createSyncRuntimeService(options = {}) {
        const platformScope = options.platform_scope || 'page_runtime';
        const statusEventName = options.status_event_name || 'timewhere-sync-runtime-status';
        const triggerPrefix = options.sync_trigger_prefix || platformScope;
        const timers = { interval: null, debounce: null, retry: null, longRunning: null };
        let currentRun = null;
        let pendingState = null;
        let currentRunId = 0;
        const state = {
            status: 'idle',
            platform_scope: platformScope,
            running: false,
            pending: false,
            paused: false,
            pause_reason: null,
            started: false,
            service_started_at: null,
            last_run_at: null,
            last_success_at: null,
            last_failed_at: null,
            last_error: null,
            last_reason: null,
            last_http_status: null,
            last_google_reason: null,
            last_google_status: null,
            last_google_message: null,
            retryable: false,
            failure_count: 0,
            retry_after: null,
            next_run_at: null,
            conflict_count: 0,
            last_trigger_reason: null,
            current_run_started_at: null,
            current_run_duration_ms: 0,
            last_completed_at: null,
            queued_at: null,
            pending_duration_ms: 0,
            pending_trigger_count: 0,
            pending_reasons: [],
            pending_force: false
        };

        const getApi = () => options.api || global.TimeWhereGoogleSync;
        const getDb = () => options.db || global.TimeWhereDB;
        const getDriveClient = () => {
            if (typeof options.driveClientFactory === 'function') return options.driveClientFactory();
            return getApi()?.createDefaultDriveClient?.();
        };
        const isSupported = () => typeof options.isSupported === 'function' ? options.isSupported() : true;

        function durationSince(value) {
            const time = value ? new Date(value).getTime() : NaN;
            return Number.isFinite(time) ? Math.max(0, Date.now() - time) : 0;
        }

        function snapshot() {
            return {
                ...state,
                current_run_duration_ms: state.running ? durationSince(state.current_run_started_at) : state.current_run_duration_ms,
                pending_duration_ms: state.pending ? durationSince(state.queued_at) : 0,
                pending_reasons: state.pending_reasons.slice()
            };
        }

        function emitStatus() {
            const detail = snapshot();
            try {
                global.dispatchEvent?.(new CustomEvent(statusEventName, { detail }));
                global.dispatchEvent?.(new CustomEvent('timewhere-sync-runtime-status', { detail }));
            } catch (_) {
                // Status events are best effort; polling getStatus() remains authoritative.
            }
            if (typeof options.onStatus === 'function') {
                try { options.onStatus(detail); } catch (_) {}
            }
        }

        async function refreshFromDb() {
            const api = getApi();
            const db = getDb();
            if (!api || !db?.getSetting) return snapshot();
            const syncState = await api.getGoogleSyncState(db).catch(() => null);
            const conflicts = await db.getSetting(api.GOOGLE_SYNC_CONFLICTS_KEY).catch(() => []);
            const conflictCount = Array.isArray(conflicts) ? conflicts.length : Number(syncState?.conflict_count || 0);
            state.conflict_count = conflictCount;
            if (syncState?.last_success_at || syncState?.last_restore_at || syncState?.last_force_upload_at) {
                state.last_success_at = syncState.last_success_at || syncState.last_restore_at || syncState.last_force_upload_at;
            }
            if (syncState?.last_failed_at) state.last_failed_at = syncState.last_failed_at;
            if (syncState?.last_error) state.last_error = syncState.last_error;
            if (syncState?.reason) state.last_reason = syncState.reason;
            if (syncState?.status === 'conflict' || conflictCount > 0) {
                state.status = 'paused';
                state.paused = true;
                state.pause_reason = 'conflict';
            }
            return snapshot();
        }

        function clearRetryTimer() {
            if (timers.retry) global.clearTimeout(timers.retry);
            timers.retry = null;
        }

        function clearLongRunningTimer() {
            if (timers.longRunning) global.clearTimeout(timers.longRunning);
            timers.longRunning = null;
        }

        function applyPendingState() {
            state.pending = Boolean(pendingState);
            state.queued_at = pendingState?.queued_at || null;
            state.pending_trigger_count = pendingState?.trigger_count || 0;
            state.pending_reasons = pendingState?.reasons ? pendingState.reasons.slice() : [];
            state.pending_force = pendingState?.force === true;
        }

        function queuePendingRun(runOptions = {}) {
            const reason = runOptions.reason || 'pending';
            if (!pendingState) pendingState = { queued_at: nowISO(), reasons: [], trigger_count: 0, force: false };
            pendingState.trigger_count += 1;
            if (!pendingState.reasons.includes(reason)) pendingState.reasons.push(reason);
            pendingState.force = pendingState.force === true || runOptions.force === true;
            applyPendingState();
            emitStatus();
            return {
                status: 'queued',
                platform_scope: platformScope,
                running: true,
                pending: true,
                queued_at: pendingState.queued_at,
                pending_trigger_count: pendingState.trigger_count,
                pending_reasons: pendingState.reasons.slice(),
                force: pendingState.force
            };
        }

        function takePendingRun() {
            if (!pendingState) return null;
            const next = {
                reason: pendingState.reasons.length > 1 ? 'coalesced_pending' : (pendingState.reasons[0] || 'pending'),
                force: pendingState.force === true,
                queued_at: pendingState.queued_at,
                pending_trigger_count: pendingState.trigger_count,
                pending_reasons: pendingState.reasons.slice(),
                coalesced_pending: true
            };
            pendingState = null;
            applyPendingState();
            return next;
        }

        function scheduleRetry(reason = 'retry') {
            clearRetryTimer();
            const index = Math.min(Math.max(state.failure_count - 1, 0), BACKOFF_MS.length - 1);
            const delay = BACKOFF_MS[index];
            state.retry_after = new Date(Date.now() + delay).toISOString();
            state.next_run_at = state.retry_after;
            timers.retry = global.setTimeout(() => {
                timers.retry = null;
                requestRun({ reason, force: true });
            }, delay);
            emitStatus();
        }

        function pause(reason = 'manual') {
            state.status = 'paused';
            state.paused = true;
            state.pause_reason = reason;
            state.retry_after = null;
            clearRetryTimer();
            emitStatus();
            return snapshot();
        }

        async function resume(reason = 'manual_resume') {
            state.paused = false;
            state.pause_reason = null;
            state.status = 'idle';
            emitStatus();
            return await requestRun({ reason, force: true });
        }

        async function shouldRun(optionsForRun = {}) {
            const api = getApi();
            const db = getDb();
            if (!api || !db) return { ok: false, status: 'not_ready', reason: 'sync_runtime_not_ready' };
            const syncState = await api.getGoogleSyncState(db);
            const conflicts = await db.getSetting(api.GOOGLE_SYNC_CONFLICTS_KEY).catch(() => []);
            const conflictCount = Array.isArray(conflicts) ? conflicts.length : Number(syncState?.conflict_count || 0);
            state.conflict_count = conflictCount;
            if (syncState?.status === 'conflict' || conflictCount > 0) {
                return { ok: false, status: 'paused', reason: 'conflict', conflict_count: conflictCount };
            }
            if (state.paused && state.pause_reason && state.pause_reason !== 'conflict') {
                return { ok: false, status: 'paused', reason: state.pause_reason };
            }
            if (!optionsForRun.force && syncState?.status === 'failed' && syncState.retryable === false) {
                return { ok: false, status: 'failed', reason: syncState.reason || 'non_retryable_failure' };
            }
            if (!optionsForRun.force && !['connected', 'pending_retry', 'syncing', 'failed'].includes(syncState?.status)) {
                return { ok: false, status: 'idle', reason: syncState?.status || 'not_connected' };
            }
            return { ok: true, syncState };
        }

        async function runJob(runOptions = {}) {
            const api = getApi();
            const db = getDb();
            const runId = currentRunId + 1;
            currentRunId = runId;
            state.running = true;
            state.status = 'syncing';
            state.last_run_at = nowISO();
            state.current_run_started_at = state.last_run_at;
            state.current_run_duration_ms = 0;
            state.last_trigger_reason = runOptions.reason || 'manual';
            state.retry_after = null;
            state.next_run_at = null;
            clearLongRunningTimer();
            timers.longRunning = global.setTimeout(() => {
                if (currentRunId !== runId || !state.running) return;
                state.status = 'long_running';
                state.current_run_duration_ms = durationSince(state.current_run_started_at);
                emitStatus();
            }, Number(runOptions.long_running_ms ?? options.long_running_ms ?? LONG_RUNNING_MS));
            emitStatus();

            try {
                const gate = await shouldRun(runOptions);
                if (!gate.ok) {
                    if (gate.status === 'paused') pause(gate.reason);
                    else {
                        state.status = gate.status;
                        state.last_reason = gate.reason;
                        emitStatus();
                    }
                    return { status: gate.status, reason: gate.reason, conflict_count: gate.conflict_count || state.conflict_count, platform_scope: platformScope };
                }

                const driveClient = getDriveClient();
                if (!driveClient) return { status: 'not_ready', reason: 'drive_client_unavailable', platform_scope: platformScope };
                const result = await api.runAutoSync(db, driveClient, {
                    force: true,
                    sync_trigger: runOptions.reason || triggerPrefix,
                    queued_at: runOptions.queued_at || null,
                    pending_trigger_count: runOptions.pending_trigger_count || 0,
                    pending_reasons: runOptions.pending_reasons || [],
                    coalesced_pending: runOptions.coalesced_pending === true
                });

                if (result?.status === 'conflict') {
                    state.failure_count = 0;
                    state.conflict_count = result.conflicts?.length || 0;
                    pause('conflict');
                    return { ...result, platform_scope: platformScope };
                }
                if (result?.status === 'not_configured') {
                    state.status = 'not_configured';
                    state.last_reason = result.reason || 'not_configured';
                    emitStatus();
                    return { ...result, platform_scope: platformScope };
                }

                state.status = result?.status || 'connected';
                state.paused = false;
                state.pause_reason = null;
                state.failure_count = 0;
                state.retryable = false;
                state.last_error = null;
                clearRetryTimer();
                await refreshFromDb();
                emitStatus();
                return { ...result, platform_scope: platformScope };
            } catch (error) {
                const syncError = api?.serializeSyncError ? api.serializeSyncError(error) : {
                    reason: error.code || error.reason || 'google_sync_failed',
                    message: error.message || 'Google sync failed',
                    retryable: isRetryableSyncError(error)
                };
                syncError.retryable = syncError.retryable || isRetryableSyncError(error);
                state.status = 'failed';
                state.failure_count += 1;
                state.last_failed_at = nowISO();
                state.last_error = syncError.message;
                state.last_reason = syncError.reason;
                state.last_http_status = syncError.http_status || null;
                state.last_google_reason = syncError.google_reason || null;
                state.last_google_status = syncError.google_status || null;
                state.last_google_message = syncError.google_message || null;
                state.retryable = syncError.retryable === true;
                await api?.saveGoogleSyncState?.(db, {
                    status: 'failed',
                    reason: syncError.reason,
                    last_error: syncError.message,
                    last_failed_at: state.last_failed_at,
                    last_http_status: state.last_http_status,
                    last_google_reason: state.last_google_reason,
                    last_google_status: state.last_google_status,
                    last_google_message: state.last_google_message,
                    retryable: state.retryable
                }).catch(() => null);
                if (state.retryable) scheduleRetry('retry_after_failure');
                else emitStatus();
                return { status: 'failed', reason: syncError.reason, message: syncError.message, retryable: state.retryable, platform_scope: platformScope };
            } finally {
                clearLongRunningTimer();
                state.running = false;
                state.current_run_duration_ms = durationSince(state.current_run_started_at);
                state.current_run_started_at = null;
                state.last_completed_at = nowISO();
                currentRun = null;
                const next = takePendingRun();
                if (next) global.setTimeout(() => requestRun(next), 0);
                else {
                    applyPendingState();
                    emitStatus();
                }
            }
        }

        async function requestRun(runOptions = {}) {
            if (!isSupported()) return { status: 'not_supported', reason: options.unsupported_reason || 'platform_not_supported', platform_scope: platformScope };
            const now = Date.now();
            if (!runOptions.force && state.retry_after && new Date(state.retry_after).getTime() > now) {
                return { status: 'backoff', retry_after: state.retry_after, platform_scope: platformScope };
            }
            if (currentRun) return queuePendingRun(runOptions);
            currentRun = runJob(runOptions);
            return await currentRun;
        }

        function scheduleRun(runOptions = {}) {
            if (!isSupported()) return { status: 'not_supported', reason: options.unsupported_reason || 'platform_not_supported', platform_scope: platformScope };
            if (timers.debounce) global.clearTimeout(timers.debounce);
            const delay = Number(runOptions.debounce_ms ?? DEFAULT_DEBOUNCE_MS);
            state.next_run_at = new Date(Date.now() + delay).toISOString();
            timers.debounce = global.setTimeout(() => {
                timers.debounce = null;
                requestRun({ reason: runOptions.reason || 'debounced_write', force: runOptions.force !== false });
            }, delay);
            emitStatus();
            return { status: 'scheduled', next_run_at: state.next_run_at, platform_scope: platformScope };
        }

        function start(startOptions = {}) {
            if (!isSupported()) return { status: 'not_supported', reason: options.unsupported_reason || 'platform_not_supported', platform_scope: platformScope };
            if (state.started) return snapshot();
            state.started = true;
            state.service_started_at = nowISO();
            const intervalMs = Number(startOptions.interval_ms || DEFAULT_INTERVAL_MS);
            state.next_run_at = new Date(Date.now() + intervalMs).toISOString();
            timers.interval = global.setInterval(() => {
                state.next_run_at = new Date(Date.now() + intervalMs).toISOString();
                requestRun({ reason: 'interval', force: false });
            }, intervalMs);
            global.addEventListener?.('online', () => requestRun({ reason: 'network_online', force: true }));
            global.addEventListener?.('focus', () => requestRun({ reason: 'window_focus', force: false }));
            global.document?.addEventListener?.('visibilitychange', () => {
                if (global.document.visibilityState === 'visible') requestRun({ reason: 'visibility_visible', force: false });
            });
            requestRun({ reason: startOptions.reason || 'startup', force: startOptions.force === true });
            emitStatus();
            return snapshot();
        }

        function stop() {
            if (timers.interval) global.clearInterval(timers.interval);
            if (timers.debounce) global.clearTimeout(timers.debounce);
            clearRetryTimer();
            clearLongRunningTimer();
            timers.interval = null;
            timers.debounce = null;
            state.started = false;
            state.status = 'stopped';
            emitStatus();
            return snapshot();
        }

        return { start, stop, requestRun, scheduleRun, pause, resume, async getStatus() { await refreshFromDb(); return snapshot(); } };
    }

    const api = {
        DEFAULT_INTERVAL_MS,
        DEFAULT_DEBOUNCE_MS,
        LONG_RUNNING_MS,
        BACKOFF_MS: BACKOFF_MS.slice(),
        createSyncRuntimeService,
        isRetryableSyncError
    };

    global.TimeWhereSyncRuntimeService = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
