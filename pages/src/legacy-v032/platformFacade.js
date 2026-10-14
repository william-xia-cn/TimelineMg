import { renderGoogleSsoButton, disableGoogleAutoSelect } from '../auth/googleSso.js';

const SYNC_HISTORY_KEY = 'timewhere.web.legacy.sync.history.v1';
const SYNC_STATE_KEY = 'timewhere.web.legacy.sync.state.v1';

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function productUrl(page) {
  const routes = {
    dashboard: '/legacy-v032/pages/focus/focus.html',
    focus: '/legacy-v032/pages/focus/focus.html',
    tasks: '/legacy-v032/pages/tasks/tasks.html',
    calendar: '/legacy-v032/pages/calendar/calendar.html',
    settings: '/legacy-v032/pages/settings/settings.html'
  };
  return routes[page] || routes.dashboard;
}

function routeFromLegacyPath(value = '') {
  const path = String(value).toLowerCase();
  if (path.includes('tasks')) return 'tasks';
  if (path.includes('calendar')) return 'calendar';
  if (path.includes('settings')) return 'settings';
  return 'dashboard';
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show', 'toast-show'));
  window.setTimeout(() => toast.remove(), 2400);
}

function accountInfo(apiClient) {
  const session = apiClient.getSession();
  return {
    status: session?.token ? 'connected' : 'not_authorized',
    connected: Boolean(session?.token),
    account_key: session?.account?.id || null,
    name: session?.account?.name || session?.account?.display_name || null,
    email: session?.account?.email || null,
    picture: session?.account?.picture || session?.account?.picture_url || null
  };
}

