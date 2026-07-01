/**
 * TimeWhere Settings Page Script
 * 版本: v2.0
 * 日期: 2026-04-02
 */

let settingsManageBacSyncInProgress = false;
let googleSyncInProgress = false;
let googleSyncPreviewState = null;
let googleSyncConflictPanelInFlight = false;
let pendingGoogleSyncDangerAction = null;
let desktopBridgeInProgress = false;
let desktopSystemSettingsInProgress = false;
const desktopSystemSettingsDefaults = {
    minimizeToTray: false,
    closeToTray: true,
    startAtLogin: false
};

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    try {
        await initDatabase();
        await loadSettings();
        await ensureTaskReminderAlarm();
        await setupDesktopIntegration();
        runGoogleSyncCheck();
    } catch (error) {
        showToast(`设置页初始化失败：${error.message}`, 'error');
    }
});

function runGoogleSyncCheck() {
    if (typeof TimeWhereGoogleSync === 'undefined' || typeof TimeWhereDB === 'undefined') return;
    TimeWhereGoogleSync.runPageAutoSync(TimeWhereDB).catch(error => {
        console.warn('Google auto sync check failed:', error);
    });
}

async function initDatabase() {
    if (typeof TimeWhereDB !== 'undefined') {
        await TimeWhereDB.initDefaultSettings();
    }
}

async function loadSettings() {
    const settings = await TimeWhereDB.getSettings();
    
    document.getElementById('theme').value = settings.theme || 'light';
    document.getElementById('weekStartsOn').value = settings.start_week_on || 1;
    document.getElementById('tomatoDuration').value = settings.pomodoro_work || 25;
    document.getElementById('defaultDuration').value = settings.default_duration || 45;
    document.getElementById('defaultPriority').value = settings.default_priority || 'medium';
    document.getElementById('notificationEnabled').checked = settings.notification_enabled !== false;
    document.getElementById('appearanceBackground').value = settings.appearance_background || 'calm';
    document.getElementById('appearanceAvatar').value = settings.appearance_avatar || 'default';
    if (typeof TimeWhereAppearance !== 'undefined') {
        TimeWhereAppearance.applyValues({
            background: document.getElementById('appearanceBackground').value,
            avatar: document.getElementById('appearanceAvatar').value
        });
    }
    await loadSettingsManageBacLink();
    await loadGoogleSyncStatus();
    await renderGoogleSyncHistory();
    if (window.location.hash === '#googleSyncHistoryPanel') {
        const panel = document.getElementById('googleSyncHistoryPanel');
        if (panel) panel.hidden = false;
    }
}

function setupEventListeners() {
    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    document.getElementById('exportBtn')?.addEventListener('click', exportData);
    document.getElementById('importJsonBtn')?.addEventListener('click', () => document.getElementById('importJsonInput')?.click());
    document.getElementById('importJsonInput')?.addEventListener('change', importData);
    document.getElementById('resetSettingsBtn')?.addEventListener('click', resetSettings);
    document.getElementById('importMatrixViewBtn')?.addEventListener('click', () => {
        window.location.href = 'matrixview.html';
    });
    document.getElementById('settingsSaveManageBacIcsLinkBtn')?.addEventListener('click', handleSettingsSaveManageBacIcsLink);
    document.getElementById('settingsSyncManageBacBtn')?.addEventListener('click', handleSettingsManageBacSync);
    document.getElementById('connectGoogleSyncBtn')?.addEventListener('click', handleConnectGoogleSync);
    document.getElementById('switchGoogleSyncAccountBtn')?.addEventListener('click', handleSwitchGoogleSyncAccount);
    document.getElementById('connectAndRestoreGoogleSyncBtn')?.addEventListener('click', handleConnectAndRestoreGoogleSync);
    document.getElementById('syncGoogleNowBtn')?.addEventListener('click', handleGoogleSyncNow);
    document.getElementById('restoreGoogleSyncBtn')?.addEventListener('click', handleRestoreGoogleSync);
    document.getElementById('uploadGoogleSyncBtn')?.addEventListener('click', handleUploadGoogleSync);
    document.getElementById('disconnectGoogleSyncBtn')?.addEventListener('click', handleDisconnectGoogleSync);
    document.getElementById('revokeGoogleSyncBtn')?.addEventListener('click', handleRevokeGoogleSyncAuthorization);
    document.getElementById('processGoogleConflictsBtn')?.addEventListener('click', () => {
        showStoredGoogleSyncConflicts({ fallbackSync: true, showHintOnEmpty: true });
    });
    document.getElementById('toggleGoogleSyncHistoryBtn')?.addEventListener('click', toggleGoogleSyncHistoryPanel);
    document.getElementById('clearGoogleSyncHistoryBtn')?.addEventListener('click', handleClearGoogleSyncHistory);
    document.getElementById('testNotificationBtn')?.addEventListener('click', handleTestNotification);
    document.getElementById('desktopBridgeExtensionPreset')?.addEventListener('change', updateDesktopBridgeCustomField);
    document.getElementById('connectDesktopBridgeBtn')?.addEventListener('click', handleConnectDesktopBridge);
    document.getElementById('closeGoogleSyncDangerModal')?.addEventListener('click', closeGoogleSyncDangerModal);
    document.getElementById('cancelGoogleSyncDangerBtn')?.addEventListener('click', closeGoogleSyncDangerModal);
    document.getElementById('confirmGoogleSyncDangerBtn')?.addEventListener('click', confirmGoogleSyncDangerAction);
    document.getElementById('googleSyncDangerConfirmInput')?.addEventListener('input', updateGoogleSyncDangerConfirmState);
    document.getElementById('appearanceBackground')?.addEventListener('change', previewAppearanceSettings);
    document.getElementById('appearanceAvatar')?.addEventListener('change', previewAppearanceSettings);
    document.getElementById('desktopCloseToTray')?.addEventListener('change', handleDesktopSystemSettingsChange);
    document.getElementById('desktopStartAtLogin')?.addEventListener('change', handleDesktopSystemSettingsChange);
    window.addEventListener('timewhere-desktop-sync-status', () => {
        updateGoogleSyncServiceDisplay();
    });
    window.addEventListener('timewhere-google-sync-state', () => {
        loadGoogleSyncStatus().catch(error => console.warn('刷新 Google 同步状态失败：', error));
    });
    window.addEventListener('timewhere-google-sync-history', () => {
        renderGoogleSyncHistory().catch(error => console.warn('刷新 Google 同步记录失败：', error));
    });
    setupImportEvents();
}

function previewAppearanceSettings() {
    if (typeof TimeWhereAppearance === 'undefined') return;
    TimeWhereAppearance.applyValues({
        background: document.getElementById('appearanceBackground')?.value || 'calm',
        avatar: document.getElementById('appearanceAvatar')?.value || 'default'
    });
}

function isDesktopElectronPlatform() {
    return globalThis.TimeWherePlatform?.name === 'desktop-electron';
}

async function setupDesktopIntegration() {
    const section = document.getElementById('desktopIntegrationSection');
    if (!section) return;
    section.hidden = !isDesktopElectronPlatform();
    if (section.hidden) return;
    updateDesktopBridgeCustomField();
    await refreshDesktopBridgeStatus();
    await refreshDesktopSystemSettings();
}

function updateDesktopBridgeCustomField() {
    const preset = document.getElementById('desktopBridgeExtensionPreset')?.value || '';
    const field = document.getElementById('desktopBridgeCustomField');
    if (field) field.hidden = preset !== 'custom';
}

function getSelectedDesktopBridgeExtensionId() {
    const preset = document.getElementById('desktopBridgeExtensionPreset')?.value || '';
    if (preset === 'custom') {
        return document.getElementById('desktopBridgeCustomExtensionId')?.value?.trim().toLowerCase() || '';
    }
    return preset;
}

function setDesktopBridgeStatus(message, status = 'idle', version = '') {
    const statusEl = document.getElementById('desktopBridgeStatus');
    const versionEl = document.getElementById('desktopBridgeVersion');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.dataset.status = status;
    }
    if (versionEl) versionEl.textContent = version || '';
}

function updateDesktopBridgeControls() {
    const disabled = desktopBridgeInProgress || desktopSystemSettingsInProgress || !isDesktopElectronPlatform();
    [
        'desktopBridgeExtensionPreset',
        'desktopBridgeCustomExtensionId',
        'connectDesktopBridgeBtn',
        'desktopCloseToTray',
        'desktopStartAtLogin'
    ].forEach(id => document.getElementById(id)?.toggleAttribute('disabled', disabled));
}

function readDesktopSystemSettingsInputs() {
    return {
        closeToTray: !!document.getElementById('desktopCloseToTray')?.checked,
        startAtLogin: !!document.getElementById('desktopStartAtLogin')?.checked
    };
}

function applyDesktopSystemSettingsToInputs(settings = {}) {
    const normalized = {
        minimizeToTray: settings.minimizeToTray ?? desktopSystemSettingsDefaults.minimizeToTray,
        closeToTray: settings.closeToTray ?? desktopSystemSettingsDefaults.closeToTray,
        startAtLogin: settings.startAtLogin ?? desktopSystemSettingsDefaults.startAtLogin
    };
    const closeEl = document.getElementById('desktopCloseToTray');
    const startAtLoginEl = document.getElementById('desktopStartAtLogin');
    if (closeEl) closeEl.checked = normalized.closeToTray === true;
    if (startAtLoginEl) startAtLoginEl.checked = normalized.startAtLogin === true;
}

async function refreshDesktopSystemSettings() {
    if (!isDesktopElectronPlatform() || typeof globalThis.TimeWherePlatform?.system?.getDesktopSettings !== 'function') {
        return;
    }
    try {
        const result = await globalThis.TimeWherePlatform.system.getDesktopSettings();
        if (result?.status === 'ok' && result.settings) {
            applyDesktopSystemSettingsToInputs(result.settings);
            return;
        }
        applyDesktopSystemSettingsToInputs({});
    } catch (error) {
        console.warn('读取桌面托盘/开机设置失败：', error);
        applyDesktopSystemSettingsToInputs({});
    }
}

async function handleDesktopSystemSettingsChange() {
    if (!isDesktopElectronPlatform() || typeof globalThis.TimeWherePlatform?.system?.setDesktopSettings !== 'function') {
        return;
    }
    const nextSettings = readDesktopSystemSettingsInputs();
    desktopSystemSettingsInProgress = true;
    updateDesktopBridgeControls();
    try {
        const result = await globalThis.TimeWherePlatform.system.setDesktopSettings(nextSettings);
        if (result?.status === 'ok') {
            applyDesktopSystemSettingsToInputs(result.settings || nextSettings);
            showToast('桌面集成设置已应用', 'success');
            return;
        }
        showToast(`应用失败：${result?.reason || 'unknown'}`, 'error');
        if (result?.settings) {
            applyDesktopSystemSettingsToInputs(result.settings);
        } else {
            await refreshDesktopSystemSettings();
        }
    } catch (error) {
        showToast(`应用失败：${error.message}`, 'error');
        await refreshDesktopSystemSettings();
    } finally {
        desktopSystemSettingsInProgress = false;
        updateDesktopBridgeControls();
    }
}

async function refreshDesktopBridgeStatus() {
    if (!isDesktopElectronPlatform() || typeof globalThis.TimeWherePlatform?.chromeBridge?.getStatus !== 'function') return;
    const state = await globalThis.TimeWherePlatform.chromeBridge.getStatus();
    if (state?.status === 'connected') {
        setDesktopBridgeStatus('● 已连接', 'connected', `${state.extensionId || ''} ${state.version ? `v${state.version}` : ''}`.trim());
    } else if (state?.status === 'waiting') {
        setDesktopBridgeStatus('● 等待控件响应', 'waiting', state.extensionId || '');
    } else {
        setDesktopBridgeStatus('○ 未连接', 'idle');
    }
}

function formatDesktopBridgeFailure(result = {}) {
    const reason = result.reason || result.status || 'unknown';
    const labels = {
        timeout: '未检测到控件，请确认已安装并允许打开扩展页面。',
        invalid_extension_id: '控件 ID 格式不正确。',
        nonce_mismatch: '握手校验失败，请重试。',
        extension_id_mismatch: '响应控件 ID 与选择不一致。',
        bridge_version_too_old: '控件版本过旧，需要更新到包含桌面 bridge 的版本。',
        invalid_message_type: '控件 bridge 响应格式不正确。',
        invalid_json: '控件 bridge 响应无法解析。'
    };
    return labels[reason] || `连接失败：${reason}`;
}

