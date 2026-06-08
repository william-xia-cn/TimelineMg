/**
 * TimeWhere platform adapter.
 * Keeps shell-specific APIs behind a small contract while the Chrome package
 * remains the current source root.
 */
(function initTimeWherePlatform(global) {
    const DEFAULT_MAIN_ROUTE = 'pages/focus/focus.html';
    const DEFAULT_SETTINGS_ROUTE = 'pages/settings/settings.html';

    function resolveChromeUrl(chromeRef, route) {
        const value = route || DEFAULT_MAIN_ROUTE;
        if (/^(https?:|chrome-extension:)/i.test(value)) return value;
        if (chromeRef?.runtime?.getURL) return chromeRef.runtime.getURL(value);
        return value;
    }

    function readChromeLastError(chromeRef) {
        return chromeRef?.runtime?.lastError?.message || '';
    }

    function normalizeExternalHttpUrl(value) {
        const raw = String(value || '').trim();
        if (!/^https?:\/\//i.test(raw)) return null;
        try {
            const url = new URL(raw);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
            return url.href;
        } catch (_) {
            return null;
        }
    }

    function chromeCallbackPromise(chromeRef, invoke) {
        return new Promise((resolve, reject) => {
            try {
                invoke(result => {
                    const error = readChromeLastError(chromeRef);
                    if (error) reject(new Error(error));
                    else resolve(result);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async function chromePromiseCall(chromeRef, invoke) {
        const result = invoke();
        if (result && typeof result.then === 'function') {
            const value = await result;
            const error = readChromeLastError(chromeRef);
            if (error) throw new Error(error);
            return value;
        }
        const error = readChromeLastError(chromeRef);
        if (error) throw new Error(error);
        return result;
    }

    function createChromePlatform(chromeRef) {
        function getChromeOAuthClientId() {
            const manifest = chromeRef?.runtime?.getManifest?.();
            return manifest?.oauth2?.client_id || '';
        }

        return {
            name: 'chrome-extension',
            window: {
                async openMain(route = DEFAULT_MAIN_ROUTE) {
                    const url = resolveChromeUrl(chromeRef, route);
                    if (chromeRef?.tabs?.create) {
                        await chromeCallbackPromise(chromeRef, done => chromeRef.tabs.create({ url }, done));
                        return { status: 'opened', url };
                    }
                    global.location.href = url;
                    return { status: 'opened', url };
                },
                async openQuickPanel() {
                    if (!chromeRef?.sidePanel?.open) return { status: 'not_supported' };
                    try {
                        await chromePromiseCall(chromeRef, () => chromeRef.sidePanel.open({}));
                        return { status: 'opened' };
                    } catch (error) {
                        return { status: 'not_supported', reason: error.message };
                    }
                },
                async focus(route = DEFAULT_MAIN_ROUTE) {
                    return this.openMain(route);
                },
                async openSettings() {
                    if (chromeRef?.runtime?.openOptionsPage) {
                        await chromeCallbackPromise(chromeRef, done => chromeRef.runtime.openOptionsPage(done));
                        return { status: 'opened', route: DEFAULT_SETTINGS_ROUTE };
                    }
                    return this.openMain(DEFAULT_SETTINGS_ROUTE);
                }
            },
            notification: {
                async notify(payload = {}) {
                    if (!chromeRef?.notifications?.create) return { status: 'not_supported' };
                    const id = payload.id || `timewhere:${Date.now()}`;
                    const options = { ...payload };
                    delete options.id;
                    await chromeCallbackPromise(chromeRef, done => chromeRef.notifications.create(id, options, done));
                    return { status: 'created', id };
                },
                onClick(callback) {
                    if (!chromeRef?.notifications?.onClicked?.addListener || typeof callback !== 'function') {
                        return () => {};
                    }
                    chromeRef.notifications.onClicked.addListener(callback);
                    return () => chromeRef.notifications.onClicked.removeListener?.(callback);
                },
                onClose(callback) {
                    if (!chromeRef?.notifications?.onClosed?.addListener || typeof callback !== 'function') {
                        return () => {};
                    }
                    const listener = (notificationId, byUser) => callback({ id: notificationId, key: notificationId, by_user: byUser === true });
                    chromeRef.notifications.onClosed.addListener(listener);
                    return () => chromeRef.notifications.onClosed.removeListener?.(listener);
                }
            },
            reminderRuntime: {
                async schedule(reminder = {}) {
                    if (!chromeRef?.alarms?.create) return { status: 'not_supported' };
                    const id = reminder.id || reminder.name;
                    if (!id) return { status: 'invalid', reason: 'missing_id' };
                    const alarmInfo = {};
                    if (reminder.when) alarmInfo.when = typeof reminder.when === 'number' ? reminder.when : new Date(reminder.when).getTime();
                    if (reminder.delayInMinutes != null) alarmInfo.delayInMinutes = reminder.delayInMinutes;
                    if (reminder.periodInMinutes != null) alarmInfo.periodInMinutes = reminder.periodInMinutes;
                    if (!alarmInfo.when && alarmInfo.delayInMinutes == null) alarmInfo.delayInMinutes = 0;
                    await chromePromiseCall(chromeRef, () => chromeRef.alarms.create(id, alarmInfo));
                    return { status: 'scheduled', id };
                },
                async cancel(id) {
                    if (!chromeRef?.alarms?.clear) return { status: 'not_supported' };
                    const cleared = await chromePromiseCall(chromeRef, () => chromeRef.alarms.clear(id));
                    return { status: cleared ? 'cleared' : 'missing', id };
                },
                async rescheduleAll() {
                    return { status: 'not_supported', reason: 'chrome_background_alarm_managed' };
                },
                async getWorkReminderState() {
                    if (!chromeRef?.runtime?.sendMessage) return { status: 'not_supported' };
                    return await chromeCallbackPromise(chromeRef, done =>
                        chromeRef.runtime.sendMessage({ type: 'TIMEWHERE_WORK_REMINDER_STATE' }, done)
                    );
                },
                async stopCurrentWorkReminder() {
                    if (!chromeRef?.runtime?.sendMessage) return { status: 'not_supported' };
                    return await chromeCallbackPromise(chromeRef, done =>
                        chromeRef.runtime.sendMessage({ type: 'TIMEWHERE_WORK_REMINDER_STOP' }, done)
                    );
                }
            },
            badge: {
                async set(state = {}) {
                    if (!chromeRef?.action?.setBadgeText) return { status: 'not_supported' };
                    const text = typeof state === 'string' ? state : String(state.text ?? '');
                    await chromePromiseCall(chromeRef, () => chromeRef.action.setBadgeText({ text }));
                    if (state.color && chromeRef.action.setBadgeBackgroundColor) {
                        await chromePromiseCall(chromeRef, () => chromeRef.action.setBadgeBackgroundColor({ color: state.color }));
                    }
                    return { status: 'set', text };
                },
                async clear() {
                    if (!chromeRef?.action?.setBadgeText) return { status: 'not_supported' };
                    await chromePromiseCall(chromeRef, () => chromeRef.action.setBadgeText({ text: '' }));
                    return { status: 'cleared' };
                }
            },
            auth: {
                getStatus() {
                    if (!chromeRef?.identity || !getChromeOAuthClientId()) {
                        return { status: 'not_configured', reason: 'oauth_client_id_missing' };
                    }
                    return { status: 'configured' };
                },
                async getGoogleToken({ interactive = false, scopes = null } = {}) {
                    const status = this.getStatus();
                    if (status.status === 'not_configured') return status;
                    if (!chromeRef?.identity?.getAuthToken) return { status: 'not_configured', reason: 'identity_unavailable' };
                    const details = { interactive };
                    if (Array.isArray(scopes) && scopes.length) details.scopes = scopes;
                    const token = await chromeCallbackPromise(chromeRef, done => chromeRef.identity.getAuthToken(details, done));
                    return { status: token ? 'ok' : 'not_configured', token: token || null };
                },
                async getAccountInfo() {
                    if (!chromeRef?.identity?.getProfileUserInfo) return { email: null };
                    return await chromeCallbackPromise(chromeRef, done =>
                        chromeRef.identity.getProfileUserInfo({ accountStatus: 'ANY' }, done)
                    );
                },
                getDiagnostics() {
                    return {
                        status: 'not_supported',
                        reason: 'chrome_identity_diagnostics_unavailable'
                    };
                },
                async disconnectGoogleToken() {
                    if (!chromeRef?.identity?.clearAllCachedAuthTokens) {
                        return { status: 'not_supported' };
                    }
                    await chromeCallbackPromise(chromeRef, done => chromeRef.identity.clearAllCachedAuthTokens(done));
                    return { status: 'disconnected' };
                },
                async revokeGoogleToken() {
                    if (!chromeRef?.identity?.clearAllCachedAuthTokens) {
                        return { status: 'not_supported' };
                    }
                    await chromeCallbackPromise(chromeRef, done => chromeRef.identity.clearAllCachedAuthTokens(done));
                    return { status: 'revoked' };
                }
            },
            chromeBridge: {
                connectExtension() {
                    return { status: 'not_supported', reason: 'already_running_in_chrome_extension' };
                },
                getStatus() {
                    return { status: 'not_supported', reason: 'already_running_in_chrome_extension' };
                }
            },
            sync: {
                getStatus() {
                    return { status: 'not_supported', reason: 'chrome_page_sync_managed' };
                },
                requestRun() {
                    return { status: 'not_supported', reason: 'chrome_page_sync_managed' };
                },
                pause() {
                    return { status: 'not_supported', reason: 'chrome_page_sync_managed' };
                },
                resume() {
                    return { status: 'not_supported', reason: 'chrome_page_sync_managed' };
                }
            },
            external: {
                async openUrl(url) {
                    const normalizedUrl = normalizeExternalHttpUrl(url);
                    if (!normalizedUrl) return { status: 'invalid', reason: 'unsupported_url_protocol' };
                    if (chromeRef?.tabs?.create) {
                        await chromeCallbackPromise(chromeRef, done => chromeRef.tabs.create({ url: normalizedUrl }, done));
                        return { status: 'opened', url: normalizedUrl };
                    }
                    global.open?.(normalizedUrl, '_blank', 'noopener,noreferrer');
                    return { status: 'opened', url: normalizedUrl };
                }
            },
            system: {
                getDesktopSettings() {
                    return { status: 'not_supported', reason: 'already_running_in_chrome_extension' };
                },
                setDesktopSettings() {
                    return { status: 'not_supported', reason: 'already_running_in_chrome_extension' };
                },
                writeWidgetSnapshot() {
                    return { status: 'not_supported', reason: 'already_running_in_chrome_extension' };
                },
                getDesktopProfile() {
                    return { status: 'not_supported', reason: 'already_running_in_chrome_extension' };
                },
                confirmGoogleAccountSwitch() {
                    return { status: 'not_supported', reason: 'already_running_in_chrome_extension' };
                }
            }
        };
    }

    function createElectronPlatform(bridge) {
        const call = async (method, payload = {}) => {
            if (typeof bridge?.invoke !== 'function') return { status: 'not_supported' };
            return bridge.invoke(method, payload);
        };
        return {
            name: 'desktop-electron',
            window: {
                openMain(route = DEFAULT_MAIN_ROUTE) {
                    return call('window.openMain', { route });
                },
                show(route = DEFAULT_MAIN_ROUTE) {
                    return call('window.show', { route });
                },
                hide() {
                    return call('window.hide');
                },
                openQuickPanel() {
                    return call('window.openQuickPanel');
                },
                focus(route = DEFAULT_MAIN_ROUTE) {
                    return call('window.focus', { route });
                },
                onActivated(callback) {
                    if (typeof bridge?.onWindowActivated !== 'function' || typeof callback !== 'function') {
                        return () => {};
                    }
                    return bridge.onWindowActivated(callback);
                },
                openSettings() {
                    return call('window.openMain', { route: DEFAULT_SETTINGS_ROUTE });
                }
            },
            notification: {
                notify(payload) {
                    return call('notification.notify', payload);
                },
                onClick(callback) {
                    if (typeof bridge?.onNotificationClick !== 'function' || typeof callback !== 'function') {
                        return () => {};
                    }
                    const seen = new Set();
                    const dispatch = payload => {
                        const identity = payload?.clicked_at
                            || `${payload?.id || payload?.key || ''}:${payload?.task_id || ''}:${payload?.bucket || ''}`;
                        if (identity && seen.has(identity)) return;
                        if (identity) seen.add(identity);
                        callback(payload);
                    };
                    const consumePending = async () => {
                        if (typeof bridge?.consumePendingNotificationClicks !== 'function') return;
                        try {
                            const result = await bridge.consumePendingNotificationClicks();
                            for (const payload of result?.clicks || []) dispatch(payload);
                        } catch (_) {
                            // Pending notification clicks are best-effort.
                        }
                    };
                    const unsubscribe = bridge.onNotificationClick(payload => {
                        dispatch(payload);
                        consumePending();
                    });
                    consumePending();
                    return unsubscribe;
                },
                async consumePendingClicks() {
                    if (typeof bridge?.consumePendingNotificationClicks !== 'function') {
                        return { status: 'not_supported', clicks: [] };
                    }
                    return await bridge.consumePendingNotificationClicks();
                },
                onClose(callback) {
                    if (typeof bridge?.onNotificationClose !== 'function' || typeof callback !== 'function') {
                        return () => {};
                    }
                    const seen = new Set();
                    const dispatch = payload => {
                        const identity = payload?.closed_at
                            || `${payload?.id || payload?.key || ''}:${payload?.bucket || ''}:close`;
                        if (identity && seen.has(identity)) return;
                        if (identity) seen.add(identity);
                        callback(payload);
                    };
                    const consumePending = async () => {
                        if (typeof bridge?.consumePendingNotificationCloses !== 'function') return;
                        try {
                            const result = await bridge.consumePendingNotificationCloses();
                            for (const payload of result?.closes || []) dispatch(payload);
                        } catch (_) {
                            // Pending notification closes are best-effort.
                        }
                    };
                    const unsubscribe = bridge.onNotificationClose(payload => {
                        dispatch(payload);
                        consumePending();
                    });
                    consumePending();
                    return unsubscribe;
                },
                async consumePendingCloses() {
                    if (typeof bridge?.consumePendingNotificationCloses !== 'function') {
                        return { status: 'not_supported', closes: [] };
                    }
                    return await bridge.consumePendingNotificationCloses();
                }
            },
            reminderRuntime: {
                schedule(reminder) {
                    return call('reminderRuntime.schedule', reminder);
                },
                cancel(id) {
                    return call('reminderRuntime.cancel', { id });
                },
                rescheduleAll(reminders = []) {
                    return call('reminderRuntime.rescheduleAll', { reminders });
                },
                getWorkReminderState() {
                    return global.TimeWhereDesktopReminders?.readReminderState?.() || { status: 'not_supported' };
                },
                stopCurrentWorkReminder() {
                    return global.TimeWhereDesktopReminders?.stopCurrentReminder?.() || { status: 'not_supported' };
                }
            },
            badge: {
                set(state) {
                    return call('badge.set', state);
                },
                clear() {
                    return call('badge.clear');
                }
            },
            auth: {
                getStatus() {
                    return call('auth.getStatus');
                },
                getGoogleToken(options = {}) {
                    return call('auth.getGoogleToken', options);
                },
                getAccountInfo() {
                    return call('auth.getAccountInfo');
                },
                getDiagnostics() {
                    return call('auth.getDiagnostics');
                },
                disconnectGoogleToken() {
                    return call('auth.disconnectGoogleToken');
                },
                revokeGoogleToken() {
                    return call('auth.revokeGoogleToken');
                }
            },
            chromeBridge: {
                connectExtension(options = {}) {
                    return call('chromeBridge.connectExtension', options);
                },
                getStatus() {
                    return call('chromeBridge.status');
                }
            },
            sync: {
                getStatus() {
                    return global.TimeWhereDesktopSyncService?.getStatus?.() || { status: 'not_supported', reason: 'desktop_sync_service_unavailable' };
                },
                requestRun(options = {}) {
                    return global.TimeWhereDesktopSyncService?.requestRun?.(options) || { status: 'not_supported', reason: 'desktop_sync_service_unavailable' };
                },
                pause(options = {}) {
                    return global.TimeWhereDesktopSyncService?.pause?.(options.reason || 'platform_pause') || { status: 'not_supported', reason: 'desktop_sync_service_unavailable' };
                },
                resume(options = {}) {
                    return global.TimeWhereDesktopSyncService?.resume?.(options.reason || 'platform_resume') || { status: 'not_supported', reason: 'desktop_sync_service_unavailable' };
                }
            },
            external: {
                openUrl(url) {
                    return call('external.openUrl', { url });
                }
            },
            system: {
                getDesktopSettings() {
                    return call('system.getDesktopSettings');
                },
                setDesktopSettings(settings = {}) {
                    return call('system.setDesktopSettings', settings);
                },
                writeWidgetSnapshot(snapshot = {}) {
                    return call('system.writeWidgetSnapshot', snapshot);
                },
                getDesktopProfile() {
                    return call('system.getDesktopProfile');
                },
                confirmGoogleAccountSwitch(payload = {}) {
                    return call('system.confirmGoogleAccountSwitch', payload);
                }
            }
        };
    }

    function createFallbackPlatform() {
        const notSupported = () => ({ status: 'not_supported' });
        return {
            name: 'web-fallback',
            window: {
                openMain(route = DEFAULT_MAIN_ROUTE) {
                    global.location.href = route;
                    return { status: 'opened', route };
                },
                openQuickPanel: notSupported,
                show() {
                    global.location.href = DEFAULT_MAIN_ROUTE;
                    return { status: 'opened', route: DEFAULT_MAIN_ROUTE };
                },
                hide() {
                    return { status: 'not_supported' };
                },
                focus(route = DEFAULT_MAIN_ROUTE) {
                    global.location.href = route;
                    return { status: 'opened', route };
                },
                openSettings() {
                    global.location.href = DEFAULT_SETTINGS_ROUTE;
                    return { status: 'opened', route: DEFAULT_SETTINGS_ROUTE };
                }
            },
            notification: { notify: notSupported, onClick: () => () => {}, onClose: () => () => {} },
            reminderRuntime: { schedule: notSupported, cancel: notSupported, rescheduleAll: notSupported, getWorkReminderState: notSupported, stopCurrentWorkReminder: notSupported },
            badge: { set: notSupported, clear: notSupported },
            auth: {
                getStatus: () => ({ status: 'not_configured', reason: 'platform_unavailable' }),
                getGoogleToken: () => ({ status: 'not_configured', reason: 'platform_unavailable' }),
                getAccountInfo: () => ({ email: null }),
                getDiagnostics: () => ({ status: 'not_supported', reason: 'platform_unavailable' }),
                disconnectGoogleToken: () => ({ status: 'not_supported' }),
                revokeGoogleToken: () => ({ status: 'not_supported' })
            },
            chromeBridge: { connectExtension: notSupported, getStatus: notSupported },
            sync: { getStatus: notSupported, requestRun: notSupported, pause: notSupported, resume: notSupported },
            external: {
                openUrl(url) {
                    const normalizedUrl = normalizeExternalHttpUrl(url);
                    if (!normalizedUrl) return { status: 'invalid', reason: 'unsupported_url_protocol' };
                    global.open?.(normalizedUrl, '_blank', 'noopener,noreferrer');
                    return { status: 'opened', url: normalizedUrl };
                }
            },
            system: {
                getDesktopSettings: () => ({ status: 'not_supported', reason: 'platform_unavailable' }),
                setDesktopSettings: () => ({ status: 'not_supported', reason: 'platform_unavailable' }),
                writeWidgetSnapshot: () => ({ status: 'not_supported', reason: 'platform_unavailable' }),
                getDesktopProfile: () => ({ status: 'not_supported', reason: 'platform_unavailable' }),
                confirmGoogleAccountSwitch: () => ({ status: 'not_supported', reason: 'platform_unavailable' })
            }
        };
    }

    const platform = global.TimeWhereElectronPlatform
        ? createElectronPlatform(global.TimeWhereElectronPlatform)
        : (global.chrome?.runtime ? createChromePlatform(global.chrome) : createFallbackPlatform());

    global.TimeWherePlatform = global.TimeWherePlatform || platform;
    global.TimeWherePlatformContract = {
        name: true,
        window: ['openMain', 'openQuickPanel', 'focus', 'show', 'hide', 'onActivated'],
        notification: ['notify', 'onClick', 'onClose'],
        reminderRuntime: ['schedule', 'cancel', 'rescheduleAll', 'getWorkReminderState', 'stopCurrentWorkReminder'],
        badge: ['set', 'clear'],
        auth: ['getStatus', 'getGoogleToken', 'getAccountInfo', 'getDiagnostics', 'disconnectGoogleToken', 'revokeGoogleToken'],
        chromeBridge: ['connectExtension', 'getStatus'],
        sync: ['getStatus', 'requestRun', 'pause', 'resume'],
        external: ['openUrl'],
        system: ['getDesktopSettings', 'setDesktopSettings', 'writeWidgetSnapshot', 'getDesktopProfile', 'confirmGoogleAccountSwitch']
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
