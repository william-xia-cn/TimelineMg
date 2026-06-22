/**
 * Desktop Google Sync runtime wrapper.
 *
 * Keeps Electron desktop sync alive while the app process is running. Shared
 * job serialization and retry behavior lives in sync-runtime-service.js.
 */
(function(global) {
    'use strict';

    let runtimeApi = global.TimeWhereSyncRuntimeService;
    if (!runtimeApi && typeof require === 'function') {
        try {
            runtimeApi = require('./sync-runtime-service.js');
            global.TimeWhereSyncRuntimeService = runtimeApi;
        } catch (_) {}
    }

    function isDesktopElectron() {
        return global.TimeWherePlatform?.name === 'desktop-electron';
    }

    function createDesktopSyncService(options = {}) {
        if (!runtimeApi?.createSyncRuntimeService) {
            throw new Error('TimeWhere sync runtime service is required');
        }
        return runtimeApi.createSyncRuntimeService({
            ...options,
            platform_scope: 'desktop_runtime',
            status_event_name: 'timewhere-desktop-sync-status',
            sync_trigger_prefix: 'desktop_service',
            unsupported_reason: 'desktop_only',
            isSupported: isDesktopElectron
        });
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