async function handleConnectDesktopBridge() {
    if (!isDesktopElectronPlatform()) return;
    const extensionId = getSelectedDesktopBridgeExtensionId();
    if (!/^[a-p]{32}$/.test(extensionId)) {
        setDesktopBridgeStatus('● 控件 ID 无效', 'failed');
        showToast('请输入有效的 32 位 Chrome 控件 ID', 'error');
        return;
    }
    desktopBridgeInProgress = true;
    updateDesktopBridgeControls();
    setDesktopBridgeStatus('● 等待控件响应', 'waiting', extensionId);
    try {
        const result = await globalThis.TimeWherePlatform.chromeBridge.connectExtension({ extensionId });
        if (result?.status === 'connected') {
            setDesktopBridgeStatus('● 已连接', 'connected', `${result.extensionId} ${result.version ? `v${result.version}` : ''}`.trim());
            showToast('Chrome 控件已连接；Windows 版仍可独立使用。', 'success');
            return;
        }
        const message = formatDesktopBridgeFailure(result);
        setDesktopBridgeStatus(`● ${message}`, result?.status || 'failed', extensionId);
        showToast(message, 'error');
    } catch (error) {
        setDesktopBridgeStatus('● 连接失败', 'failed', extensionId);
        showToast(`连接控件失败：${error.message}`, 'error');
    } finally {
        desktopBridgeInProgress = false;
        updateDesktopBridgeControls();
        updateDesktopBridgeCustomField();
    }
}

async function loadSettingsManageBacLink() {
    if (typeof TimeWhereManageBac === 'undefined') return;
    const config = await TimeWhereManageBac.getManageBacIcsConfig(TimeWhereDB);
    const input = document.getElementById('settingsManageBacIcsLinkInput');
    if (input && config?.link) input.value = config.link;
    if (config?.last_synced_at) {
        setSettingsManageBacStatus(`已配置；上次同步 ${config.last_task_count || 0} 个任务`, 'success');
    } else if (config?.link) {
        setSettingsManageBacStatus('已配置；尚未同步', 'info');
    } else {
        setSettingsManageBacStatus('未配置 ManageBac 链接', 'info');
    }
    updateSettingsManageBacControls();
}

function updateSettingsManageBacControls() {
    const disabled = settingsManageBacSyncInProgress || typeof TimeWhereManageBac === 'undefined';
    document.getElementById('settingsManageBacIcsLinkInput')?.toggleAttribute('disabled', disabled);
    document.getElementById('settingsSaveManageBacIcsLinkBtn')?.toggleAttribute('disabled', disabled);
    document.getElementById('settingsSyncManageBacBtn')?.toggleAttribute('disabled', disabled);
}

function setSettingsManageBacStatus(message, type = 'info') {
    const status = document.getElementById('settingsManageBacSyncStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
}

function setSettingsManageBacSyncInProgress(inProgress, message = '') {
    settingsManageBacSyncInProgress = inProgress;
    updateSettingsManageBacControls();
    if (message) setSettingsManageBacStatus(message, 'info');
}

async function handleSettingsSaveManageBacIcsLink() {
    if (typeof TimeWhereManageBac === 'undefined') {
        setSettingsManageBacStatus('ManageBac 模块未加载', 'error');
        return;
    }
    const link = document.getElementById('settingsManageBacIcsLinkInput')?.value?.trim() || '';
    if (!link) {
        setSettingsManageBacStatus('未配置：请填写 ManageBac 链接。', 'error');
        return;
    }

    setSettingsManageBacSyncInProgress(true, '正在保存 ManageBac 链接…');
    try {
        const result = await TimeWhereManageBac.saveManageBacIcsLink(TimeWhereDB, link, {
            confirmLinkChange: () => window.confirm(
                'ManageBac 链接已改变。保存新链接后，后续同步会按新 ICS 源更新本地 ManageBac source tasks，并删除旧源中已消失的 ManageBac source tasks。是否继续？'
            )
        });
        if (result.status === 'blocked') {
            setSettingsManageBacStatus('已取消：ManageBac 链接改变但未确认。', 'info');
            return;
        }
        setSettingsManageBacStatus('已保存 ManageBac 链接；可点击同步读取新增事件', 'success');
    } catch (error) {
        setSettingsManageBacStatus(`保存失败：${error.message}`, 'error');
    } finally {
        setSettingsManageBacSyncInProgress(false);
    }
}

async function handleSettingsManageBacSync() {
    if (typeof TimeWhereManageBac === 'undefined') {
        setSettingsManageBacStatus('ManageBac 模块未加载', 'error');
        return;
    }

    const link = document.getElementById('settingsManageBacIcsLinkInput')?.value?.trim() || '';
    let config = await TimeWhereManageBac.getManageBacIcsConfig(TimeWhereDB);
    if (!config?.link && !link) {
        setSettingsManageBacStatus('未配置：请先填写并保存 ManageBac 链接。', 'error');
        return;
    }

    setSettingsManageBacSyncInProgress(true, '正在读取 ManageBac ICS…');
    try {
        if (link && (!config?.link || TimeWhereManageBac.normalizeIcsLink(link) !== TimeWhereManageBac.normalizeIcsLink(config.link))) {
            const saveResult = await TimeWhereManageBac.saveManageBacIcsLink(TimeWhereDB, link, {
                confirmLinkChange: () => window.confirm(
                    'ManageBac 链接已改变。保存并同步新链接会按新 ICS 源更新本地 ManageBac source tasks，并删除旧源中已消失的 ManageBac source tasks。是否继续？'
                )
            });
            if (saveResult.status === 'blocked') {
                setSettingsManageBacStatus('已取消：ManageBac 链接改变但未确认。', 'info');
                return;
            }
            config = saveResult.config;
        }

        if (!config?.link) {
            setSettingsManageBacStatus('未配置：请先保存 ManageBac 链接。', 'error');
            return;
        }

        const icsText = await TimeWhereManageBac.fetchIcsText(config.link);
        setSettingsManageBacStatus('正在解析 ManageBac 新增事件…', 'info');
        const result = await TimeWhereManageBac.syncManageBacIcs(TimeWhereDB, icsText, config.link, { confirmLinkChange: true });
        const pendingRows = await TimeWhereManageBac.savePendingEventMappings(TimeWhereDB, result.pending_event_mappings || []);
        if (pendingRows.length === 0) {
            setSettingsManageBacStatus('ManageBac 没有新增任务。', 'success');
            return;
        }
        window.location.href = 'managebac-sync.html';
    } catch (error) {
        setSettingsManageBacStatus(`同步失败：${error.message}`, 'error');
    } finally {
        setSettingsManageBacSyncInProgress(false);
    }
}

function getGoogleSyncApi() {
    if (typeof TimeWhereGoogleSync === 'undefined') {
        throw new Error('Google 数据同步模块未加载');
    }
    return TimeWhereGoogleSync;
}

function createGoogleSyncRuntime() {
    const api = getGoogleSyncApi();
    const authAdapter = globalThis.TimeWherePlatform?.auth?.getGoogleToken && api.createTimeWherePlatformAuthAdapter
        ? api.createTimeWherePlatformAuthAdapter(globalThis.TimeWherePlatform)
        : api.createChromeIdentityAuthAdapter(typeof chrome !== 'undefined' ? chrome : null);
    const driveClient = api.createDriveAppDataClient({ authAdapter });
    return { api, authAdapter, driveClient };
}

function setGoogleSyncStatus(message, status = 'not_configured') {
    const el = document.getElementById('googleSyncStatus');
    if (!el) return;
    el.textContent = message;
    el.dataset.status = status;
}

function getGoogleSyncNotConfiguredMessage(reason = '') {
    if (reason === 'desktop_oauth_client_id_missing') {
        return '○ 桌面同步未配置';
    }
    return '○ 未连接';
}

function getGoogleSyncFailureReason(error = {}) {
    return error.code || error.reason || error.name || 'google_sync_failed';
}

function getGoogleSyncFailureMessage(error = {}) {
    const message = String(error.message || '');
    const reason = getGoogleSyncFailureReason(error);
    if (reason === 'desktop_token_storage_unavailable' || /token storage encryption is unavailable/i.test(message)) {
        return 'Windows 当前无法使用安全凭据存储保存 Google 授权。请确认 Windows Hello/系统凭据服务可用后重试。';
    }
    if (reason === 'desktop_oauth_saved_token_unreadable' || /cannot be decrypted/i.test(message)) {
        return '旧的桌面 Google 授权状态无法解密，TimeWhere 已清理旧状态；请重新连接 Google。';
    }
    if (reason === 'desktop_oauth_not_connected' || reason === 'not_authorized') {
        return 'Google 同步尚未连接，或旧授权已不可用。请重新点击连接 Google 后再同步。';
    }
    if (reason === 'desktop_oauth_network_failed' || /fetch failed|network request failed|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(message)) {
        return 'Google 授权已完成，但 TimeWhere 桌面进程无法连接 Google token 服务。请确认系统代理/VPN 允许 TimeWhere 访问 oauth2.googleapis.com 后重试。';
    }
    if (reason === 'desktop_oauth_account_required') {
        return '当前桌面授权缺少账户身份信息。请重新连接 Google，TimeWhere 会用账户身份隔离本地数据空间。';
    }
    if (reason === 'desktop_oauth_refresh_token_revoked' || /expired or revoked/i.test(message)) {
        return 'Google 授权已过期、被撤销，或与当前内部桌面包的 OAuth client metadata 不匹配。请重新连接 Google；本地数据不会删除。';
    }
    if (reason === 'desktop_oauth_session_control_required' || /invalid_rapt/i.test(message)) {
        return 'Google Workspace 会话策略要求重新授权。请重新连接 Google 后再同步；本地数据不会删除。';
    }
    if (reason === 'account_mismatch') {
        return '当前 Google 账户与这个 TimeWhere 本地数据空间不一致。请确认切换账户，或断开后回到原账户。';
    }
    if (reason === 'conflict_detail_missing') {
        return '同步状态显示有冲突，但本地冲突详情不可用。请重新手动同步以重建冲突列表。';
    }
    if (reason === 'invalid_client' || /client_secret is missing|invalid_client/i.test(message)) {
        return '当前内部桌面包应已内置 Google Desktop OAuth client metadata。若仍失败，请检查内置 client ID/secret 是否匹配、OAuth 同意屏幕测试账号、Drive API 权限，或断开后重新连接。';
    }
    if (reason === 'redirect_uri_mismatch' || /redirect_uri_mismatch/i.test(message)) {
        return 'Google OAuth redirect URI 不匹配。请确认 Google Cloud 中创建的是“桌面应用”OAuth client，而不是 Web 应用。';
    }
    if (reason === 'unauthorized_client' || /unauthorized_client/i.test(message)) {
        return '当前 OAuth client 不允许桌面授权。请确认客户端类型为“桌面应用”，并启用所需 API。';
    }
    if (reason === 'access_denied' || /access_denied/i.test(message)) {
        return 'Google 授权已取消或被拒绝，请重新点击连接并允许 Drive appDataFolder 权限。';
    }
    if (reason === 'insufficientPermissions' || /insufficient authentication scopes|insufficientPermissions/i.test(message)) {
        return 'Google Drive 授权缺少 appDataFolder 权限。请断开后重新连接 Google，并确认授权包含 Drive appDataFolder scope。';
    }
    if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED' || /accessNotConfigured|SERVICE_DISABLED/i.test(message)) {
        return 'Google Cloud 项目未对当前 OAuth client 启用 Drive API，或 Drive API 刚启用尚未生效。';
    }
    if (reason === 'appNotConfiguredForUser' || /appNotConfiguredForUser/i.test(message)) {
        return '当前 Google 账号未被允许使用此 OAuth 应用。请确认 OAuth 同意屏幕测试用户/发布状态。';
    }
    if (reason === 'invalid_grant' || /invalid_grant/i.test(message)) {
        return 'Google 授权码或旧授权已失效。若刚更换过内部桌面包，请先核对 OAuth client metadata 是否一致；否则请重新连接 Google。';
    }
    if (/Google Drive request failed \(403\)/i.test(message)) {
        return error.google_reason
            ? `Google Drive 请求被拒绝：${error.google_reason}。请按该原因检查 OAuth scope、Drive API、同意屏幕测试用户或账号权限。`
            : 'Google Drive 请求被拒绝。请确认 OAuth scope、Drive API、同意屏幕测试用户和账号权限。';
    }
    if (/Google Drive request failed/i.test(message)) {
        return message;
    }
    if (/Google auth token unavailable|Google authorization unavailable/i.test(message)) {
        return 'Google 授权状态不可用。请重新连接 Google 后再同步。';
    }
    return message || '未知错误';
}

