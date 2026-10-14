import { renderGoogleSsoButton, disableGoogleAutoSelect } from '../auth/googleSso.js';

function sessionAccount(apiClient) {
  const session = apiClient.getSession();
  return {
    connected: Boolean(session?.token),
    name: session?.account?.name || session?.account?.display_name || null,
    email: session?.account?.email || null,
    picture: session?.account?.picture || session?.account?.picture_url || null
  };
}

function captureClick(element, handler) {
  if (!element) return;
  element.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    handler(event).catch(error => console.error('[TimeWhere Cloud]', error));
  }, true);
}

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  if (busy) {
    button.dataset.previousText = button.textContent;
    button.textContent = label;
  } else if (button.dataset.previousText) {
    button.textContent = button.dataset.previousText;
    delete button.dataset.previousText;
  }
}

function updateStatus(message, status = 'connected') {
  const element = document.getElementById('googleSyncStatus');
  if (!element) return;
  element.textContent = message;
  element.dataset.status = status;
}

async function renderHistory(runtime) {
  const panel = document.getElementById('googleSyncHistoryPanel');
  const list = document.getElementById('googleSyncHistoryList');
  if (!panel || !list) return;
  panel.hidden = false;
  const history = await globalThis.TimeWhereGoogleSync.getGoogleSyncHistory();
  list.innerHTML = '';
  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'google-sync-history-item';
    empty.textContent = '暂无 Cloud 同步记录';
    list.appendChild(empty);
    return;
  }
  for (const entry of history) {
    const row = document.createElement('div');
    row.className = 'google-sync-history-item';
    const title = document.createElement('strong');
    title.textContent = entry.status === 'failed' ? '同步失败' : 'Cloud 同步';
    const detail = document.createElement('span');
    detail.textContent = `${entry.reason || 'manual_sync'} · ${entry.finished_at ? new Date(entry.finished_at).toLocaleString() : '时间未知'}${entry.duration_ms ? ` · ${entry.duration_ms}ms` : ''}`;
    row.append(title, detail);
    list.appendChild(row);
  }
}

async function refreshUi(runtime) {
  const { apiClient } = runtime;
  const account = sessionAccount(apiClient);
  const accountDisplay = document.getElementById('googleSyncAccountEmail');
  const connectButton = document.getElementById('connectGoogleSyncBtn');
  const switchButton = document.getElementById('switchGoogleSyncAccountBtn');
  const disconnectButton = document.getElementById('disconnectGoogleSyncBtn');
  const accountActions = document.querySelector('.google-sync-account-actions');

  document.querySelector('#googleSyncSection .section-title')?.replaceChildren(
    Object.assign(document.createElement('span'), { className: 'material-symbols-outlined', textContent: 'cloud_sync' }),
    document.createTextNode(' TimeWhere Cloud')
  );
  const description = document.querySelector('#googleSyncSection .google-sync-card .setting-desc');
  if (description) description.textContent = 'Google 仅用于登录；任务、日历和设置保存在 TimeWhere Cloud。';

  if (account.connected) {
    accountActions?.querySelector('[data-google-sso-mount]')?.remove();
    if (accountDisplay) {
      accountDisplay.hidden = false;
      accountDisplay.textContent = `已连接：${account.name || account.email || 'Google 账户'}`;
    }
    if (connectButton) connectButton.hidden = true;
    if (switchButton) switchButton.hidden = false;
    if (disconnectButton) disconnectButton.hidden = false;
    updateStatus('● Google 已连接', 'connected');
    const cursor = localStorage.getItem('timewhere.web.sync.cursor.v1') || '0';
    const auto = document.getElementById('googleSyncAutoStatus');
    const last = document.getElementById('googleSyncLastSyncAt');
    if (auto) auto.textContent = 'Cloud 数据：在线直接保存';
    if (last) last.textContent = `增量游标：${cursor}`;
  } else {
    if (accountDisplay) accountDisplay.hidden = true;
    if (connectButton) connectButton.hidden = true;
    if (switchButton) switchButton.hidden = true;
    if (disconnectButton) disconnectButton.hidden = true;
    updateStatus('○ Google 未连接', 'not_configured');
    if (accountActions && !accountActions.querySelector('[data-google-sso-mount]')) {
      const mount = document.createElement('div');
      mount.dataset.googleSsoMount = 'true';
      accountActions.prepend(mount);
      await renderGoogleSsoButton({
        buttonElement: mount,
        onCredential: async credential => {
          updateStatus('● 正在建立 TimeWhere Cloud session', 'syncing');
          try {
            await apiClient.loginWithGoogleIdToken(credential);
            await runtime.refreshBootstrap();
            location.reload();
          } catch (error) {
            updateStatus(`● 登录失败：${error.message}`, 'failed');
          }
        },
        onError: error => updateStatus(`● 登录失败：${error.message}`, 'failed')
      });
    }
  }

  for (const id of ['uploadGoogleSyncBtn', 'restoreGoogleSyncBtn', 'connectAndRestoreGoogleSyncBtn']) {
    const button = document.getElementById(id);
    if (!button) continue;
    button.disabled = true;
    button.title = 'TimeWhere Cloud 是权威数据源，不提供本地覆盖云端或云端覆盖本地。';
  }

  const dangerLabel = document.querySelector('.google-sync-danger-label');
  if (dangerLabel) dangerLabel.textContent = 'Cloud 权威数据保护';
}

