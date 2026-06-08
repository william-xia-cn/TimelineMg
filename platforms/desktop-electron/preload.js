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
  },
  onNotificationClose(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('timewhere-platform:notification-close', listener);
    return () => ipcRenderer.removeListener('timewhere-platform:notification-close', listener);
  },
  onWindowActivated(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('timewhere-platform:window-activated', listener);
    return () => ipcRenderer.removeListener('timewhere-platform:window-activated', listener);
  },
  consumePendingNotificationClicks() {
    return ipcRenderer.invoke('timewhere-platform', {
      method: 'notification.consumePendingClicks',
      payload: {}
    });
  },
  consumePendingNotificationCloses() {
    return ipcRenderer.invoke('timewhere-platform', {
      method: 'notification.consumePendingCloses',
      payload: {}
    });
  }
});
