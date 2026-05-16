/**
 * TimeWhere Settings Page Script
 * 版本: v2.0
 * 日期: 2026-04-02
 */

const MANAGEMENT_REVIEW_PENDING_KEY = 'management_review_pending';
let settingsManageBacSyncInProgress = false;
let googleSyncInProgress = false;
let googleSyncPreviewState = null;
let pendingGoogleSyncDangerAction = null;

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    try {
        await initDatabase();
        await loadSettings();
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
    document.getElementById('configureManageBacBtn')?.addEventListener('click', () => {
        window.location.href = 'managebac.html';
    });
    document.getElementById('settingsSaveManageBacIcsLinkBtn')?.addEventListener('click', handleSettingsSaveManageBacIcsLink);
    document.getElementById('settingsSyncManageBacBtn')?.addEventListener('click', handleSettingsManageBacSync);
    document.getElementById('connectGoogleSyncBtn')?.addEventListener('click', handleConnectGoogleSync);
    document.getElementById('syncGoogleNowBtn')?.addEventListener('click', handleGoogleSyncNow);
    document.getElementById('restoreGoogleSyncBtn')?.addEventListener('click', handleRestoreGoogleSync);
    document.getElementById('uploadGoogleSyncBtn')?.addEventListener('click', handleUploadGoogleSync);
    document.getElementById('disconnectGoogleSyncBtn')?.addEventListener('click', handleDisconnectGoogleSync);
    document.getElementById('processGoogleConflictsBtn')?.addEventListener('click', showStoredGoogleSyncConflicts);
    document.getElementById('testNotificationBtn')?.addEventListener('click', handleTestNotification);
    document.getElementById('closeGoogleSyncDangerModal')?.addEventListener('click', closeGoogleSyncDangerModal);
    document.getElementById('cancelGoogleSyncDangerBtn')?.addEventListener('click', closeGoogleSyncDangerModal);
    document.getElementById('confirmGoogleSyncDangerBtn')?.addEventListener('click', confirmGoogleSyncDangerAction);
    document.getElementById('googleSyncDangerConfirmInput')?.addEventListener('input', updateGoogleSyncDangerConfirmState);
    document.getElementById('appearanceBackground')?.addEventListener('change', previewAppearanceSettings);
    document.getElementById('appearanceAvatar')?.addEventListener('change', previewAppearanceSettings);
    setupImportEvents();
}