function createSsoPrompt(apiClient, onConnected) {
  return new Promise((resolve, reject) => {
    document.querySelector('.timewhere-sso-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay timewhere-sso-overlay active';
    overlay.innerHTML = `
      <div class="modal-content" role="dialog" aria-modal="true" aria-label="登录 TimeWhere Cloud">
        <div class="modal-header"><h3>登录 TimeWhere Cloud</h3><button type="button" class="icon-btn" data-action="close-sso" aria-label="关闭">×</button></div>
        <p class="setting-desc">Google 仅用于确认账户身份，不授予 Drive、Calendar 或 Tasks 权限。</p>
        <div data-google-sso-mount></div>
      </div>`;
    document.body.appendChild(overlay);
    const close = result => {
      overlay.remove();
      resolve(result);
    };
    overlay.querySelector('[data-action="close-sso"]')?.addEventListener('click', () => close({ status: 'cancelled' }));
    renderGoogleSsoButton({
      buttonElement: overlay.querySelector('[data-google-sso-mount]'),
      onCredential: async credential => {
        try {
          await apiClient.loginWithGoogleIdToken(credential);
          await onConnected();
          close({ status: 'connected' });
        } catch (error) {
          overlay.remove();
          reject(error);
        }
      },
      onError: reject
    }).catch(reject);
  });
}

export function installLegacyWebPlatform({ apiClient, refreshBootstrap }) {
  async function refreshCloud(reason = 'manual_sync') {
    const startedAt = Date.now();
    window.dispatchEvent(new CustomEvent('timewhere-cloud-state', { detail: { status: 'syncing', reason } }));
    try {
      const refreshed = await refreshBootstrap();
      const result = {
        status: refreshed ? 'up_to_date' : (apiClient.getSession()?.token ? 'offline' : 'not_configured'),
        reason,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt
      };
      writeJson(SYNC_STATE_KEY, { status: refreshed ? 'connected' : result.status, last_sync_at: result.finished_at });
      const history = readJson(SYNC_HISTORY_KEY, []);
      writeJson(SYNC_HISTORY_KEY, [result, ...history].slice(0, 50));
      window.dispatchEvent(new CustomEvent('timewhere-google-sync-state', { detail: result }));
      return result;
    } catch (error) {
      const result = { status: 'failed', reason: error.code || 'cloud_refresh_failed', message: error.message, finished_at: new Date().toISOString() };
      writeJson(SYNC_STATE_KEY, result);
      window.dispatchEvent(new CustomEvent('timewhere-google-sync-state', { detail: result }));
      throw error;
    }
  }

  const auth = {
    async connect() {
      return createSsoPrompt(apiClient, () => refreshCloud('login_success'));
    },
    async disconnect() {
      await apiClient.logout();
      disableGoogleAutoSelect();
      writeJson(SYNC_STATE_KEY, { status: 'not_configured', disconnected_at: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('timewhere-google-sync-state', { detail: { status: 'not_configured' } }));
      return { status: 'ok' };
    },
    async revoke() {
      return { status: 'not_supported' };
    },
    async getStatus() {
      return { status: apiClient.getSession()?.token ? 'connected' : 'not_authorized' };
    },
    async getAccountInfo() {
      return accountInfo(apiClient);
    },
    async getGoogleToken() {
      return apiClient.getSession()?.token || null;
    }
  };

  globalThis.TimeWherePlatform = {
    name: 'web-cloud',
    auth,
    sync: {
      async getStatus() { return readJson(SYNC_STATE_KEY, { status: apiClient.getSession()?.token ? 'connected' : 'not_configured' }); },
      async requestRun(options = {}) { return refreshCloud(options.reason || 'manual_sync'); },
      async resume() { return refreshCloud('resume'); }
    },
    notification: {
      async notify(payload = {}) {
        if (!('Notification' in window)) return { status: 'not_supported' };
        if (Notification.permission === 'default') await Notification.requestPermission();
        if (Notification.permission !== 'granted') return { status: 'not_authorized' };
        new Notification(payload.title || 'TimeWhere', { body: payload.message || payload.body || '' });
        return { status: 'ok' };
      }
    },
    external: {
      async openUrl(url) {
        if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http/https 链接');
        window.open(url, '_blank', 'noopener,noreferrer');
        return { status: 'ok' };
      }
    },
    system: {
      async getDesktopSettings() { return { status: 'not_supported' }; },
      async setDesktopSettings() { return { status: 'not_supported' }; },
      async confirmGoogleAccountSwitch() { return { status: 'not_supported' }; }
    },
    chromeBridge: {
      async getStatus() { return { status: 'not_supported' }; },
      async connectExtension() { return { status: 'not_supported' }; }
    }
  };

  globalThis.TimeWhereGoogleSync = {
    createTimeWherePlatformAuthAdapter() { return auth; },
    createChromeIdentityAuthAdapter() { return auth; },
    createDriveAppDataClient() { return {}; },
    async runPageAutoSync() { return refreshCloud('page_open'); },
    async runAutoSync() { return refreshCloud('manual_sync'); },
    async getGoogleSyncState() { return readJson(SYNC_STATE_KEY, { status: apiClient.getSession()?.token ? 'connected' : 'not_configured' }); },
    async saveGoogleSyncState(_db, state) { return writeJson(SYNC_STATE_KEY, state); },
    async getGoogleSyncHistory() { return readJson(SYNC_HISTORY_KEY, []); },
    async appendGoogleSyncHistory(entry) {
      const history = readJson(SYNC_HISTORY_KEY, []);
      writeJson(SYNC_HISTORY_KEY, [entry, ...history].slice(0, 50));
      return entry;
    },
    async clearGoogleSyncHistory() { writeJson(SYNC_HISTORY_KEY, []); return { status: 'ok' }; },
    async forceRestoreCloudToLocal() { return refreshCloud('manual_restore'); },
    async forceUploadLocalToCloud() { return { status: 'not_supported', reason: 'cloud_is_canonical' }; }
  };

  globalThis.TimeWhereGoogleSyncStatusUI = {
    async init() { return this.refreshAll(); },
    async refreshAll() {
      const info = accountInfo(apiClient);
      document.querySelectorAll('.user-avatar').forEach(element => {
        if (info.picture) element.innerHTML = `<img src="${info.picture}" alt="Google 账户头像">`;
        element.dataset.syncStatus = info.connected ? 'connected' : 'disconnected';
        element.title = info.connected ? `Google 已连接：${info.name || info.email || 'Google 账户'}` : 'Google 未连接';
      });
      return info;
    }
  };

  globalThis.openMain = route => {
    window.location.href = productUrl(routeFromLegacyPath(route));
  };
  globalThis.TimeWhereWeb = { productUrl, refreshCloud, showToast, accountInfo: () => accountInfo(apiClient), auth };

  return { refreshCloud, auth, showToast, productUrl };
}