function formatGoogleSyncDateTime(value) {
    if (!value) return '暂无';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '暂无';
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function getGoogleSyncAccountEmail() {
    return await TimeWhereDB.getSetting('google_sync_account_email');
}

function isSafeGoogleAccountPictureUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(String(url));
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch (_) {
        return false;
    }
}

function getGoogleSyncAccountInitial(info = {}) {
    const source = String(info.name || info.email || 'G').trim();
    return (source[0] || 'G').toUpperCase();
}

async function getGoogleSyncAccountDisplayInfo() {
    const cached = {
        account_key: await TimeWhereDB.getSetting('google_sync_account_key'),
        name: await TimeWhereDB.getSetting('google_sync_account_name'),
        email: await getGoogleSyncAccountEmail(),
        picture: await TimeWhereDB.getSetting('google_sync_account_picture')
    };
    if (!isDesktopElectronPlatform() || typeof globalThis.TimeWherePlatform?.auth?.getAccountInfo !== 'function') {
        return cached;
    }
    try {
        const info = await globalThis.TimeWherePlatform.auth.getAccountInfo();
        if (info?.connected) {
            if (info.account_key) await TimeWhereDB.setSetting('google_sync_account_key', info.account_key);
            await TimeWhereDB.setSetting('google_sync_account_name', info.name || null);
            await TimeWhereDB.setSetting('google_sync_account_email', info.email || null);
            await TimeWhereDB.setSetting('google_sync_account_picture', isSafeGoogleAccountPictureUrl(info.picture) ? info.picture : null);
            return {
                account_key: info.account_key || cached.account_key,
                name: info.name || null,
                email: info.email || null,
                picture: isSafeGoogleAccountPictureUrl(info.picture) ? info.picture : null
            };
        }
    } catch (_) {
        // Cached account display is enough for UI continuity.
    }
    return cached;
}

function formatGoogleSyncAccountLabel(info = {}) {
    const name = String(info.name || '').trim();
    const email = String(info.email || '').trim();
    if (name && email) return `已连接：${name} <${email}>`;
    if (email) return `已连接：${email}`;
    if (name) return `已连接：${name}`;
    return '已连接：Google 账户';
}

function renderGoogleSyncAccountChip(accountEl, info = {}) {
    if (!accountEl) return;
    const label = formatGoogleSyncAccountLabel(info);
    accountEl.textContent = '';
    accountEl.title = label;
    const avatar = document.createElement('span');
    avatar.className = 'google-sync-account-avatar';
    const picture = isSafeGoogleAccountPictureUrl(info.picture) ? info.picture : '';
    if (picture) {
        const img = document.createElement('img');
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.src = picture;
        img.addEventListener('error', () => {
            avatar.textContent = getGoogleSyncAccountInitial(info);
            avatar.classList.add('fallback');
        }, { once: true });
        avatar.appendChild(img);
    } else {
        avatar.textContent = getGoogleSyncAccountInitial(info);
        avatar.classList.add('fallback');
    }
    const text = document.createElement('span');
    text.className = 'google-sync-account-label';
    text.textContent = label;
    accountEl.appendChild(avatar);
    accountEl.appendChild(text);
}

async function updateGoogleSyncAccountDisplay(state = null) {
    const accountEl = document.getElementById('googleSyncAccountEmail');
    const connectBtn = document.getElementById('connectGoogleSyncBtn');
    const switchBtn = document.getElementById('switchGoogleSyncAccountBtn');
    const disconnectBtn = document.getElementById('disconnectGoogleSyncBtn');
    const revokeBtn = document.getElementById('revokeGoogleSyncBtn');
    const connected = isGoogleSyncConnectedState(state);
    const accountInfo = connected ? await getGoogleSyncAccountDisplayInfo() : null;
    if (accountEl) {
        accountEl.hidden = !connected;
        if (connected) {
            renderGoogleSyncAccountChip(accountEl, accountInfo || {});
        } else {
            accountEl.textContent = '';
            accountEl.title = '';
        }
    }
    if (connectBtn) {
        connectBtn.hidden = connected;
        connectBtn.textContent = '连接 Google 账户同步';
    }
    if (switchBtn) {
        switchBtn.hidden = !connected;
        switchBtn.textContent = '切换账户';
    }
    if (disconnectBtn) {
        disconnectBtn.hidden = !connected;
        disconnectBtn.textContent = '断开本机同步';
        disconnectBtn.title = '仅断开这台设备，不撤销 Google 授权，也不影响其他设备。';
    }
    if (revokeBtn) {
        revokeBtn.hidden = !connected || !isDesktopElectronPlatform();
        revokeBtn.textContent = '撤销授权';
        revokeBtn.title = '向 Google 撤销 TimeWhere 授权；同一 Google 项目下其他设备的授权也可能失效。';
    }
}

function updateGoogleSyncLastSyncDisplay(state = null) {
    const el = document.getElementById('googleSyncLastSyncAt');
    if (!el) return;
    el.textContent = `最近同步：${formatGoogleSyncDateTime(state?.last_success_at || state?.last_restore_at || state?.last_force_upload_at)}`;
}

async function updateGoogleSyncServiceDisplay() {
    const el = document.getElementById('googleSyncAutoStatus');
    if (!el) return;
    if (!isDesktopElectronPlatform() || typeof globalThis.TimeWherePlatform?.sync?.getStatus !== 'function') {
        el.textContent = '自动同步：已开启';
        return;
    }
    try {
        const status = await globalThis.TimeWherePlatform.sync.getStatus();
        if (status?.status === 'paused' && status.pause_reason === 'conflict') {
            el.textContent = `桌面后台同步：冲突暂停${status.conflict_count ? `（${status.conflict_count}）` : ''}`;
            return;
        }
        if (status?.status === 'long_running') {
            el.textContent = `桌面后台同步：同步耗时较长（${formatGoogleSyncDuration(status.current_run_duration_ms)}）`;
            return;
        }
        if (status?.running) {
            el.textContent = `桌面后台同步：同步中（${formatGoogleSyncDuration(status.current_run_duration_ms)}）`;
            return;
        }
        if (status?.pending || status?.status === 'queued') {
            const triggerCount = Number(status.pending_trigger_count || 0);
            const reasonText = formatGoogleSyncReasonList(status.pending_reasons);
            el.textContent = `桌面后台同步：同步排队中${triggerCount ? `（${triggerCount} 次触发：${reasonText}）` : ''}`;
            return;
        }
        if (status?.status === 'backoff' || status?.retry_after) {
            el.textContent = `桌面后台同步：等待重试 ${formatGoogleSyncDateTime(status.retry_after)}`;
            return;
        }
        if (status?.status === 'failed') {
            el.textContent = '桌面后台同步：失败';
            return;
        }
        if (status?.started) {
            el.textContent = status?.next_run_at
                ? `桌面后台同步：等待下次自动同步 ${formatGoogleSyncDateTime(status.next_run_at)}`
                : '桌面后台同步：已开启';
            return;
        }
        el.textContent = '桌面后台同步：未启动';
    } catch (_) {
        el.textContent = '桌面后台同步：状态不可用';
    }
}

function updateGoogleSyncConflictButton(count = 0) {
    const btn = document.getElementById('processGoogleConflictsBtn');
    if (!btn) return;
    const hasConflicts = Number(count) > 0;
    btn.hidden = !hasConflicts;
    btn.textContent = hasConflicts ? `处理 ${count} 项冲突` : '处理冲突';
}

function toggleGoogleSyncHistoryPanel() {
    const panel = document.getElementById('googleSyncHistoryPanel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
        renderGoogleSyncHistory().catch(error => console.warn('加载 Google 同步记录失败：', error));
    }
}

function formatGoogleSyncDuration(ms) {
    const number = Number(ms || 0);
    if (!Number.isFinite(number) || number <= 0) return '0 秒';
    if (number < 1000) return `${Math.round(number)} ms`;
    return `${Math.round(number / 100) / 10} 秒`;
}

function formatGoogleSyncReasonList(reasons = []) {
    const safeReasons = Array.isArray(reasons) ? reasons.filter(Boolean).slice(0, 3) : [];
    return safeReasons.length ? safeReasons.join(' / ') : '自动同步';
}

function formatGoogleSyncHistoryStatus(record = {}) {
    const labels = {
        synced: '同步成功',
        up_to_date: '已是最新',
        conflict: '有冲突',
        conflict_remaining: '冲突未完成',
        resolved: '冲突已处理',
        pending_retry: '等待重试',
        force_uploaded: '已上传覆盖云端',
        restored: '已下载到本地',
        not_configured: '未连接',
        no_cloud_sync_document: '云端暂无数据',
        failed: '同步失败'
    };
    return labels[record.status] || record.status || '未知状态';
}

function formatGoogleSyncHistoryCounts(record = {}) {
    const counts = record.counts || {};
    const parts = [];
    if (counts.applied_local) parts.push(`下载/应用 ${counts.applied_local}`);
    if (counts.uploaded) parts.push(`上传 ${counts.uploaded}`);
    if (counts.tombstones) parts.push(`删除同步 ${counts.tombstones}`);
    if (record.conflict_count) parts.push(`冲突 ${record.conflict_count}`);
    if (counts.entity_count) parts.push(`云端记录 ${counts.entity_count}`);
    return parts.join(' · ') || '无数据变更';
}

