/**
 * Chrome page-hosted Google Sync runtime wrapper.
 *
 * Aligns Chrome Extension / Side Panel sync cadence with Desktop while a
 * TimeWhere page is open. This is intentionally not a MV3 background service.
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

    function isChromeExtension() {
        return global.TimeWherePlatform?.name === 'chrome-extension';
    }

    function createChromeSyncService(options = {}) {
        if (!runtimeApi?.createSyncRuntimeService) {
            throw new Error('TimeWhere sync runtime service is required');
        }
        return runtimeApi.createSyncRuntimeService({
            ...options,
            platform_scope: 'chrome_page_runtime',
            status_event_name: 'timewhere-chrome-sync-status',
            sync_trigger_prefix: 'chrome_page_runtime',
            unsupported_reason: 'chrome_page_only',
            isSupported: isChromeExtension
        });
    }

    const service = global.TimeWhereChromeSyncService || createChromeSyncService();
    global.TimeWhereChromeSyncService = service;

    function startWhenReady() {
        if (!isChromeExtension()) return;
        global.setTimeout(() => service.start({ reason: 'page_startup' }), 1000);
    }

    if (global.document?.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', startWhenReady, { once: true });
    } else {
        startWhenReady();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createChromeSyncService };
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