export function installSettingsCloudUi(runtime, platform) {
  const initialize = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await refreshUi(runtime);

    const syncButton = document.getElementById('syncGoogleNowBtn');
    captureClick(syncButton, async () => {
      setBusy(syncButton, true, '同步中…');
      updateStatus('● 同步中', 'syncing');
      try {
        await platform.refreshCloud('manual_sync');
        updateStatus('● Google 已连接', 'connected');
        platform.showToast('TimeWhere Cloud 数据已刷新', 'success');
        await refreshUi(runtime);
      } catch (error) {
        updateStatus(`● 同步失败：${error.message}`, 'failed');
        platform.showToast(`同步失败：${error.message}`, 'error');
      } finally {
        setBusy(syncButton, false);
      }
    });

    const historyButton = document.getElementById('toggleGoogleSyncHistoryBtn');
    captureClick(historyButton, () => renderHistory(runtime));

    const clearButton = document.getElementById('clearGoogleSyncHistoryBtn');
    captureClick(clearButton, async () => {
      await globalThis.TimeWhereGoogleSync.clearGoogleSyncHistory();
      await renderHistory(runtime);
    });

    const disconnect = document.getElementById('disconnectGoogleSyncBtn');
    captureClick(disconnect, async () => {
      await runtime.apiClient.logout();
      disableGoogleAutoSelect();
      location.reload();
    });

    const switchAccount = document.getElementById('switchGoogleSyncAccountBtn');
    captureClick(switchAccount, async () => {
      await runtime.apiClient.logout();
      disableGoogleAutoSelect();
      location.reload();
    });

    const statusActions = document.querySelector('.google-sync-status-actions');
    if (statusActions && !document.getElementById('refreshTimeWhereSessionBtn')) {
      const refreshSession = document.createElement('button');
      refreshSession.className = 'action-btn';
      refreshSession.id = 'refreshTimeWhereSessionBtn';
      refreshSession.type = 'button';
      refreshSession.textContent = '刷新 session';
      statusActions.prepend(refreshSession);
      captureClick(refreshSession, async () => {
        setBusy(refreshSession, true, '刷新中…');
        try {
          await runtime.apiClient.refreshSession();
          await runtime.refreshBootstrap();
          updateStatus('● Session 已刷新', 'connected');
          platform.showToast('TimeWhere Cloud session 已轮换', 'success');
        } catch (error) {
          updateStatus(`● Session 刷新失败：${error.message}`, 'failed');
        } finally {
          setBusy(refreshSession, false);
        }
      });
    }

    try {
      if (runtime.hasSession()) {
        const conflicts = await runtime.apiClient.listSyncConflicts({ status: 'open', limit: 20 });
        const button = document.getElementById('processGoogleConflictsBtn');
        const count = conflicts?.conflicts?.length || 0;
        if (button) {
          button.hidden = count === 0;
          button.textContent = `处理冲突 (${count})`;
        }
      }
    } catch (error) {
      console.warn('[TimeWhere Cloud] conflict status unavailable:', error.message);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}
