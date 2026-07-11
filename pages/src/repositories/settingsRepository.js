const SETTINGS_CACHE_KEY = 'timewhere.web.settings.cache.v1';

export class OfflineSettingsWriteBlockedError extends Error {
  constructor(message = 'Editing settings requires a network connection') {
    super(message);
    this.code = 'offline_write_blocked';
  }
}

function canUseStorage(storage) {
  return Boolean(storage?.getItem && storage?.setItem && storage?.removeItem);
}

function readCachedSettings(storage) {
  if (!canUseStorage(storage)) return {};
  try {
    const payload = JSON.parse(storage.getItem(SETTINGS_CACHE_KEY) || 'null');
    return payload?.settings && typeof payload.settings === 'object' ? payload.settings : {};
  } catch {
    return {};
  }
}

function writeCachedSettings(storage, settings) {
  if (!canUseStorage(storage)) return;
  storage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({
    schema: 'timewhere-settings-cache-v1',
    cached_at: new Date().toISOString(),
    settings: settings && typeof settings === 'object' ? settings : {}
  }));
}

function assertOnline(isOnline) {
  if (!isOnline()) throw new OfflineSettingsWriteBlockedError('offline_write_blocked: reconnect before editing settings.');
}

export function createSettingsRepository(apiClient, { storage = window.localStorage, isOnline = () => navigator.onLine } = {}) {
  return {
    getCachedSettings() {
      return readCachedSettings(storage);
    },
    async getSettings() {
      if (!isOnline()) return readCachedSettings(storage);
      const data = await apiClient.request('/settings', { method: 'GET' });
      const settings = data.settings || {};
      writeCachedSettings(storage, settings);
      return settings;
    },
    async updateSettings(patch) {
      assertOnline(isOnline);
      const data = await apiClient.request('/settings', { method: 'PUT', body: patch });
      const settings = data.settings || {};
      writeCachedSettings(storage, settings);
      return settings;
    }
  };
}