function renderGoogleSyncHistoryError(record = {}) {
    const error = record.error || {};
    const parts = [
        error.reason || record.reason,
        error.http_status ? `HTTP ${error.http_status}` : '',
        error.google_reason,
        error.google_status,
        error.message
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : '无失败详情';
}

function renderGoogleSyncHistoryRecord(record = {}) {
    const status = escapeGoogleSyncText(formatGoogleSyncHistoryStatus(record));
    const counts = escapeGoogleSyncText(formatGoogleSyncHistoryCounts(record));
    const started = escapeGoogleSyncText(formatGoogleSyncDateTime(record.started_at));
    const finished = escapeGoogleSyncText(formatGoogleSyncDateTime(record.finished_at));
    const trigger = escapeGoogleSyncText(record.trigger || 'unknown');
    const duration = escapeGoogleSyncText(formatGoogleSyncDuration(record.duration_ms));
    const cloudUpdated = escapeGoogleSyncText(formatGoogleSyncDateTime(record.cloud_updated_at));
    const queueDetail = record.queue_wait_ms
        ? `<div><span>排队等待</span><strong>${escapeGoogleSyncText(formatGoogleSyncDuration(record.queue_wait_ms))}</strong></div>`
        : '';
    const coalescedDetail = record.coalesced_trigger_count
        ? `<div><span>合并触发</span><strong>${escapeGoogleSyncText(record.coalesced_trigger_count)} 次 · ${escapeGoogleSyncText(formatGoogleSyncReasonList(record.coalesced_reasons))}</strong></div>`
        : '';
    const longRunningDetail = record.long_running
        ? '<div><span>运行状态</span><strong>同步耗时较长</strong></div>'
        : '';
    const error = record.status === 'failed'
        ? `<div><span>失败原因</span><strong>${escapeGoogleSyncText(renderGoogleSyncHistoryError(record))}</strong></div>`
        : '';
    return `
        <details class="google-sync-history-item" data-status="${escapeGoogleSyncText(record.status || 'unknown')}">
            <summary>
                <span class="google-sync-history-status">${status}</span>
                <span class="google-sync-history-time">${finished}</span>
                <span class="google-sync-history-counts">${counts}</span>
            </summary>
            <div class="google-sync-history-detail">
                <div><span>触发来源</span><strong>${trigger}</strong></div>
                <div><span>开始</span><strong>${started}</strong></div>
                <div><span>结束</span><strong>${finished}</strong></div>
                <div><span>耗时</span><strong>${duration}</strong></div>
                ${queueDetail}
                ${coalescedDetail}
                ${longRunningDetail}
                <div><span>云端修订</span><strong>${cloudUpdated}</strong></div>
                ${error}
            </div>
        </details>
    `;
}

async function renderGoogleSyncHistory() {
    const listEl = document.getElementById('googleSyncHistoryList');
    if (!listEl || typeof TimeWhereGoogleSync === 'undefined') return;
    const history = await TimeWhereGoogleSync.getGoogleSyncHistory(TimeWhereDB, { limit: 20 });
    if (!history.length) {
        listEl.innerHTML = '<p class="setting-desc google-sync-history-empty">暂无同步记录。</p>';
        return;
    }
    listEl.innerHTML = history.map(renderGoogleSyncHistoryRecord).join('');
}

async function handleClearGoogleSyncHistory() {
    if (typeof TimeWhereGoogleSync === 'undefined') return;
    const confirmed = window.confirm('清空本机同步记录？这不会删除任务、日程或云端同步数据。');
    if (!confirmed) return;
    await TimeWhereGoogleSync.clearGoogleSyncHistory(TimeWhereDB);
    await renderGoogleSyncHistory();
    showToast('同步记录已清空', 'success');
}

function isGoogleSyncConnectedState(state = null) {
    if (['connected', 'conflict', 'pending_retry', 'syncing'].includes(state?.status)) return true;
    if (state?.status !== 'failed') return false;
    return Boolean(state.connected_at || state.last_success_at || state.last_restore_at || state.last_force_upload_at);
}

async function getGoogleSyncLocalUserDataCounts() {
    const safeCount = async getter => {
        if (typeof getter !== 'function') return 0;
        const rows = await getter.call(TimeWhereDB);
        return Array.isArray(rows) ? rows.length : 0;
    };
    const journals = typeof TimeWhereDB.listDailyJournals === 'function'
        ? await TimeWhereDB.listDailyJournals()
        : [];
    const meaningfulJournals = Array.isArray(journals)
        ? journals.filter(isMeaningfulGoogleSyncRecoveryJournal)
        : [];
    const counts = {
        tasks: await safeCount(TimeWhereDB.getAllTasks),
        events: await safeCount(TimeWhereDB.getEvents),
        habits: await safeCount(TimeWhereDB.getHabits),
        daily_journals: meaningfulJournals.length
    };
    counts.total = counts.tasks + counts.events + counts.habits + counts.daily_journals;
    return counts;
}

function isMeaningfulGoogleSyncRecoveryJournal(journal = {}) {
    const hasNotes = [
        journal.planned_notes,
        journal.delayed_notes,
        journal.extra_done_notes,
        journal.general_notes
    ].some(value => String(value || '').trim());
    const hasTaskSnapshots = [
        journal.planned_task_snapshots,
        journal.completed_task_snapshots,
        journal.delayed_task_snapshots,
        journal.extra_done_task_snapshots,
        journal.completion_task_snapshots,
        journal.completion_extra_task_snapshots
    ].some(value => Array.isArray(value) && value.length > 0);
    return journal.status === 'submitted' || hasNotes || hasTaskSnapshots;
}

async function updateGoogleSyncRecoveryHint(state = null) {
    const hint = document.getElementById('googleSyncRecoveryHint');
    const btn = document.getElementById('connectAndRestoreGoogleSyncBtn');
    if (!hint) return;
    if (typeof TimeWhereGoogleSync === 'undefined' || typeof TimeWhereDB === 'undefined' || isGoogleSyncConnectedState(state)) {
        hint.hidden = true;
        return;
    }
    try {
        const counts = await getGoogleSyncLocalUserDataCounts();
        hint.hidden = counts.total !== 0;
        if (btn) btn.disabled = googleSyncInProgress;
    } catch (_) {
        hint.hidden = true;
    }
}

function updateGoogleSyncControls() {
    const disabled = googleSyncInProgress || typeof TimeWhereGoogleSync === 'undefined';
    [
        'connectGoogleSyncBtn',
        'switchGoogleSyncAccountBtn',
        'connectAndRestoreGoogleSyncBtn',
        'syncGoogleNowBtn',
        'restoreGoogleSyncBtn',
        'uploadGoogleSyncBtn',
        'disconnectGoogleSyncBtn',
        'revokeGoogleSyncBtn'
    ].forEach(id => document.getElementById(id)?.toggleAttribute('disabled', disabled));
}

function setGoogleSyncInProgress(inProgress, message = '') {
    googleSyncInProgress = inProgress;
    updateGoogleSyncControls();
    if (message) setGoogleSyncStatus(message, 'syncing');
}

async function loadGoogleSyncStatus() {
    if (typeof TimeWhereGoogleSync === 'undefined') {
        setGoogleSyncStatus('○ 未连接', 'not_configured');
        await updateGoogleSyncAccountDisplay({ status: 'not_configured' });
        updateGoogleSyncLastSyncDisplay(null);
        updateGoogleSyncConflictButton(0);
        updateGoogleSyncControls();
        await updateGoogleSyncRecoveryHint({ status: 'not_configured' });
        return;
    }
    const state = await TimeWhereGoogleSync.getGoogleSyncState(TimeWhereDB);
    if (state?.status === 'connected') {
        setGoogleSyncStatus('● 已连接', 'connected');
        updateGoogleSyncConflictButton(0);
    } else if (state?.status === 'conflict') {
        setGoogleSyncStatus(`● 有冲突待处理${state.conflict_count ? `（${state.conflict_count}）` : ''}`, 'conflict');
        await syncAndShowGoogleSyncConflicts(state.conflict_count || 0, { fallbackSync: true });
    } else if (state?.status === 'failed') {
        const message = state?.last_error ? getGoogleSyncFailureMessage({ ...state, message: state.last_error }) : '';
        setGoogleSyncStatus(message ? `● 同步失败：${message}` : '● 同步失败', 'failed');
        updateGoogleSyncConflictButton(0);
    } else if (state?.status === 'pending_retry') {
        setGoogleSyncStatus('● 等待重试', 'retry');
        updateGoogleSyncConflictButton(0);
    } else if (state?.status === 'syncing') {
        setGoogleSyncStatus('● 同步中', 'syncing');
        updateGoogleSyncConflictButton(0);
    } else {
        setGoogleSyncStatus(getGoogleSyncNotConfiguredMessage(state?.reason), 'not_configured');
        updateGoogleSyncConflictButton(0);
    }
    await updateGoogleSyncAccountDisplay(state);
    updateGoogleSyncLastSyncDisplay(state);
    await updateGoogleSyncServiceDisplay();
    updateGoogleSyncControls();
    await updateGoogleSyncRecoveryHint(state);
}

async function confirmDesktopGoogleAccountSwitch(result = {}) {
    if (!isDesktopElectronPlatform() || !result.pending_auth_id) return result;
    const current = result.current_account || {};
    const authorized = result.authorized_account || {};
    const currentLabel = current.email || current.name || '当前本地数据空间';
    const authorizedLabel = authorized.email || authorized.name || '新 Google 账户';
    const confirmed = window.confirm(
        `当前本地数据空间已绑定 ${currentLabel}。\n\n你刚刚授权的是 ${authorizedLabel}。\n\n确认后 TimeWhere 会切换到该 Google 账户独立的数据空间，原账户本地数据会保留。`
    );
    if (!confirmed) {
        return { status: 'account_mismatch_cancelled', reason: 'account_mismatch' };
    }
    const switchResult = await globalThis.TimeWherePlatform.system.confirmGoogleAccountSwitch({
        pending_auth_id: result.pending_auth_id
    });
    if (switchResult?.status !== 'ok') {
        return {
            status: 'failed',
            reason: switchResult?.reason || 'account_switch_failed',
            message: switchResult?.message || 'Google account data-space switch failed'
        };
    }
    return { status: 'profile_switched', profile: switchResult.profile };
}

async function connectGoogleSyncAccount(options = {}) {
    const { api, authAdapter } = createGoogleSyncRuntime();
    const result = await authAdapter.connect({ force_account_selection: options.force_account_selection === true });
    if (result.status === 'not_configured') {
        await api.saveGoogleSyncState(TimeWhereDB, {
            status: 'not_configured',
            reason: result.reason || 'oauth_client_id_missing'
        });
        return { status: 'not_configured', reason: result.reason || 'oauth_client_id_missing' };
    }
    if (result.status === 'account_mismatch') {
        return await confirmDesktopGoogleAccountSwitch(result);
    }
    const accountInfo = await authAdapter.getAccountInfo?.();
    if (accountInfo?.account_key) {
        await TimeWhereDB.setSetting('google_sync_account_key', accountInfo.account_key);
    }
    await TimeWhereDB.setSetting('google_sync_account_name', accountInfo?.name || null);
    await TimeWhereDB.setSetting('google_sync_account_email', accountInfo?.email || null);
    await TimeWhereDB.setSetting('google_sync_account_picture', isSafeGoogleAccountPictureUrl(accountInfo?.picture) ? accountInfo.picture : null);
    await api.saveGoogleSyncState(TimeWhereDB, {
        status: 'connected',
        connected_at: new Date().toISOString()
    });
    return { status: 'connected' };
}

function requestDesktopSyncAfterConnect(reason = 'connect_success') {
    if (!isDesktopElectronPlatform() || typeof globalThis.TimeWherePlatform?.sync?.requestRun !== 'function') {
        return false;
    }
    setGoogleSyncStatus('● 首次同步已启动', 'syncing');
    globalThis.TimeWherePlatform.sync.requestRun({ reason, force: true })
        .then(result => {
            if (result?.status === 'queued') {
                setGoogleSyncStatus('● 同步排队中', 'queued');
                showToast('Google 已连接，首次同步已排队。', 'info');
                return;
            }
            if (result?.status === 'failed') {
                markGoogleSyncFailed(result).catch(() => null);
                return;
            }
            loadGoogleSyncStatus().catch(() => null);
        })
        .catch(error => {
            markGoogleSyncFailed(error).catch(() => null);
        });
    return true;
}

async function handleConnectGoogleSync() {
    setGoogleSyncInProgress(true, '正在连接 Google 同步…');
    try {
        const result = await connectGoogleSyncAccount();
        if (result.status === 'not_configured') {
            setGoogleSyncStatus(getGoogleSyncNotConfiguredMessage(result.reason), 'not_configured');
            showToast(result.reason === 'desktop_oauth_client_id_missing'
                ? '桌面 Google OAuth client ID 未配置；Windows 本地功能不受影响。'
                : 'Google OAuth client ID 未配置；本地功能不受影响。', 'info');
            return;
        }
        if (result.status === 'profile_switched') {
            setGoogleSyncStatus('● 正在切换账户数据空间', 'syncing');
            showToast('已确认切换 Google 账户数据空间，TimeWhere 正在重新打开。', 'success');
            return;
        }
        if (result.status === 'account_mismatch_cancelled') {
            await TimeWhereGoogleSync.saveGoogleSyncState(TimeWhereDB, {
                status: 'failed',
                reason: 'account_mismatch',
                last_error: getGoogleSyncFailureMessage({ reason: 'account_mismatch' })
            });
            setGoogleSyncStatus('● 账户不匹配', 'failed');
            showToast(getGoogleSyncFailureMessage({ reason: 'account_mismatch' }), 'info');
            return;
        }
        const desktopSyncRequested = requestDesktopSyncAfterConnect('connect_success');
        if (!desktopSyncRequested) {
            setGoogleSyncStatus('● 已连接', 'connected');
        }
        await loadGoogleSyncStatus();
        showToast(desktopSyncRequested ? 'Google 数据同步已连接，正在启动首次同步。' : 'Google 数据同步已连接', 'success');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
        await loadGoogleSyncStatus();
    }
}

async function handleConnectAndRestoreGoogleSync() {
    setGoogleSyncInProgress(true, '正在连接 Google 同步…');
    let connected = false;
    try {
        const result = await connectGoogleSyncAccount();
        if (result.status === 'not_configured') {
            setGoogleSyncStatus(getGoogleSyncNotConfiguredMessage(result.reason), 'not_configured');
            showToast(result.reason === 'desktop_oauth_client_id_missing'
                ? '桌面 Google OAuth client ID 未配置；无法从云端恢复。'
                : 'Google OAuth client ID 未配置；无法从云端恢复。', 'info');
            return;
        }
        if (result.status === 'profile_switched') {
            setGoogleSyncStatus('● 正在切换账户数据空间', 'syncing');
            showToast('已确认切换 Google 账户数据空间，TimeWhere 正在重新打开。', 'success');
            return;
        }
        if (result.status === 'account_mismatch_cancelled') {
            await TimeWhereGoogleSync.saveGoogleSyncState(TimeWhereDB, {
                status: 'failed',
                reason: 'account_mismatch',
                last_error: getGoogleSyncFailureMessage({ reason: 'account_mismatch' })
            });
            setGoogleSyncStatus('● 账户不匹配', 'failed');
            showToast(getGoogleSyncFailureMessage({ reason: 'account_mismatch' }), 'info');
            return;
        }
        connected = true;
        setGoogleSyncStatus('● 已连接', 'connected');
        showToast('Google 已连接。请在确认框中确认是否下载到本地。', 'info');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
        await loadGoogleSyncStatus();
    }
    if (connected) {
        openGoogleSyncDangerModal('restore');
    }
}

async function handleUploadGoogleSync() {
    openGoogleSyncDangerModal('upload');
}

async function executeUploadGoogleSync() {
    setGoogleSyncInProgress(true, '正在上传到云端…');
    try {
        const { api, driveClient } = createGoogleSyncRuntime();
        const result = await api.forceUploadLocalToCloud(TimeWhereDB, driveClient);
        if (result.status === 'not_configured') {
            await api.saveGoogleSyncState(TimeWhereDB, { status: 'not_configured', reason: result.reason });
            setGoogleSyncStatus(getGoogleSyncNotConfiguredMessage(result.reason), 'not_configured');
            showToast('Google OAuth client ID 未配置，无法上传到 Drive。', 'info');
            return;
        }
        hideGoogleSyncPreview();
        setGoogleSyncStatus('● 已连接', 'connected');
        await loadGoogleSyncStatus();
        showToast('已上传到 Google 云端同步副本', 'success');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
    }
}

async function handleGoogleSyncNow() {
    setGoogleSyncInProgress(true, '正在自动合并本地 / 云端数据…');
    try {
        const { api, driveClient } = createGoogleSyncRuntime();
        const result = isDesktopElectronPlatform() && typeof globalThis.TimeWherePlatform?.sync?.requestRun === 'function'
            ? await globalThis.TimeWherePlatform.sync.requestRun({ reason: 'manual_sync', force: true })
            : await api.runAutoSync(TimeWhereDB, driveClient, { force: true });
        if (result?.status === 'queued') {
            setGoogleSyncStatus('● 同步排队中', 'queued');
            showToast('已有同步正在运行，已排队本次手动同步。', 'info');
            return;
        }
        if (result?.status === 'backoff') {
            setGoogleSyncStatus('● 等待重试', 'retry');
            showToast(`同步正在等待重试：${formatGoogleSyncDateTime(result.retry_after)}`, 'info');
            return;
        }
        if (result?.status === 'paused' && result.reason === 'conflict') {
            await showStoredGoogleSyncConflicts({ fallbackSync: true, showHintOnEmpty: true });
            setGoogleSyncStatus(`● 有冲突待处理${result.conflict_count ? `（${result.conflict_count}）` : ''}`, 'conflict');
            return;
        }
        if (result?.status === 'failed') {
            await markGoogleSyncFailed(result);
            return;
        }
        if (result?.status === 'not_configured') {
            await api.saveGoogleSyncState(TimeWhereDB, { status: 'not_configured', reason: result.reason });
            setGoogleSyncStatus(getGoogleSyncNotConfiguredMessage(result.reason), 'not_configured');
            showToast('Google OAuth client ID 未配置；无法同步。', 'info');
            return;
        }
        if (result.status === 'conflict') {
            const conflicts = result.conflicts || [];
            renderGoogleSyncConflicts(conflicts);
            setGoogleSyncStatus(`● 有冲突待处理（${conflicts.length}）`, 'conflict');
            updateGoogleSyncConflictButton(conflicts.length);
            showToast(`发现 ${conflicts.length} 项同步冲突，请选择处理方式。`, 'info');
            return;
        }
        hideGoogleSyncPreview();
        setGoogleSyncStatus('● 已连接', 'connected');
        await loadGoogleSyncStatus();
        showToast(result.status === 'up_to_date' ? '本地和云端已是最新。' : 'Google 数据同步完成。', 'success');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
    }
}

async function handleRestoreGoogleSync() {
    openGoogleSyncDangerModal('restore');
}

async function executeRestoreGoogleSync() {
    setGoogleSyncInProgress(true, '正在下载到本地…');
    try {
        const { api, driveClient } = createGoogleSyncRuntime();
        const result = await api.forceRestoreCloudToLocal(TimeWhereDB, driveClient);
        if (result?.status === 'not_configured') {
            await api.saveGoogleSyncState(TimeWhereDB, { status: 'not_configured', reason: result.reason });
            setGoogleSyncStatus(getGoogleSyncNotConfiguredMessage(result.reason), 'not_configured');
            showToast('Google OAuth client ID 未配置；无法下载到本地。', 'info');
            return;
        }
        if (!result || result.status === 'no_cloud_sync_document') {
            hideGoogleSyncPreview();
            showToast('云端暂无 TimeWhere 同步数据。', 'info');
            return;
        }
        hideGoogleSyncPreview();
        setGoogleSyncStatus('● 已连接', 'connected');
        await loadGoogleSyncStatus();
        showToast(`已从 Google 云端同步副本下载 ${result.applied_count || 0} 项到本地。`, 'success');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
    }
}

async function handleDisconnectGoogleSync() {
    setGoogleSyncInProgress(true, '正在断开本机 Google 同步…');
    try {
        const { api, authAdapter } = createGoogleSyncRuntime();
        await authAdapter.disconnect();
        await api.saveGoogleSyncState(TimeWhereDB, {
            status: 'not_configured',
            disconnected_at: new Date().toISOString()
        });
        await TimeWhereDB.setSetting('google_sync_account_key', null);
        await TimeWhereDB.setSetting('google_sync_account_name', null);
        await TimeWhereDB.setSetting('google_sync_account_email', null);
        await TimeWhereDB.setSetting('google_sync_account_picture', null);
        hideGoogleSyncPreview();
        setGoogleSyncStatus('○ 未连接', 'not_configured');
        await updateGoogleSyncAccountDisplay({ status: 'not_configured' });
        updateGoogleSyncLastSyncDisplay(null);
        updateGoogleSyncConflictButton(0);
        showToast('已断开这台设备的 Google 数据同步。本地数据保留，其他设备授权不受影响。', 'success');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
    }
}

function handleRevokeGoogleSyncAuthorization() {
    openGoogleSyncDangerModal('revoke_auth');
}

async function executeRevokeGoogleSyncAuthorization() {
    setGoogleSyncInProgress(true, '正在撤销 Google 授权…');
    try {
        const { api, authAdapter } = createGoogleSyncRuntime();
        if (typeof authAdapter.revoke !== 'function') {
            showToast('当前平台不支持直接撤销 Google 授权。', 'info');
            return;
        }
        const result = await authAdapter.revoke();
        if (result?.status === 'not_supported') {
            showToast('当前平台不支持直接撤销 Google 授权。', 'info');
            return;
        }
        await api.saveGoogleSyncState(TimeWhereDB, {
            status: 'not_configured',
            revoked_at: new Date().toISOString()
        });
        await TimeWhereDB.setSetting('google_sync_account_key', null);
        await TimeWhereDB.setSetting('google_sync_account_name', null);
        await TimeWhereDB.setSetting('google_sync_account_email', null);
        await TimeWhereDB.setSetting('google_sync_account_picture', null);
        hideGoogleSyncPreview();
        setGoogleSyncStatus('○ 未连接', 'not_configured');
        await updateGoogleSyncAccountDisplay({ status: 'not_configured' });
        updateGoogleSyncLastSyncDisplay(null);
        updateGoogleSyncConflictButton(0);
        showToast('已向 Google 撤销 TimeWhere 授权。本地数据保留。', 'success');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
    }
}

async function markGoogleSyncFailed(error) {
    const reason = getGoogleSyncFailureReason(error);
    const message = getGoogleSyncFailureMessage(error);
    try {
        if (typeof TimeWhereGoogleSync !== 'undefined') {
            await TimeWhereGoogleSync.saveGoogleSyncState(TimeWhereDB, {
                status: 'failed',
                reason,
                last_error: message,
                last_failed_at: new Date().toISOString(),
                last_http_status: error.http_status || null,
                last_google_reason: error.google_reason || null,
                last_google_status: error.google_status || null,
                last_google_message: error.google_message || null,
                last_auth_error_subtype: error.auth_error_subtype || error.google_error_subtype || null,
                last_oauth_diagnostics: error.oauth_diagnostics || null,
                retryable: error.retryable === true
            });
        }
    } catch (_) {
        // Status write failure should not hide the original sync error.
    }
    setGoogleSyncStatus('● 失败', 'failed');
    showToast(`Google 数据同步失败：${message}`, 'error');
}

const GOOGLE_SYNC_DANGER_COPY = {
    upload: {
        title: '上传到云端',
        message: '此操作会用本设备当前数据覆盖 Google 云端同步副本。',
        phrase: '上传到云端',
        confirmText: '确认上传到云端',
        risks: [
            '其他设备尚未同步的云端修改可能被覆盖。',
            '覆盖后，其他设备下次同步会以新的云端副本为准。',
            '此操作不是普通同步，仅用于确认本设备数据最可信的情况。'
        ],
        action: executeUploadGoogleSync
    },
    restore: {
        title: '下载到本地',
        message: '此操作会用 Google 云端同步副本覆盖本设备 IndexedDB 数据。',
        phrase: '下载到本地',
        confirmText: '确认下载到本地',
        risks: [
            '本设备尚未同步的本地修改可能被覆盖。',
            '覆盖后，本设备会以云端副本为准继续使用。',
            '此操作不是普通同步，仅用于确认云端数据最可信的情况。'
        ],
        action: executeRestoreGoogleSync
    },
    revoke_auth: {
        title: '撤销 Google 授权',
        message: '此操作会向 Google 撤销 TimeWhere 对当前账户的授权。本地数据会保留，但同一 Google 项目下其他设备的授权也可能失效。',
        phrase: '撤销 Google 授权',
        confirmText: '确认撤销授权',
        risks: [
            '这不是普通断开连接；它会请求 Google 作废已授予 TimeWhere 的 OAuth 授权。',
            'Windows、macOS 或其他使用同一 Google 项目的 TimeWhere 内部包可能需要重新连接。',
            '本地任务、日历和配置不会被删除。'
        ],
        action: executeRevokeGoogleSyncAuthorization
    }
};

function openGoogleSyncDangerModal(actionName) {
    const config = GOOGLE_SYNC_DANGER_COPY[actionName];
    if (!config) return;
    pendingGoogleSyncDangerAction = actionName;
    document.getElementById('googleSyncDangerTitle').textContent = config.title;
    document.getElementById('googleSyncDangerMessage').textContent = config.message;
    document.getElementById('googleSyncDangerPrompt').textContent = `请输入“${config.phrase}”以确认：`;
    document.getElementById('confirmGoogleSyncDangerBtn').textContent = config.confirmText;
    document.getElementById('confirmGoogleSyncDangerBtn').disabled = true;
    const input = document.getElementById('googleSyncDangerConfirmInput');
    input.value = '';
    const list = document.getElementById('googleSyncDangerRisks');
    list.innerHTML = config.risks.map(item => `<li>${escapeGoogleSyncText(item)}</li>`).join('');
    document.getElementById('googleSyncDangerModal').style.display = 'flex';
    setTimeout(() => input.focus(), 0);
}

function closeGoogleSyncDangerModal() {
    pendingGoogleSyncDangerAction = null;
    const modal = document.getElementById('googleSyncDangerModal');
    if (modal) modal.style.display = 'none';
    const input = document.getElementById('googleSyncDangerConfirmInput');
    if (input) input.value = '';
    const confirmBtn = document.getElementById('confirmGoogleSyncDangerBtn');
    if (confirmBtn) confirmBtn.disabled = true;
}

function updateGoogleSyncDangerConfirmState() {
    const config = GOOGLE_SYNC_DANGER_COPY[pendingGoogleSyncDangerAction];
    const input = document.getElementById('googleSyncDangerConfirmInput');
    const confirmBtn = document.getElementById('confirmGoogleSyncDangerBtn');
    if (!config || !input || !confirmBtn) return;
    confirmBtn.disabled = input.value.trim() !== config.phrase;
}

async function confirmGoogleSyncDangerAction() {
    const config = GOOGLE_SYNC_DANGER_COPY[pendingGoogleSyncDangerAction];
    if (!config) return;
    closeGoogleSyncDangerModal();
    await config.action();
}

function escapeGoogleSyncText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function summarizeGoogleSyncChange(change) {
    const label = change.item_type === 'setting'
        ? `设置：${change.id}`
        : `${change.table} / ${change.id}`;
    const typeText = {
        local_only: '仅本地存在',
        cloud_only: '仅云端存在',
        conflict: '双端内容不同'
    }[change.change_type] || change.change_type;
    return { label, typeText };
}

function renderGoogleSyncPreview(preview, defaultChoice = 'skip') {
    const container = document.getElementById('googleSyncPreview');
    if (!container) return;
    if (!preview.changes.length) {
        container.hidden = false;
        container.innerHTML = `
            <h3>Google 数据同步确认</h3>
            <p class="setting-desc">本地和云端快照一致，无需处理。</p>
        `;
        return;
    }
    const rows = preview.changes.map(change => {
        const summary = summarizeGoogleSyncChange(change);
        const selected = change.change_type === 'cloud_only' && defaultChoice === 'cloud' ? 'cloud' : defaultChoice;
        return `
            <div class="google-sync-preview-row" data-sync-change-key="${escapeGoogleSyncText(change.key)}">
                <div class="google-sync-preview-meta">
                    <span class="google-sync-preview-title">${escapeGoogleSyncText(summary.label)}</span>
                    <span class="google-sync-preview-desc">${escapeGoogleSyncText(summary.typeText)}</span>
                </div>
                <select class="google-sync-choice" data-change-key="${escapeGoogleSyncText(change.key)}">
                    <option value="skip" ${selected === 'skip' ? 'selected' : ''}>跳过</option>
                    <option value="local" ${selected === 'local' ? 'selected' : ''}>使用本地</option>
                    <option value="cloud" ${selected === 'cloud' ? 'selected' : ''}>使用云端</option>
                </select>
            </div>
        `;
    }).join('');
    container.hidden = false;
    container.innerHTML = `
        <h3>Google 数据同步确认</h3>
        <p class="setting-desc">发现 ${preview.changes.length} 项差异；确认前不会写入 IndexedDB。</p>
        <div class="google-sync-preview-list">${rows}</div>
        <div class="google-sync-preview-actions">
            <button class="action-btn" id="skipGoogleSyncPreviewBtn" type="button">全部跳过</button>
            <button class="action-btn" id="applyGoogleSyncPreviewBtn" type="button">确认同步选中项</button>
        </div>
    `;
    document.getElementById('skipGoogleSyncPreviewBtn')?.addEventListener('click', hideGoogleSyncPreview);
    document.getElementById('applyGoogleSyncPreviewBtn')?.addEventListener('click', handleApplyGoogleSyncPreview);
}

async function syncAndShowGoogleSyncConflicts(stateConflictCount = 0, { fallbackSync = false } = {}) {
    if (googleSyncConflictPanelInFlight) {
        return { count: 0, conflicts: [], recovered: false, reason: 'in_flight' };
    }
    googleSyncConflictPanelInFlight = true;
    try {
        let conflicts = await TimeWhereDB.getSetting('google_sync_conflicts');
        if (!Array.isArray(conflicts) || conflicts.length === 0) {
            if (!fallbackSync) {
                const expectedCount = Number(stateConflictCount) || 0;
                if (expectedCount > 0) {
                    renderGoogleSyncConflictEmpty('conflict_detail_missing');
                    updateGoogleSyncConflictButton(expectedCount);
                    return { count: expectedCount, conflicts: [], recovered: false, reason: 'conflict_detail_missing' };
                }
                return { count: 0, conflicts: [], recovered: false, reason: 'no_conflicts' };
            }
            const { api, driveClient } = createGoogleSyncRuntime();
            const result = await api.runAutoSync(TimeWhereDB, driveClient, { force: true });
            if (result?.status === 'conflict') {
                conflicts = result.conflicts || [];
            } else if (result?.status === 'not_configured') {
                await api.saveGoogleSyncState(TimeWhereDB, {
                    status: 'not_configured',
                    reason: result.reason || 'not_configured'
                });
                setGoogleSyncStatus('○ 未连接', 'not_configured');
                updateGoogleSyncConflictButton(0);
                hideGoogleSyncPreview();
                return { count: 0, conflicts: [], recovered: false, reason: result.reason || 'not_configured' };
            } else {
                const nextCount = Number(result?.conflict_count || 0);
                const statusText = result?.status ? `● ${result.status}` : '● 已连接';
                setGoogleSyncStatus(nextCount ? `● 有冲突待处理（${nextCount}）` : statusText, nextCount ? 'conflict' : 'connected');
                updateGoogleSyncConflictButton(nextCount);
                if (!nextCount) {
                    hideGoogleSyncPreview();
                    return { count: 0, conflicts: [], recovered: true, reason: result?.status || 'resolved_by_resync' };
                }
                renderGoogleSyncConflictEmpty('conflict_detail_missing');
                return { count: nextCount, conflicts: [], recovered: false, reason: 'conflict_detail_missing' };
            }
        }
        if (!Array.isArray(conflicts)) {
            return { count: 0, conflicts: [], recovered: false, reason: 'invalid_conflict_store' };
        }
        if (conflicts.length > 0) {
            renderGoogleSyncConflicts(conflicts);
        } else if (googleSyncPreviewState?.mode === 'v1_conflicts') {
            hideGoogleSyncPreview();
        }
        const count = conflicts.length;
        const finalCount = count || Number(stateConflictCount) || 0;
        updateGoogleSyncConflictButton(finalCount);
        if (!finalCount) {
            hideGoogleSyncPreview();
            return { count: 0, conflicts: [], recovered: false, reason: 'no_conflicts' };
        }
        if (!count) {
            renderGoogleSyncConflictEmpty('conflict_detail_missing');
            return { count: finalCount, conflicts: [], recovered: false, reason: 'conflict_detail_missing' };
        }
        return { count, conflicts, recovered: false, reason: 'stored_conflicts' };
    } catch (error) {
        console.warn('读取/重建 Google 冲突失败：', error);
        const expectedCount = Number(stateConflictCount) || 0;
        if (expectedCount > 0) {
            renderGoogleSyncConflictEmpty('conflict_detail_missing', error);
            updateGoogleSyncConflictButton(expectedCount);
            return { count: expectedCount, conflicts: [], recovered: false, reason: 'conflict_detail_missing' };
        }
        return { count: 0, conflicts: [], recovered: false, reason: error?.code || error?.reason || 'conflict_rebuild_failed' };
    } finally {
        googleSyncConflictPanelInFlight = false;
    }
}

async function handleSwitchGoogleSyncAccount() {
    setGoogleSyncInProgress(true, '正在切换 Google 账户…');
    try {
        const result = await connectGoogleSyncAccount({ force_account_selection: true });
        if (result.status === 'profile_switched') {
            setGoogleSyncStatus('● 正在切换账户数据空间', 'syncing');
            showToast('已确认切换 Google 账户数据空间，TimeWhere 正在重新打开。', 'success');
            return;
        }
        if (result.status === 'account_mismatch_cancelled') {
            await TimeWhereGoogleSync.saveGoogleSyncState(TimeWhereDB, {
                status: 'failed',
                reason: 'account_mismatch',
                last_error: getGoogleSyncFailureMessage({ reason: 'account_mismatch' })
            });
            setGoogleSyncStatus('● 账户不匹配', 'failed');
            showToast(getGoogleSyncFailureMessage({ reason: 'account_mismatch' }), 'info');
            return;
        }
        if (result.status === 'not_configured') {
            setGoogleSyncStatus(getGoogleSyncNotConfiguredMessage(result.reason), 'not_configured');
            return;
        }
        await loadGoogleSyncStatus();
        showToast('Google 账户已更新', 'success');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
    }
}

async function showStoredGoogleSyncConflicts(options = {}) {
    const result = await syncAndShowGoogleSyncConflicts(0, options);
    if (!result.count && options?.showHintOnEmpty) {
        showToast('当前无可用冲突详情，请先执行一次手动同步。', 'info');
    }
    return result;
}

function summarizeGoogleSyncConflict(conflict) {
    const localRecord = getGoogleSyncConflictRecord(conflict, 'local');
    const cloudRecord = getGoogleSyncConflictRecord(conflict, 'cloud');
    const localSummary = summarizeGoogleSyncBusinessRecord(conflict.table, conflict.id, localRecord);
    const cloudSummary = summarizeGoogleSyncBusinessRecord(conflict.table, conflict.id, cloudRecord);
    const displaySummary = localRecord ? localSummary : cloudSummary;
    const label = `${displaySummary.typeLabel}：${displaySummary.title}`;
    const typeText = {
        local_update_vs_remote_update: '本地和云端都修改过',
        local_update_vs_remote_delete: '本地修改，但云端已删除',
        delete_vs_remote_update: '本地删除，但云端已修改'
    }[conflict.conflict_type] || '同步冲突';
    return { label, typeText, localSummary, cloudSummary, localRecord, cloudRecord };
}

const GOOGLE_SYNC_TABLE_LABELS = {
    tasks: '任务',
    events: '日程',
    containers: '时间容器',
    habits: '习惯',
    plans: 'Plan',
    buckets: 'Bucket',
    labels: '标签',
    daily_journals: '每日总结',
    settings: '设置'
};

const GOOGLE_SYNC_SETTING_LABELS = {
    matrixview_subject_mappings: 'MatrixView 学科映射',
    managebac_subject_mappings: 'ManageBac 学科映射',
    managebac_ics_config: 'ManageBac 订阅链接',
    appearance_background: '外观背景',
    appearance_avatar: '头像',
    theme: '主题',
    start_week_on: '每周开始日',
    default_duration: '默认时长',
    default_priority: '默认优先级'
};

const GOOGLE_SYNC_PROGRESS_LABELS = {
    not_started: '未开始',
    in_progress: '进行中',
    completed: '已完成',
    pending: '待处理'
};

function getGoogleSyncConflictRecord(conflict, side) {
    if (side === 'local') return conflict.local?.record || null;
    return conflict.cloud?.record || null;
}

function summarizeGoogleSyncBusinessRecord(table, id, record) {
    const typeLabel = GOOGLE_SYNC_TABLE_LABELS[table] || table || '记录';
    if (!record) {
        return {
            typeLabel,
            title: `${typeLabel} ${id || ''}`.trim(),
            fields: [{ key: 'deleted', label: '状态', value: '已删除' }]
        };
    }
    if (table === 'tasks') {
        return {
            typeLabel,
            title: record.title || `任务 ${id || ''}`.trim(),
            fields: [
                { key: 'title', label: '标题', value: record.title || '无标题任务' },
                { key: 'plan_id', label: 'Plan', value: record.plan_id ? `Plan #${record.plan_id}` : '未指定' },
                { key: 'start_date', label: '开始日期', value: record.start_date || '无' },
                { key: 'due_date', label: '截止日期', value: record.due_date || record.deadline || '无' },
                { key: 'progress', label: '状态', value: GOOGLE_SYNC_PROGRESS_LABELS[record.progress || record.status] || record.progress || record.status || '未开始' },
                { key: 'priority', label: '优先级', value: record.priority || '默认' },
                { key: 'notes', label: '说明', value: summarizeGoogleSyncLongText(record.notes) }
            ]
        };
    }
    if (table === 'events') {
        return {
            typeLabel,
            title: record.title || `日程 ${id || ''}`.trim(),
            fields: [
                { key: 'title', label: '标题', value: record.title || '无标题日程' },
                { key: 'date', label: '日期', value: record.date || '无' },
                { key: 'time', label: '时间', value: `${record.time_start || '全天'}${record.time_end ? ` - ${record.time_end}` : ''}` },
                { key: 'repeat', label: '重复', value: record.repeat || 'none' },
                { key: 'source', label: '来源', value: record.source || 'manual' }
            ]
        };
    }
    if (table === 'containers') {
        return {
            typeLabel,
            title: record.name || `时间容器 ${id || ''}`.trim(),
            fields: [
                { key: 'name', label: '名称', value: record.name || '未命名容器' },
                { key: 'time', label: '时间', value: `${record.time_start || '无'} - ${record.time_end || '无'}` },
                { key: 'repeat', label: '重复', value: record.repeat || 'none' },
                { key: 'enabled', label: '启用', value: record.enabled === false ? '否' : '是' }
            ]
        };
    }
    if (table === 'habits') {
        return {
            typeLabel,
            title: record.name || record.title || `习惯 ${id || ''}`.trim(),
            fields: [
                { key: 'name', label: '名称', value: record.name || record.title || '未命名习惯' },
                { key: 'frequency', label: '频率', value: record.frequency || 'daily' },
                { key: 'status_today', label: '今日状态', value: record.status_today || record.status || '未完成' }
            ]
        };
    }
    if (table === 'plans' || table === 'buckets' || table === 'labels') {
        return {
            typeLabel,
            title: record.name || `${typeLabel} ${id || ''}`.trim(),
            fields: [
                { key: 'name', label: '名称', value: record.name || '未命名' },
                { key: 'plan_id', label: '归属 Plan', value: record.plan_id ? `Plan #${record.plan_id}` : '无' },
                { key: 'color', label: '颜色', value: record.color || '默认' },
                { key: 'sort_order', label: '排序', value: record.sort_order ?? '无' }
            ]
        };
    }
    if (table === 'daily_journals') {
        return {
            typeLabel,
            title: record.date || String(id || '每日总结'),
            fields: [
                { key: 'date', label: '日期', value: record.date || id || '无' },
                { key: 'status', label: '状态', value: record.status || 'snapshot' },
                { key: 'updated_at', label: '更新时间', value: record.updated_at || '无' }
            ]
        };
    }
    if (table === 'settings') {
        const key = record.key || id;
        return {
            typeLabel,
            title: GOOGLE_SYNC_SETTING_LABELS[key] || key || '设置',
            fields: [
                { key: 'key', label: '设置项', value: GOOGLE_SYNC_SETTING_LABELS[key] || key || '未知设置' },
                { key: 'value', label: '值', value: summarizeGoogleSyncSettingValue(key, record.value) }
            ]
        };
    }
    return {
        typeLabel,
        title: record.title || record.name || `${typeLabel} ${id || ''}`.trim(),
        fields: Object.entries(record).slice(0, 6).map(([key, value]) => ({ key, label: key, value: summarizeGoogleSyncValue(value) }))
    };
}

function summarizeGoogleSyncLongText(value) {
    if (!value) return '无';
    const text = String(value).trim();
    if (!text) return '无';
    return text.length > 48 ? `${text.slice(0, 48)}...` : text;
}

function summarizeGoogleSyncSettingValue(key, value) {
    if (key === 'managebac_ics_config') {
        return value?.link ? '已保存 ManageBac 链接' : '未配置';
    }
    if (Array.isArray(value)) return `${value.length} 项`;
    if (value && typeof value === 'object') return `${Object.keys(value).length} 项`;
    return summarizeGoogleSyncValue(value);
}

function summarizeGoogleSyncValue(value) {
    if (value == null || value === '') return '无';
    if (typeof value === 'boolean') return value ? '是' : '否';
    if (Array.isArray(value)) return `${value.length} 项`;
    if (typeof value === 'object') return `${Object.keys(value).length} 项`;
    return summarizeGoogleSyncLongText(value);
}

function renderGoogleSyncConflictSide(sideLabel, summary, otherSummary) {
    const deleted = summary.fields.length === 1 && summary.fields[0].key === 'deleted';
    const fields = summary.fields.map(field => {
        const other = otherSummary?.fields?.find(item => item.key === field.key);
        const changed = deleted || !other || String(other.value) !== String(field.value);
        return `
            <div class="google-sync-conflict-field${changed ? ' changed' : ''}">
                <span>${escapeGoogleSyncText(field.label)}</span>
                <strong>${escapeGoogleSyncText(field.value)}</strong>
            </div>
        `;
    }).join('');
    return `
        <div class="google-sync-conflict-side${deleted ? ' deleted' : ''}">
            <div class="google-sync-conflict-side-title">${escapeGoogleSyncText(sideLabel)}</div>
            <div class="google-sync-conflict-business-title">${escapeGoogleSyncText(summary.title)}</div>
            <div class="google-sync-conflict-fields">${fields}</div>
        </div>
    `;
}

function renderGoogleSyncConflictEmpty(reason = 'conflict_detail_missing', error = null) {
    const container = document.getElementById('googleSyncPreview');
    if (!container) return;
    googleSyncPreviewState = { mode: 'v1_conflict_empty', reason };
    const detail = error?.message
        ? `<p class="setting-desc">诊断信息：${escapeGoogleSyncText(error.message)}</p>`
        : '';
    container.hidden = false;
    container.innerHTML = `
        <div class="google-sync-conflict-empty">
            <h3>Google 数据同步冲突</h3>
            <p class="setting-desc">同步状态显示有冲突待处理，但本地冲突详情暂不可用。TimeWhere 没有覆盖本地或云端数据。</p>
            <p class="setting-desc">请重新执行手动同步，系统会尝试重建冲突列表；如果仍失败，请先保留本地数据并避免使用高级覆盖操作。</p>
            ${detail}
            <div class="google-sync-preview-actions">
                <button class="action-btn" id="retryGoogleSyncConflictBtn" type="button">重新同步并重建冲突</button>
            </div>
        </div>
    `;
    document.getElementById('retryGoogleSyncConflictBtn')?.addEventListener('click', () => {
        showStoredGoogleSyncConflicts({ fallbackSync: true, showHintOnEmpty: true });
    });
}

function renderGoogleSyncConflicts(conflicts) {
    const container = document.getElementById('googleSyncPreview');
    if (!container) return;
    googleSyncPreviewState = { mode: 'v1_conflicts', conflicts };
    if (!conflicts.length) {
        hideGoogleSyncPreview();
        return;
    }
    const rows = conflicts.map(conflict => {
        const summary = summarizeGoogleSyncConflict(conflict);
        const choiceKey = conflict.conflict_id || conflict.key;
        return `
            <div class="google-sync-preview-row google-sync-conflict-row" data-sync-change-key="${escapeGoogleSyncText(choiceKey)}">
                <div class="google-sync-preview-meta">
                    <span class="google-sync-preview-title">${escapeGoogleSyncText(summary.label)}</span>
                    <span class="google-sync-preview-desc">${escapeGoogleSyncText(summary.typeText)}</span>
                    <div class="google-sync-conflict-compare">
                        ${renderGoogleSyncConflictSide('本设备版本', summary.localSummary, summary.cloudSummary)}
                        ${renderGoogleSyncConflictSide('云端版本', summary.cloudSummary, summary.localSummary)}
                    </div>
                </div>
                <select class="google-sync-choice" data-change-key="${escapeGoogleSyncText(choiceKey)}">
                    <option value="skip" selected>跳过</option>
                    <option value="local">使用本地</option>
                    <option value="cloud">使用云端</option>
                </select>
            </div>
        `;
    }).join('');
    container.hidden = false;
    container.innerHTML = `
        <h3>Google 数据同步冲突</h3>
        <p class="setting-desc">发现 ${conflicts.length} 项冲突；本地功能可继续使用，确认前不会静默覆盖数据。</p>
        <div class="google-sync-preview-list">${rows}</div>
        <div class="google-sync-preview-actions">
            <button class="action-btn" id="skipGoogleSyncPreviewBtn" type="button">全部跳过</button>
            <button class="action-btn" id="applyGoogleSyncPreviewBtn" type="button">确认同步选中项</button>
        </div>
    `;
    document.getElementById('skipGoogleSyncPreviewBtn')?.addEventListener('click', hideGoogleSyncPreview);
    document.getElementById('applyGoogleSyncPreviewBtn')?.addEventListener('click', handleApplyGoogleSyncPreview);
}

function hideGoogleSyncPreview() {
    googleSyncPreviewState = null;
    const container = document.getElementById('googleSyncPreview');
    if (!container) return;
    container.hidden = true;
    container.innerHTML = '';
}

async function handleApplyGoogleSyncPreview() {
    if (!googleSyncPreviewState?.preview && googleSyncPreviewState?.mode !== 'v1_conflicts') {
        showToast('没有可应用的同步预览', 'error');
        return;
    }
    setGoogleSyncInProgress(true, '正在应用已确认的云端变更…');
    try {
        const { api, driveClient } = createGoogleSyncRuntime();
        const choices = {};
        document.querySelectorAll('#googleSyncPreview .google-sync-choice').forEach(select => {
            choices[select.dataset.changeKey] = select.value;
        });
        if (googleSyncPreviewState.mode === 'v1_conflicts') {
            const result = await api.resolveSyncConflicts(TimeWhereDB, driveClient, googleSyncPreviewState.conflicts, choices);
            if (result.status === 'conflict_remaining') {
                renderGoogleSyncConflicts((await TimeWhereDB.getSetting('google_sync_conflicts')) || []);
                setGoogleSyncStatus(`● 有冲突待处理（${result.remaining_count}）`, 'conflict');
                updateGoogleSyncConflictButton(result.remaining_count);
                showToast(`已处理 ${result.applied_count} 项，仍有 ${result.remaining_count} 项冲突。`, 'info');
                return;
            }
            if (result.sync_result?.status === 'conflict') {
                const conflicts = result.sync_result.conflicts || await TimeWhereDB.getSetting('google_sync_conflicts') || [];
                renderGoogleSyncConflicts(conflicts);
                setGoogleSyncStatus(`● 有冲突待处理（${conflicts.length}）`, 'conflict');
                updateGoogleSyncConflictButton(conflicts.length);
                showToast(`已处理 ${result.applied_count} 项，并发现新的同步冲突。`, 'info');
                return;
            }
            hideGoogleSyncPreview();
            setGoogleSyncStatus('● 已连接', 'connected');
            updateGoogleSyncConflictButton(0);
            if (isDesktopElectronPlatform() && typeof globalThis.TimeWherePlatform?.sync?.resume === 'function') {
                await globalThis.TimeWherePlatform.sync.resume({ reason: 'conflicts_resolved' });
            }
            showToast(`已处理 ${result.applied_count} 项冲突并完成同步。`, 'success');
            return;
        }
        const result = await api.applyCloudChoicesToLocal(TimeWhereDB, googleSyncPreviewState.preview, choices);
        const localAfterApply = await api.buildSnapshot(TimeWhereDB);
        const uploadSnapshot = api.buildUploadSnapshotFromChoices(
            localAfterApply,
            googleSyncPreviewState.cloudSnapshot,
            googleSyncPreviewState.preview,
            choices
        );
        const uploadManifest = api.createManifest(uploadSnapshot);
        const uploadResult = await driveClient.uploadJsonFile(api.SNAPSHOT_FILE_NAME, uploadSnapshot);
        if (uploadResult?.status === 'not_configured') {
            setGoogleSyncStatus('○ 未连接', 'not_configured');
            showToast(`已应用 ${result.applied_count} 项云端变更；Google OAuth 未配置，未上传合并快照。`, 'info');
            return;
        }
        await driveClient.uploadJsonFile(api.MANIFEST_FILE_NAME, uploadManifest);
        await api.saveGoogleSyncState(TimeWhereDB, {
            status: 'connected',
            last_apply_at: new Date().toISOString(),
            last_apply_count: result.applied_count,
            last_snapshot_exported_at: uploadSnapshot.exported_at
        });
        hideGoogleSyncPreview();
        setGoogleSyncStatus('● 已连接', 'connected');
        updateGoogleSyncConflictButton(0);
        showToast(`已应用 ${result.applied_count} 项云端变更，并已上传确认后的同步快照。`, 'success');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
    }
}

function setupImportEvents() {
    updateTimetableStatus();

    document.getElementById('importCalendarBtn')?.addEventListener('click', () => {
        const importArea = document.getElementById('importArea');
        importArea.style.display = importArea.style.display === 'none' ? 'block' : 'none';
    });
    
    document.getElementById('manageContainersBtn')?.addEventListener('click', () => {
        const containerArea = document.getElementById('containerManageArea');
        const isHidden = containerArea.style.display === 'none';
        containerArea.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            loadContainers();
        }
    });
    
    document.getElementById('selectFileBtn')?.addEventListener('click', () => {
        document.getElementById('icsFileInput')?.click();
    });
    
    document.getElementById('icsFileInput')?.addEventListener('change', handleFileSelect);
    document.getElementById('importBtn')?.addEventListener('click', handleImport);
    document.getElementById('addContainerBtn')?.addEventListener('click', () => {
        setDefaultContainerActiveDates();
        document.getElementById('addContainerModal').style.display = 'flex';
    });

    // Container modal — close
    document.getElementById('closeContainerModal')?.addEventListener('click', closeContainerModal);
    document.getElementById('cancelContainerBtn')?.addEventListener('click', closeContainerModal);

    // Container modal — color picker
    document.getElementById('newContainerColorPicker')?.addEventListener('click', e => {
        const btn = e.target.closest('.color-option');
        if (!btn) return;
        document.querySelectorAll('#newContainerColorPicker .color-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });

    // Container modal — layer toggle
    document.getElementById('newContainerLayerToggle')?.addEventListener('click', e => {
        const btn = e.target.closest('.layer-btn');
        if (!btn) return;
        document.querySelectorAll('#newContainerLayerToggle .layer-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });

    document.getElementById('newContainerActiveStartDate')?.addEventListener('change', e => {
        const startDate = e.target.value;
        const endInput = document.getElementById('newContainerActiveEndDate');
        if (startDate && endInput && (!endInput.value || endInput.value < startDate)) {
            endInput.value = addMonthsClampedISO(startDate, 1);
        }
    });
    // Container modal — confirm add
    document.getElementById('confirmAddContainer')?.addEventListener('click', async () => {
        const name = document.getElementById('newContainerName')?.value.trim();
        if (!name) { showToast('请输入容器名称', 'error'); return; }
        const start = document.getElementById('newContainerStart')?.value;
        const end = document.getElementById('newContainerEnd')?.value;
        if (!start || !end || start >= end) { showToast('请设置有效的时间范围', 'error'); return; }
        const repeat = document.getElementById('newContainerRepeat')?.value || 'weekday';
        const color = document.querySelector('#newContainerColorPicker .color-option.active')?.dataset.color || '#4A90D9';
        const layer = parseInt(document.querySelector('#newContainerLayerToggle .layer-btn.active')?.dataset.layer || '1');
        const active_start_date = document.getElementById('newContainerActiveStartDate')?.value || null;
        const active_end_date = document.getElementById('newContainerActiveEndDate')?.value || null;
        if (active_start_date && active_end_date && active_end_date < active_start_date) {
            showToast('生效结束日期不能早于生效开始日期', 'error');
            return;
        }

        await TimeWhereDB.addContainer({ name, color, time_start: start, time_end: end, repeat, layer, active_start_date, active_end_date });
        showToast('时间容器已添加', 'success');
        closeContainerModal();
        loadContainers();
    });
}

function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function addMonthsClampedISO(dateStr, months = 1) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return '';
    const target = new Date(year, month - 1 + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return formatDateISO(target);
}

function setDefaultContainerActiveDates(startDate = formatDateISO(new Date())) {
    const startInput = document.getElementById('newContainerActiveStartDate');
    const endInput = document.getElementById('newContainerActiveEndDate');
    if (startInput) startInput.value = startDate;
    if (endInput) endInput.value = addMonthsClampedISO(startDate, 1);
}

function formatContainerActiveRange(container = {}) {
    const start = container.active_start_date || '';
    const end = container.active_end_date || '';
    if (!start && !end) return '长期';
    if (start && end) return `${start} 至 ${end}`;
    if (start) return `${start} 起长期`;
    return `截至 ${end}`;
}
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('selectedFileName').textContent = file.name;
        document.getElementById('importBtn').disabled = false;
        localStorage.setItem('icsFileType', 'file');
    }
}

async function handleImport() {
    const type = localStorage.getItem('icsFileType');
    
    if (type === 'file') {
        const fileInput = document.getElementById('icsFileInput');
        if (fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                await parseICSAndSave(e.target.result);
            };
            reader.readAsText(fileInput.files[0]);
        }
    } else {
        showToast('请先选择本地 ICS 文件', 'error');
    }
}

async function parseICSAndSave(content, source = 'timetable') {
    // 删除相同来源的旧事件，不影响其他来源和手动事件
    const oldCount = await TimeWhereDB.db.events.filter(e => e.source === source).count();
    await TimeWhereDB.db.events.filter(e => e.source === source).delete();

    const parsedEvents = TimeWhereICS.parseICSToEvents(content);

    if (parsedEvents.length === 0) {
        showToast('未找到有效事件', 'error');
        return;
    }

    let savedCount = 0;
    for (const event of parsedEvents) {
        if (event.startTime && event.endTime && event.startDate) {
            await TimeWhereDB.addEvent({
                title: event.summary || '未命名课程',
                subject_in_matrixview: event.summary || null,
                date: event.startDate,
                color: '#4A90D9',
                time_start: event.startTime,
                time_end: event.endTime,
                source
            });
            savedCount++;
        }
    }

    showToast(`课表已更新：导入 ${savedCount} 节课（替换了 ${oldCount} 条旧记录）`, 'success');
    await updateTimetableStatus();
}

async function updateTimetableStatus() {
    const statusEl = document.getElementById('timetableStatus');
    if (!statusEl) return;
    const count = await TimeWhereDB.db.events.filter(e => e.source === 'timetable').count();
    statusEl.textContent = count > 0 ? `已导入 ${count} 节课` : '尚未导入课表';
}

async function loadContainers() {
    const containers = await TimeWhereDB.getContainers();
    const containerList = document.getElementById('settingsContainerList');
    const emptyState = document.getElementById('containerEmptyState');
    
    if (!containerList) return;
    
    containerList.innerHTML = '';
    
    if (containers.length === 0) {
        emptyState.classList.add('show');
        return;
    }
    
    emptyState.classList.remove('show');
    
    const { getContainerLayer, escapeHTML, escapeAttribute } = window.TimeWhereScheduling;
    for (const container of containers) {
        const layer = getContainerLayer(container);
        const layerBadge = layer === 1
            ? `<span class="layer-badge layer-study">学习</span>`
            : `<span class="layer-badge layer-free">自由</span>`;
        const div = document.createElement('div');
        div.className = 'container-item' + (container.enabled === false ? ' disabled' : '');
        div.innerHTML = `
            <div class="container-info">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="container-name">${escapeHTML(container.name)}</span>
                    ${layerBadge}
                </div>
                <span class="container-time">${escapeHTML(container.time_start)} - ${escapeHTML(container.time_end)} · ${escapeHTML(getRepeatText(container.repeat))} · ${escapeHTML(formatContainerActiveRange(container))}</span>
            </div>
            <div class="container-actions">
                <label class="toggle-switch">
                    <input type="checkbox" class="container-toggle" data-id="${escapeAttribute(container.id)}" ${container.enabled !== false ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <button class="delete" data-id="${escapeAttribute(container.id)}"><span class="material-symbols-outlined" style="font-size: 18px;">delete</span></button>
            </div>
        `;
        containerList.appendChild(div);
    }

    containerList.querySelectorAll('.container-toggle').forEach(toggle => {
        toggle.addEventListener('change', async () => {
            const id = toggle.dataset.id;
            await TimeWhereDB.updateContainer(id, { enabled: toggle.checked });
            loadContainers();
        });
    });

    containerList.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('确定要删除这个容器吗？')) {
                await TimeWhereDB.deleteContainer(btn.dataset.id);
                loadContainers();
            }
        });
    });
}

