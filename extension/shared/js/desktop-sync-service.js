/**
 * Desktop Google Sync runtime.
 *
 * Keeps Electron desktop sync alive while the app process is running. The
 * IndexedDB data lives in the renderer, so this service runs in the shared
 * renderer shell and delegates OAuth/Drive access through TimeWherePlatform.
 */
(function(global) {
    'use strict';

    const DEFAULT_INTERVAL_MS = 60 * 1000;
    const DEFAULT_DEBOUNCE_MS = 30 * 1000;
    const BACKOFF_MS = [60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

    function nowISO() {
        return new Date().toISOString();
    }

    function isDesktopElectron() {
        return global.TimeWherePlatform?.name === 'desktop-electron';
    }

    function isRetryableSyncError(error = {}) {
        const message = String(error.message || '');
        const httpStatus = Number(error.http_status || 0);
        return error.retryable === true
            || httpStatus === 429
            || httpStatus >= 500
            || /fetch failed|network request failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNABORTED|offline/i.test(message);
    }

    function createDesktopSyncService(options = {}) {
        const timers = {
            interval: null,
            debounce: null,
            retry: null
        };
        let currentRun = null;
        let pendingRun = null;
        const state = {
            status: 'idle',
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
            last_trigger_reason: null
        };

        const getApi = () => options.api || global.TimeWhereGoogleSync;
        const getDb = () => options.db || global.TimeWhereDB;
        const getDriveClient = () => {
            if (typeof options.driveClientFactory === 'function') return options.driveClientFactory();
            const api = getApi();
            return api?.createDefaultDriveClient?.();
        };

        function snapshot() {
            return { ...state };
        }

        function emitStatus() {
            try {
                global.dispatchEvent?.(new CustomEvent('timewhere-desktop-sync-status', { detail: snapshot() }));
            } catch (_) {
                // Status events are best effort; polling getStatus() remains authoritative.
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
            state.running = true;
            state.status = 'syncing';
            state.last_run_at = nowISO();
            state.last_trigger_reason = runOptions.reason || 'manual';
            state.retry_after = null;
            state.next_run_at = null;
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
                    return { status: gate.status, reason: gate.reason, conflict_count: gate.conflict_count || state.conflict_count };
                }

                const driveClient = getDriveClient();
                if (!driveClient) return { status: 'not_ready', reason: 'drive_client_unavailable' };
                const result = await api.runAutoSync(db, driveClient, {
                    force: true,
                    sync_trigger: runOptions.reason || 'desktop_service'
                });

                if (result?.status === 'conflict') {
                    state.failure_count = 0;
                    state.conflict_count = result.conflicts?.length || 0;
                    pause('conflict');
                    return result;
                }
                if (result?.status === 'not_configured') {
                    state.status = 'not_configured';
                    state.last_reason = result.reason || 'not_configured';
                    emitStatus();
                    return result;
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
                return result;
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
                return { status: 'failed', reason: syncError.reason, message: syncError.message, retryable: state.retryable };
            } finally {
                state.running = false;
                currentRun = null;
                if (pendingRun) {
                    const next = pendingRun;
                    pendingRun = null;
                    state.pending = false;
                    global.setTimeout(() => requestRun(next), 0);
                } else {
                    state.pending = false;
                    emitStatus();
                }
            }
        }

        async function requestRun(runOptions = {}) {
            if (!isDesktopElectron()) return { status: 'not_supported', reason: 'desktop_only' };
            const now = Date.now();
            if (!runOptions.force && state.retry_after && new Date(state.retry_after).getTime() > now) {
                return { status: 'backoff', retry_after: state.retry_after };
            }
            if (currentRun) {
                pendingRun = {
                    reason: runOptions.reason || pendingRun?.reason || 'pending',
                    force: runOptions.force === true || pendingRun?.force === true
                };
                state.pending = true;
                emitStatus();
                return { status: 'queued', running: true, pending: true };
            }
            currentRun = runJob(runOptions);
            return await currentRun;
        }

        function scheduleRun(runOptions = {}) {
            if (!isDesktopElectron()) return { status: 'not_supported', reason: 'desktop_only' };
            if (timers.debounce) global.clearTimeout(timers.debounce);
            const delay = Number(runOptions.debounce_ms ?? DEFAULT_DEBOUNCE_MS);
            state.next_run_at = new Date(Date.now() + delay).toISOString();
            timers.debounce = global.setTimeout(() => {
                timers.debounce = null;
                requestRun({ reason: runOptions.reason || 'debounced_write', force: runOptions.force !== false });
            }, delay);
            emitStatus();
            return { status: 'scheduled', next_run_at: state.next_run_at };
        }

        function start(startOptions = {}) {
            if (!isDesktopElectron()) return { status: 'not_supported', reason: 'desktop_only' };
            if (state.started) return snapshot();
            state.started = true;
            state.service_started_at = nowISO();
            const intervalMs = Number(startOptions.interval_ms || DEFAULT_INTERVAL_MS);
            timers.interval = global.setInterval(() => {
                requestRun({ reason: 'interval', force: false });
            }, intervalMs);
            global.addEventListener?.('online', () => requestRun({ reason: 'network_online', force: true }));
            global.addEventListener?.('focus', () => requestRun({ reason: 'window_focus', force: false }));
            global.document?.addEventListener?.('visibilitychange', () => {
                if (global.document.visibilityState === 'visible') {
                    requestRun({ reason: 'visibility_visible', force: false });
                }
            });
            requestRun({ reason: 'startup', force: false });
            emitStatus();
            return snapshot();
        }

        function stop() {
            if (timers.interval) global.clearInterval(timers.interval);
            if (timers.debounce) global.clearTimeout(timers.debounce);
            clearRetryTimer();
            timers.interval = null;
            timers.debounce = null;
            state.started = false;
            state.status = 'stopped';
            emitStatus();
            return snapshot();
        }

        return {
            start,
            stop,
            requestRun,
            scheduleRun,
            pause,
            resume,
            async getStatus() {
                await refreshFromDb();
                return snapshot();
            }
        };
    }

    const service = global.TimeWhereDesktopSyncService || createDesktopSyncService();
    global.TimeWhereDesktopSyncService = service;

    function startWhenReady() {
        if (!isDesktopElectron()) return;
        global.setTimeout(() => service.start(), 1000);
    }

    if (global.document?.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', startWhenReady, { once: true });
    } else {
        startWhenReady();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createDesktopSyncService };
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