function previewAppearanceSettings() {
    if (typeof TimeWhereAppearance === 'undefined') return;
    TimeWhereAppearance.applyValues({
        background: document.getElementById('appearanceBackground')?.value || 'calm',
        avatar: document.getElementById('appearanceAvatar')?.value || 'default'
    });
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

    const mappings = await TimeWhereDB.getSetting(TimeWhereManageBac.SETTINGS_MAPPING_KEY);
    const activeMappingCount = (mappings || []).filter(row => row?.plan_id).length;
    if (!activeMappingCount) {
        setSettingsManageBacStatus('请先配置 ManageBac 学科映射，再同步新增事件。', 'error');
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
        await TimeWhereDB.setSetting(MANAGEMENT_REVIEW_PENDING_KEY, {
            source: 'managebac_manual',
            created_at: new Date().toISOString(),
            arrange_changes: [],
            arrange_summary: null,
            managebac_pending_event_mappings: pendingRows,
            managebac_summary: {
                status: result.status,
                events: result.events || 0,
                created: result.created || 0,
                updated: result.updated || 0,
                deleted: result.deleted || 0,
                skipped: result.skipped || 0
            },
            managebac_error: null
        });
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
    const authAdapter = api.createChromeIdentityAuthAdapter(typeof chrome !== 'undefined' ? chrome : null);
    const driveClient = api.createDriveAppDataClient({ authAdapter });
    return { api, authAdapter, driveClient };
}

function setGoogleSyncStatus(message, status = 'not_configured') {
    const el = document.getElementById('googleSyncStatus');
    if (!el) return;
    el.textContent = message;
    el.dataset.status = status;
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

async function updateGoogleSyncAccountDisplay(state = null) {
    const accountEl = document.getElementById('googleSyncAccountEmail');
    const connectBtn = document.getElementById('connectGoogleSyncBtn');
    const disconnectBtn = document.getElementById('disconnectGoogleSyncBtn');
    const connected = state?.status === 'connected' || state?.status === 'conflict' || state?.status === 'pending_retry' || state?.status === 'failed' || state?.status === 'syncing';
    const email = connected ? await getGoogleSyncAccountEmail() : null;
    if (accountEl) {
        accountEl.textContent = email || (connected ? 'Google 账户' : '');
    }
    if (connectBtn) {
        connectBtn.hidden = connected;
        connectBtn.textContent = '连接 Google 账户同步';
    }
    if (disconnectBtn) {
        disconnectBtn.hidden = !connected;
        disconnectBtn.textContent = '断开连接';
    }
}

function updateGoogleSyncLastSyncDisplay(state = null) {
    const el = document.getElementById('googleSyncLastSyncAt');
    if (!el) return;
    el.textContent = `最近同步：${formatGoogleSyncDateTime(state?.last_success_at || state?.last_restore_at || state?.last_force_upload_at)}`;
}

function updateGoogleSyncConflictButton(count = 0) {
    const btn = document.getElementById('processGoogleConflictsBtn');
    if (!btn) return;
    const hasConflicts = Number(count) > 0;
    btn.hidden = !hasConflicts;
    btn.textContent = hasConflicts ? `处理 ${count} 项冲突` : '处理冲突';
}

function updateGoogleSyncControls() {
    const disabled = googleSyncInProgress || typeof TimeWhereGoogleSync === 'undefined';
    [
        'connectGoogleSyncBtn',
        'syncGoogleNowBtn',
        'restoreGoogleSyncBtn',
        'uploadGoogleSyncBtn',
        'disconnectGoogleSyncBtn'
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
        return;
    }
    const state = await TimeWhereGoogleSync.getGoogleSyncState(TimeWhereDB);
    if (state?.status === 'connected') {
        setGoogleSyncStatus('● 已连接', 'connected');
        updateGoogleSyncConflictButton(0);
    } else if (state?.status === 'conflict') {
        setGoogleSyncStatus(`● 有冲突待处理${state.conflict_count ? `（${state.conflict_count}）` : ''}`, 'conflict');
        updateGoogleSyncConflictButton(state.conflict_count || 0);
        await showStoredGoogleSyncConflicts();
    } else if (state?.status === 'failed') {
        setGoogleSyncStatus('● 失败', 'failed');
        updateGoogleSyncConflictButton(0);
    } else if (state?.status === 'pending_retry') {
        setGoogleSyncStatus('● 离线待重试', 'failed');
        updateGoogleSyncConflictButton(0);
    } else if (state?.status === 'syncing') {
        setGoogleSyncStatus('● 同步中', 'syncing');
        updateGoogleSyncConflictButton(0);
    } else {
        setGoogleSyncStatus('○ 未连接', 'not_configured');
        updateGoogleSyncConflictButton(0);
    }
    await updateGoogleSyncAccountDisplay(state);
    updateGoogleSyncLastSyncDisplay(state);
    updateGoogleSyncControls();
}

async function handleConnectGoogleSync() {
    setGoogleSyncInProgress(true, '正在连接 Google 同步…');
    try {
        const { api, authAdapter } = createGoogleSyncRuntime();
        const result = await authAdapter.connect();
        if (result.status === 'not_configured') {
            await api.saveGoogleSyncState(TimeWhereDB, {
                status: 'not_configured',
                reason: result.reason || 'oauth_client_id_missing'
            });
            setGoogleSyncStatus('○ 未连接', 'not_configured');
            showToast('Google OAuth client ID 未配置；本地功能不受影响。', 'info');
            return;
        }
        const accountInfo = await authAdapter.getAccountInfo?.();
        if (accountInfo?.email) {
            await TimeWhereDB.setSetting('google_sync_account_email', accountInfo.email);
        }
        await api.saveGoogleSyncState(TimeWhereDB, {
            status: 'connected',
            connected_at: new Date().toISOString()
        });
        setGoogleSyncStatus('● 已连接', 'connected');
        await updateGoogleSyncAccountDisplay({ status: 'connected' });
        showToast('Google 数据同步已连接', 'success');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
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
            setGoogleSyncStatus('○ 未连接', 'not_configured');
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
        const result = await api.runAutoSync(TimeWhereDB, driveClient, { force: true });
        if (result?.status === 'not_configured') {
            await api.saveGoogleSyncState(TimeWhereDB, { status: 'not_configured', reason: result.reason });
            setGoogleSyncStatus('○ 未连接', 'not_configured');
            showToast('Google OAuth client ID 未配置；无法同步。', 'info');
            return;
        }
        if (result.status === 'conflict') {
            renderGoogleSyncConflicts(result.conflicts || []);
            setGoogleSyncStatus(`● 有冲突待处理（${result.conflicts.length}）`, 'conflict');
            updateGoogleSyncConflictButton(result.conflicts.length);
            showToast(`发现 ${result.conflicts.length} 项同步冲突，请选择处理方式。`, 'info');
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
            setGoogleSyncStatus('○ 未连接', 'not_configured');
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
    setGoogleSyncInProgress(true, '正在断开 Google 同步…');
    try {
        const { api, authAdapter } = createGoogleSyncRuntime();
        await authAdapter.disconnect();
        await api.saveGoogleSyncState(TimeWhereDB, {
            status: 'not_configured',
            disconnected_at: new Date().toISOString()
        });
        await TimeWhereDB.setSetting('google_sync_account_email', null);
        hideGoogleSyncPreview();
        setGoogleSyncStatus('○ 未连接', 'not_configured');
        await updateGoogleSyncAccountDisplay({ status: 'not_configured' });
        updateGoogleSyncLastSyncDisplay(null);
        updateGoogleSyncConflictButton(0);
        showToast('已断开 Google 数据同步。本地数据保留。', 'success');
    } catch (error) {
        await markGoogleSyncFailed(error);
    } finally {
        setGoogleSyncInProgress(false);
    }
}

async function markGoogleSyncFailed(error) {
    try {
        if (typeof TimeWhereGoogleSync !== 'undefined') {
            await TimeWhereGoogleSync.saveGoogleSyncState(TimeWhereDB, {
                status: 'failed',
                last_error: error.message
            });
        }
    } catch (_) {
        // Status write failure should not hide the original sync error.
    }
    setGoogleSyncStatus('● 失败', 'failed');
    showToast(`Google 数据同步失败：${error.message}`, 'error');
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

async function showStoredGoogleSyncConflicts() {
    try {
        const conflicts = await TimeWhereDB.getSetting('google_sync_conflicts');
        if (Array.isArray(conflicts) && conflicts.length > 0) {
            renderGoogleSyncConflicts(conflicts);
        }
    } catch (_) {
        // Conflict display is best-effort; sync status remains visible.
    }
}

function summarizeGoogleSyncConflict(conflict) {
    const label = `${conflict.table || 'record'} / ${conflict.id || ''}`;
    const typeText = {
        local_update_vs_remote_update: '本地和云端都修改过',
        local_update_vs_remote_delete: '本地修改，但云端已删除',
        delete_vs_remote_update: '本地删除，但云端已修改'
    }[conflict.conflict_type] || '同步冲突';
    return { label, typeText };
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
        return `
            <div class="google-sync-preview-row" data-sync-change-key="${escapeGoogleSyncText(conflict.key)}">
                <div class="google-sync-preview-meta">
                    <span class="google-sync-preview-title">${escapeGoogleSyncText(summary.label)}</span>
                    <span class="google-sync-preview-desc">${escapeGoogleSyncText(summary.typeText)}</span>
                </div>
                <select class="google-sync-choice" data-change-key="${escapeGoogleSyncText(conflict.key)}">
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
            hideGoogleSyncPreview();
            setGoogleSyncStatus('● 已连接', 'connected');
            updateGoogleSyncConflictButton(0);
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

        await TimeWhereDB.addContainer({ name, color, time_start: start, time_end: end, repeat, layer });
        showToast('时间容器已添加', 'success');
        closeContainerModal();
        loadContainers();
    });
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
                <span class="container-time">${escapeHTML(container.time_start)} - ${escapeHTML(container.time_end)} · ${escapeHTML(getRepeatText(container.repeat))}</span>
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
        if (!chrome?.runtime?.sendMessage) {
            showToast('当前环境不支持 Chrome 系统通知测试', 'error');
            return;
        }
        const response = await chrome.runtime.sendMessage({ type: 'TIMEWHERE_TASK_REMINDER_TEST' });
        if (!response?.ok) {
            throw new Error(response?.error || '测试提醒发送失败');
        }
        showToast('已发送测试提醒；如果没有弹窗，请检查 Chrome/Windows 通知权限', 'success');
    } catch (error) {
        showToast(`测试提醒失败：${error.message}`, 'error');
    }
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