function getRepeatText(repeat) {
    const map = { daily: '每天', weekday: '工作日', weekend: '周末', once: '仅一次' };
    return map[repeat] || repeat;
}

async function saveSettings() {
    const settings = {
        theme: document.getElementById('theme').value,
        start_week_on: parseInt(document.getElementById('weekStartsOn').value),
        pomodoro_work: parseInt(document.getElementById('tomatoDuration').value),
        default_duration: parseInt(document.getElementById('defaultDuration').value) || 45,
        default_priority: document.getElementById('defaultPriority').value || 'medium',
        notification_enabled: document.getElementById('notificationEnabled').checked,
        appearance_background: document.getElementById('appearanceBackground').value || 'calm',
        appearance_avatar: document.getElementById('appearanceAvatar').value || 'default'
    };

    for (const [key, value] of Object.entries(settings)) {
        await TimeWhereDB.setSetting(key, value);
    }

    if (typeof TimeWhereAppearance !== 'undefined') {
        await TimeWhereAppearance.save({
            background: settings.appearance_background,
            avatar: settings.appearance_avatar
        });
    }

    if (settings.notification_enabled) {
        await ensureTaskReminderAlarm();
    }

    showToast('设置已保存', 'success');
}

async function handleTestNotification() {
    try {
        const enabled = document.getElementById('notificationEnabled')?.checked !== false;
        await TimeWhereDB.setSetting('notification_enabled', enabled);
        if (!enabled) {
            showToast('系统任务提醒已关闭，未发送测试提醒', 'info');
            return;
        }
        if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
            const response = await chrome.runtime.sendMessage({ type: 'TIMEWHERE_TASK_REMINDER_TEST' });
            if (!response?.ok) {
                throw new Error(response?.error || '测试提醒发送失败');
            }
            const alarmText = formatReminderAlarmStatus(response.alarm);
            const diagnosticText = formatDiagnosticAlarmStatus(response.diagnosticAlarm);
            showToast(`已发送测试提醒；${alarmText}；${diagnosticText}`, 'success');
            scheduleDiagnosticAlarmFollowUp();
            return;
        }
        if (isDesktopElectronPlatform() && globalThis.TimeWherePlatform?.notification?.notify) {
            await globalThis.TimeWherePlatform.notification.notify({
                id: `timewhere-desktop-test:${Date.now()}`,
                title: 'TimeWhere 测试提醒',
                message: 'Windows 桌面通知已可用；应用运行期间会按任务规则提醒。'
            });
            await globalThis.TimeWhereDesktopReminders?.rescheduleNow?.();
            showToast('已发送 Windows 桌面测试提醒；应用运行期间任务提醒可用。', 'success');
            return;
        }
        showToast('当前环境不支持系统通知测试', 'error');
    } catch (error) {
        showToast(`测试提醒失败：${error.message}`, 'error');
    }
}

