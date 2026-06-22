/**
 * Shared Google sync account/status indicator.
 * Renders the product-level account entry without owning sync behavior.
 */
(function initGoogleSyncStatusUI(global) {
    'use strict';

    const REFRESH_INTERVAL_MS = 45 * 1000;
    const SETTINGS_ROUTE = 'pages/settings/settings.html#googleSyncSection';
    const HISTORY_ROUTE = 'pages/settings/settings.html#googleSyncHistoryPanel';
    const controllers = [];
    const ACCESS_TOKEN_PATTERN = new RegExp(`\\b(?:${['ya', '29'].join('')}|1\\/\\/)[A-Za-z0-9._-]+`, 'g');
    const CLIENT_SECRET_PATTERN = new RegExp(`\\b${['GOC', 'SPX-'].join('')}[A-Za-z0-9_-]+`, 'g');

    const STATUS_CONFIG = {
        disconnected: {
            label: 'Google 未连接',
            dot: 'disconnected',
            detail: '本地数据可继续使用；连接 Google 后可跨设备同步。'
        },
        connected: {
            label: 'Google 已连接',
            dot: 'connected',
            detail: '自动同步已开启。'
        },
        syncing: {
            label: '同步中',
            dot: 'syncing',
            detail: '正在同步到 Google Drive。'
        },
        long_running: {
            label: '同步耗时较长',
            dot: 'syncing',
            detail: 'Google Drive 同步仍在运行，请稍候。'
        },
        queued: {
            label: '同步排队中',
            dot: 'queued',
            detail: '已有同步正在运行，本次同步已排队。'
        },
        failed: {
            label: '同步失败',
            dot: 'failed',
            detail: '同步失败，请打开同步设置处理。'
        },
        conflict: {
            label: '有冲突待处理',
            dot: 'conflict',
            detail: '需要处理本设备与云端的差异。'
        },
        retry: {
            label: '等待重试',
            dot: 'retry',
            detail: '网络或 Google Drive 暂时不可用，稍后会重试。'
        },
        account_mismatch: {
            label: 'Google 账户不匹配',
            dot: 'account-mismatch',
            detail: '当前本地空间与授权 Google 账户不一致，已停止同步。'
        }
    };

    function escapeText(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeSyncMessage(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        return raw
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '[account]')
            .replace(ACCESS_TOKEN_PATTERN, '[token]')
            .replace(CLIENT_SECRET_PATTERN, '[secret]')
            .replace(/[A-Z]:\\[^\s'"<>]+/g, '[local path]')
            .slice(0, 140);
    }

    function formatRelativeTime(value) {
        if (!value) return '';
        const time = new Date(value).getTime();
        if (!Number.isFinite(time)) return '';
        const diffMs = Date.now() - time;
        if (diffMs < 60 * 1000) return '刚刚';
        const minutes = Math.floor(diffMs / (60 * 1000));
        if (minutes < 60) return `${minutes} 分钟前`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} 小时前`;
        const days = Math.floor(hours / 24);
        return `${days} 天前`;
    }

    function formatDuration(ms) {
        const number = Number(ms || 0);
        if (!Number.isFinite(number) || number <= 0) return '0 秒';
        if (number < 1000) return `${Math.round(number)} ms`;
        return `${Math.round(number / 100) / 10} 秒`;
    }

    function formatReasonList(reasons = []) {
        const list = Array.isArray(reasons) ? reasons.filter(Boolean).slice(0, 3) : [];
        return list.length ? list.join(' / ') : '自动同步';
    }

    function getLastSuccessAt(syncState = {}, serviceState = {}) {
        return serviceState.last_success_at
            || syncState.last_success_at
            || syncState.last_restore_at
            || syncState.last_force_upload_at
            || null;
    }

    function getConflictCount(syncState = {}, conflicts = [], serviceState = {}) {
        if (Array.isArray(conflicts) && conflicts.length > 0) return conflicts.length;
        return Number(serviceState.conflict_count || syncState.conflict_count || 0);
    }

    function isConnectedLike(syncState = {}, accountInfo = {}) {
        return accountInfo.connected === true
            || ['connected', 'syncing', 'conflict', 'pending_retry', 'failed'].includes(syncState.status)
            || Boolean(syncState.connected_at || syncState.last_success_at || syncState.last_restore_at || syncState.last_force_upload_at);
    }

    function normalizeAccountDisplay(accountInfo = {}, settings = {}) {
        const name = accountInfo.name || settings.account_name || settings.google_sync_account_name || '';
        const email = accountInfo.email || settings.account_email || settings.google_sync_account_email || '';
        const picture = accountInfo.picture || settings.account_picture || settings.google_sync_account_picture || '';
        const label = name && email ? `${name} <${email}>` : (name || email || 'Google 账户');
        return { name, email, picture, label };
    }

    function isSafeHttpUrl(url) {
        if (!url) return false;
        try {
            const parsed = new URL(String(url));
            return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch (_) {
            return false;
        }
    }

    function accountInitial(displayState = {}) {
        const source = String(displayState.account_name || displayState.account_email || 'G').trim();
        return (source[0] || 'G').toUpperCase();
    }

    function deriveDisplayState(input = {}) {
        const syncState = input.syncState || {};
        const serviceState = input.serviceState || {};
        const accountInfo = input.accountInfo || {};
        const settings = input.settings || {};
        const conflictCount = getConflictCount(syncState, input.conflicts, serviceState);
        const reason = syncState.reason || serviceState.last_reason || serviceState.pause_reason || '';
        const status = syncState.status || '';
        let state = 'disconnected';

        if (reason === 'account_mismatch' || status === 'account_mismatch') {
            state = 'account_mismatch';
        } else if (serviceState.status === 'long_running') {
            state = 'long_running';
        } else if (serviceState.pending || serviceState.status === 'queued' || status === 'queued') {
            state = 'queued';
        } else if (serviceState.running || serviceState.status === 'syncing' || status === 'syncing') {
            state = 'syncing';
        } else if (conflictCount > 0 || serviceState.pause_reason === 'conflict' || status === 'conflict') {
            state = 'conflict';
        } else if (status === 'pending_retry' || serviceState.status === 'backoff' || (status === 'failed' && syncState.retryable === true)) {
            state = 'retry';
        } else if (status === 'failed' || serviceState.status === 'failed') {
            state = 'failed';
        } else if (isConnectedLike(syncState, accountInfo)) {
            state = 'connected';
        }

        const config = STATUS_CONFIG[state] || STATUS_CONFIG.disconnected;
        const account = normalizeAccountDisplay(accountInfo, settings);
        const lastSuccessAt = getLastSuccessAt(syncState, serviceState);
        const lastSuccessText = formatRelativeTime(lastSuccessAt);
        const safeFailure = sanitizeSyncMessage(syncState.last_error || serviceState.last_error || syncState.last_google_message || '');
        let detail = config.detail;

        if (state === 'connected' && lastSuccessText) {
            detail = '最近同步：' + lastSuccessText;
        } else if (state === 'connected' && serviceState.platform_scope === 'chrome_page_runtime') {
            detail = '打开 TimeWhere 页面期间自动同步。';
        } else if (state === 'connected' && serviceState.platform_scope === 'desktop_runtime') {
            detail = '客户端运行期间自动同步。';
        } else if (state === 'long_running') {
            detail = '同步耗时较长：' + formatDuration(serviceState.current_run_duration_ms) + '。';
        } else if (state === 'queued') {
            const triggerCount = Number(serviceState.pending_trigger_count || 0);
            detail = triggerCount
                ? '同步排队中：' + triggerCount + ' 次触发，' + formatReasonList(serviceState.pending_reasons) + '。'
                : config.detail;
        } else if (state === 'conflict') {
            detail = '有 ' + (conflictCount || 1) + ' 个冲突待处理。';
        } else if (state === 'failed' && safeFailure) {
            detail = '同步失败：' + safeFailure;
        } else if (state === 'retry' && serviceState.retry_after) {
            detail = '等待重试：' + (formatRelativeTime(serviceState.retry_after) || '稍后');
        }

        return {
            state,
            dot: config.dot,
            label: config.label,
            detail,
            account_label: account.label,
            account_name: account.name,
            account_email: account.email,
            account_picture: isSafeHttpUrl(account.picture) ? account.picture : '',
            conflict_count: conflictCount,
            last_success_at: lastSuccessAt,
            failure_message: safeFailure
        };
    }

    async function getSettingValue(db, key) {
        if (!db?.getSetting) return null;
        try {
            return await db.getSetting(key);
        } catch (_) {
            return null;
        }
    }

    async function collectDisplayState() {
        const api = global.TimeWhereGoogleSync;
        const db = global.TimeWhereDB;
        const platform = global.TimeWherePlatform;
        const [syncState, conflicts, accountInfo, serviceState, accountName, accountEmail, accountPicture] = await Promise.all([
            api?.getGoogleSyncState && db ? api.getGoogleSyncState(db).catch(() => null) : Promise.resolve(null),
            api?.GOOGLE_SYNC_CONFLICTS_KEY && db ? getSettingValue(db, api.GOOGLE_SYNC_CONFLICTS_KEY) : Promise.resolve([]),
            platform?.auth?.getAccountInfo ? platform.auth.getAccountInfo().catch(() => ({})) : Promise.resolve({}),
            platform?.sync?.getStatus ? platform.sync.getStatus().catch(() => ({})) : Promise.resolve({}),
            api?.GOOGLE_SYNC_ACCOUNT_NAME_KEY && db ? getSettingValue(db, api.GOOGLE_SYNC_ACCOUNT_NAME_KEY) : Promise.resolve(null),
            api?.GOOGLE_SYNC_ACCOUNT_EMAIL_KEY && db ? getSettingValue(db, api.GOOGLE_SYNC_ACCOUNT_EMAIL_KEY) : Promise.resolve(null),
            api?.GOOGLE_SYNC_ACCOUNT_PICTURE_KEY && db ? getSettingValue(db, api.GOOGLE_SYNC_ACCOUNT_PICTURE_KEY) : Promise.resolve(null)
        ]);
        return deriveDisplayState({
            syncState: syncState || {},
            conflicts: Array.isArray(conflicts) ? conflicts : [],
            accountInfo: accountInfo || {},
            serviceState: serviceState || {},
            settings: {
                google_sync_account_name: accountName || null,
                google_sync_account_email: accountEmail || null,
                google_sync_account_picture: accountPicture || null
            }
        });
    }

    function settingsRoute(action = 'settings') {
        return action === 'history' ? HISTORY_ROUTE : SETTINGS_ROUTE;
    }

    async function openSyncSettings(action = 'settings') {
        const platform = global.TimeWherePlatform;
        const route = settingsRoute(action);
        if (platform?.window?.openMain) {
            const result = await platform.window.openMain(route);
            if (result?.status !== 'not_supported') return result;
        }
        if (platform?.window?.openSettings) {
            return await platform.window.openSettings();
        }
        global.location.href = route;
        return { status: 'opened', route };
    }

    function renderPopover(displayState) {
        const conflictAction = displayState.state === 'conflict'
            ? '<button type="button" class="sync-popover-action secondary" data-sync-action="settings">处理冲突</button>'
            : '';
        const historyAction = ['failed', 'conflict', 'retry', 'account_mismatch'].includes(displayState.state)
            ? '<button type="button" class="sync-popover-action secondary" data-sync-action="history">查看同步记录</button>'
            : '';
        return `
            <div class="sync-popover-status">${escapeText(displayState.label)}</div>
            <div class="sync-popover-account">${escapeText(displayState.account_label)}</div>
            <div class="sync-popover-detail">${escapeText(displayState.detail)}</div>
            <div class="sync-popover-actions">
                <button type="button" class="sync-popover-action primary" data-sync-action="settings">打开同步设置</button>
                ${conflictAction}
                ${historyAction}
            </div>
        `;
    }

    function applyAccountVisual(button, displayState) {
        const avatar = button.querySelector('img.user-avatar');
        const initial = button.querySelector('.google-sync-account-initial');
        const picture = displayState.account_picture || '';
        const connected = displayState.state !== 'disconnected' && Boolean(displayState.account_name || displayState.account_email || picture);
        button.dataset.googleAccountAvatar = connected ? (picture ? 'picture' : 'initial') : 'local';
        if (picture && avatar) {
            if (!avatar.dataset.googleSyncLocalSrc) avatar.dataset.googleSyncLocalSrc = avatar.getAttribute('src') || '';
            avatar.src = picture;
            avatar.alt = '';
            avatar.referrerPolicy = 'no-referrer';
            avatar.hidden = false;
            avatar.addEventListener('error', () => {
                button.dataset.googleAccountAvatar = 'initial';
                avatar.hidden = true;
                if (initial) initial.textContent = accountInitial(displayState);
            }, { once: true });
        } else if (avatar) {
            if (!connected && avatar.dataset.googleSyncLocalSrc) {
                avatar.src = avatar.dataset.googleSyncLocalSrc;
            }
            avatar.hidden = connected;
        }
        if (initial) {
            initial.textContent = accountInitial(displayState);
            initial.hidden = !connected || Boolean(picture);
        }
    }

    function applyDisplayToSidebar(instance, displayState) {
        const { button, dot, popover } = instance;
        button.dataset.syncStatus = displayState.state;
        button.classList.toggle('account-mismatch', displayState.state === 'account_mismatch');
        button.setAttribute('aria-label', displayState.label);
        button.title = displayState.label;
        dot.dataset.syncStatus = displayState.state;
        dot.className = `google-sync-status-dot ${displayState.dot}`;
        applyAccountVisual(button, displayState);
        popover.innerHTML = renderPopover(displayState);
    }

    function applyDisplayToSettingsButton(instance, displayState) {
        const { button, dot } = instance;
        button.dataset.syncStatus = displayState.state;
        button.title = displayState.label;
        dot.dataset.syncStatus = displayState.state;
        dot.className = `google-sync-status-dot ${displayState.dot}`;
    }

    function makeDot() {
        const dot = document.createElement('span');
        dot.className = 'google-sync-status-dot disconnected';
        dot.setAttribute('aria-hidden', 'true');
        return dot;
    }

    function attachSidebarAvatar(root) {
        const avatar = root.querySelector?.('.sidebar-bottom img.user-avatar');
        if (!avatar || avatar.closest('.google-sync-account-wrap')) return null;
        const parent = avatar.parentElement;
        if (!parent) return null;

        const wrap = document.createElement('div');
        wrap.className = 'google-sync-account-wrap';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'google-sync-account-button';
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        const dot = makeDot();
        const popover = document.createElement('div');
        popover.className = 'google-sync-account-popover';
        popover.hidden = true;
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-label', 'Google 同步状态');

        parent.insertBefore(wrap, avatar);
        wrap.appendChild(button);
        avatar.dataset.googleSyncLocalSrc = avatar.getAttribute('src') || '';
        button.appendChild(avatar);
        const initial = document.createElement('span');
        initial.className = 'google-sync-account-initial';
        initial.hidden = true;
        button.appendChild(initial);
        button.appendChild(dot);
        wrap.appendChild(popover);

        return { type: 'sidebar', wrap, button, dot, popover };
    }

    function attachSettingsButton(root) {
        const button = root.querySelector?.('#btnSettings');
        if (!button || button.querySelector('.google-sync-status-dot')) return null;
        button.classList.add('google-sync-settings-status-button');
        const dot = makeDot();
        button.appendChild(dot);
        return { type: 'settings-button', button, dot };
    }

    function closeAllPopovers(except = null) {
        controllers.forEach(controller => {
            controller.instances.forEach(instance => {
                if (instance === except || !instance.popover) return;
                instance.popover.hidden = true;
                instance.button?.setAttribute('aria-expanded', 'false');
            });
        });
    }

    function wireSidebarInstance(instance) {
        instance.button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const nextHidden = !instance.popover.hidden;
            closeAllPopovers(instance);
            instance.popover.hidden = nextHidden;
            instance.button.setAttribute('aria-expanded', String(!nextHidden));
        });
        instance.popover.addEventListener('click', event => {
            const action = event.target.closest('[data-sync-action]');
            if (!action) return;
            event.preventDefault();
            openSyncSettings(action.dataset.syncAction || 'settings').catch(error => console.warn('[GoogleSyncStatusUI] open settings failed:', error));
        });
    }

    function wireGlobalDismiss() {
        if (global.__timewhereGoogleSyncStatusDismissWired) return;
        global.__timewhereGoogleSyncStatusDismissWired = true;
        document.addEventListener('click', () => closeAllPopovers());
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeAllPopovers();
        });
    }

    function applyDisplay(controller, displayState) {
        controller.instances.forEach(instance => {
            if (instance.type === 'sidebar') applyDisplayToSidebar(instance, displayState);
            if (instance.type === 'settings-button') applyDisplayToSettingsButton(instance, displayState);
        });
    }

    async function refreshController(controller) {
        const displayState = await collectDisplayState();
        controller.lastDisplayState = displayState;
        applyDisplay(controller, displayState);
        return displayState;
    }

    async function refreshAll() {
        const results = [];
        for (const controller of controllers) {
            results.push(await refreshController(controller));
        }
        return results;
    }

    function init(options = {}) {
        const root = options.root || document;
        const existing = root.__timewhereGoogleSyncStatusController;
        if (existing) return existing;

        const instances = [
            attachSidebarAvatar(root),
            attachSettingsButton(root)
        ].filter(Boolean);
        const controller = {
            root,
            instances,
            lastDisplayState: null,
            timer: null
        };
        root.__timewhereGoogleSyncStatusController = controller;
        controllers.push(controller);

        instances.forEach(instance => {
            if (instance.type === 'sidebar') wireSidebarInstance(instance);
        });
        wireGlobalDismiss();

        refreshController(controller).catch(error => console.warn('[GoogleSyncStatusUI] initial refresh failed:', error));
        controller.timer = global.setInterval(() => {
            refreshController(controller).catch(() => null);
        }, Number(options.interval_ms || REFRESH_INTERVAL_MS));
        global.addEventListener?.('timewhere-desktop-sync-status', () => {
            refreshController(controller).catch(() => null);
        });
        global.addEventListener?.('timewhere-chrome-sync-status', () => {
            refreshController(controller).catch(() => null);
        });
        global.addEventListener?.('timewhere-sync-runtime-status', () => {
            refreshController(controller).catch(() => null);
        });
        global.addEventListener?.('timewhere-google-sync-state', () => {
            refreshController(controller).catch(() => null);
        });
        global.addEventListener?.('timewhere-google-sync-history', () => {
            refreshController(controller).catch(() => null);
        });
        global.document?.addEventListener?.('visibilitychange', () => {
            if (global.document.visibilityState === 'visible') {
                refreshController(controller).catch(() => null);
            }
        });
        return controller;
    }

    const api = {
        init,
        refreshAll,
        deriveDisplayState,
        sanitizeSyncMessage,
        _test: {
            STATUS_CONFIG,
            deriveDisplayState,
            sanitizeSyncMessage,
            formatRelativeTime,
            formatDuration
        }
    };

    global.TimeWhereGoogleSyncStatusUI = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);

