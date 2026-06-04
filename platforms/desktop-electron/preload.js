const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('TimeWhereElectronPlatform', {
  invoke(method, payload = {}) {
    return ipcRenderer.invoke('timewhere-platform', { method, payload });
  },
  onNotificationClick(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('timewhere-platform:notification-click', listener);
    return () => ipcRenderer.removeListener('timewhere-platform:notification-click', listener);
  }
});