async function ensureTaskReminderAlarm() {
    const enabled = document.getElementById('notificationEnabled')?.checked !== false;
    if (!enabled) return null;
    if (isDesktopElectronPlatform()) {
        return await globalThis.TimeWhereDesktopReminders?.rescheduleNow?.() || { status: 'desktop_ready' };
    }
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return null;
    const response = await chrome.runtime.sendMessage({ type: 'TIMEWHERE_TASK_REMINDER_ENSURE' });
    if (!response?.ok) {
        throw new Error(response?.error || '任务提醒 alarm 注册失败');
    }
    return response.alarm || null;
}

function formatReminderAlarmStatus(alarm) {
    if (!alarm?.scheduledTime) return 'alarm 状态未返回';
    const next = new Date(alarm.scheduledTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
    return `alarm 已注册，下次检查 ${next}`;
}

function formatDiagnosticAlarmStatus(alarm) {
    if (!alarm?.scheduledTime) return '诊断 alarm 状态未返回';
    const next = new Date(alarm.scheduledTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    return `30 秒诊断 ${next}`;
}

function scheduleDiagnosticAlarmFollowUp() {
    window.setTimeout(async () => {
        try {
            if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;
            const response = await chrome.runtime.sendMessage({ type: 'TIMEWHERE_TASK_REMINDER_STATUS' });
            if (!response?.ok) {
                throw new Error(response?.error || '无法读取 alarm 状态');
            }
            const diagnostic = response.diagnostic;
            if (diagnostic?.status === 'fired') {
                const firedAt = new Date(diagnostic.firedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                showToast(`诊断 alarm 已触发：${firedAt}`, 'success');
                return;
            }
            const alarmNames = (response.alarms || []).map(alarm => alarm.name).join(', ') || '无';
            showToast(`诊断 alarm 未触发；当前 alarm：${alarmNames}`, 'error');
        } catch (error) {
            showToast(`诊断 alarm 状态读取失败：${error.message}`, 'error');
        }
    }, 40000);
}

async function exportData() {
    try {
        const data = await TimeWhereDB.exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        a.download = `timewhere_backup_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('数据已导出', 'success');
    } catch (e) {
        showToast('导出失败：' + e.message, 'error');
    }
}

async function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!confirm('导入将覆盖当前所有数据，确定继续吗？')) return;
        await TimeWhereDB.importAllData(data);
        showToast('数据导入成功', 'success');
        await loadSettings();
        await loadContainers();
    } catch (err) {
        showToast('导入失败：' + err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

async function resetSettings() {
    if (!confirm('确定要恢复所有设置为默认值吗？')) return;
    try {
        await TimeWhereDB.db.settings.clear();
        await TimeWhereDB.initDefaultSettings();
        await loadSettings();
        if (isDesktopElectronPlatform() && typeof globalThis.TimeWherePlatform?.system?.setDesktopSettings === 'function') {
            const result = await globalThis.TimeWherePlatform.system.setDesktopSettings(desktopSystemSettingsDefaults);
            if (result?.status === 'ok') {
                applyDesktopSystemSettingsToInputs(result.settings || desktopSystemSettingsDefaults);
            }
        }
        showToast('设置已重置', 'success');
    } catch (e) {
        showToast('重置失败：' + e.message, 'error');
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function closeContainerModal() {
    document.getElementById('addContainerModal').style.display = 'none';
    document.getElementById('newContainerName').value = '';
    document.getElementById('newContainerStart').value = '18:30';
    document.getElementById('newContainerEnd').value = '21:30';
    setDefaultContainerActiveDates();
    document.getElementById('newContainerRepeat').value = 'weekday';
    // Reset color picker
    document.querySelectorAll('#newContainerColorPicker .color-option').forEach((b, i) => {
        b.classList.toggle('active', i === 0);
    });
    // Reset layer toggle
    document.querySelectorAll('#newContainerLayerToggle .layer-btn').forEach((b, i) => {
        b.classList.toggle('active', i === 0);
    });
}

