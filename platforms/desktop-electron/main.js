const { app, BrowserWindow, Menu, Notification, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { createDesktopAuth } = require('./desktop-auth');
const { createChromeBridge } = require('./chrome-bridge');

const repoRoot = path.resolve(__dirname, '..', '..');
const devExtensionRoot = path.join(repoRoot, 'extension');
const packagedExtensionRoot = () => path.join(process.resourcesPath, 'extension');
const preloadPath = path.join(__dirname, 'preload.js');
const defaultRoute = 'pages/focus/focus.html';
const smokeMode = process.env.TIMEWHERE_ELECTRON_SMOKE === '1';

const desktopAuth = createDesktopAuth();
const chromeBridge = createChromeBridge();
const reminderTimers = new Map();
let mainWindow = null;

const routeMap = {
  dashboard: 'pages/focus/focus.html',
  focus: 'pages/focus/focus.html',
  tasks: 'pages/tasks/tasks.html',
  calendar: 'pages/calendar/calendar.html',
  settings: 'pages/settings/settings.html',
  matrixview: 'pages/settings/matrixview.html',
  managebac: 'pages/settings/managebac-sync.html'
};

function getExtensionRoot() {
  return app.isPackaged ? packagedExtensionRoot() : devExtensionRoot;
}

function normalizeRoute(route = defaultRoute) {
  const raw = String(route || defaultRoute).replace(/\\/g, '/').trim();
  if (/^(https?:|chrome-extension:)/i.test(raw)) {
    throw new Error('External routes are not allowed in the desktop shell');
  }
  const alias = routeMap[raw.replace(/^\/+/, '')] || raw;
  return alias.startsWith('extension/')
    ? alias.slice('extension/'.length)
    : alias.replace(/^\/+/, '');
}

function splitRoute(route) {
  const normalized = normalizeRoute(route);
  const match = normalized.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  return {
    pathname: match?.[1] || defaultRoute,
    search: match?.[2] || '',
    hash: match?.[3] || ''
  };
}

function resolveExtensionRoute(route = defaultRoute) {
  const root = getExtensionRoot();
  const parts = splitRoute(route);
  const resolved = path.resolve(root, parts.pathname);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error('Route is outside the extension package root');
  }
  return { filePath: resolved, search: parts.search, hash: parts.hash, route: parts.pathname };
}

async function loadRoute(win, route = defaultRoute) {
  const resolved = resolveExtensionRoute(route);
  const url = `${pathToFileURL(resolved.filePath).toString()}${resolved.search}${resolved.hash}`;
  await win.loadURL(url);
  return resolved;
}

function createMainWindow(route = defaultRoute) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: 'TimeWhere',
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  loadRoute(mainWindow, route).catch(error => {
    console.error(`TimeWhere desktop route failed: ${error.message}`);
    if (smokeMode) app.exit(1);
  });

  if (smokeMode) {
    const quit = () => setTimeout(() => app.quit(), 100);
    mainWindow.webContents.once('did-finish-load', quit);
    mainWindow.webContents.once('did-fail-load', (_event, _errorCode, errorDescription) => {
      console.error(`TimeWhere Electron smoke failed: ${errorDescription}`);
      app.exit(1);
    });
    setTimeout(() => {
      if (!mainWindow?.isDestroyed()) app.quit();
    }, 5000);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

function getOrCreateMainWindow(route = defaultRoute) {
  if (!mainWindow || mainWindow.isDestroyed()) return createMainWindow(route);
  mainWindow.show();
  mainWindow.focus();
  if (route) loadRoute(mainWindow, route).catch(error => console.error(`TimeWhere route failed: ${error.message}`));
  return mainWindow;
}

function buildMenu() {
  const routeItem = (label, route, accelerator) => ({
    label,
    accelerator,
    click: () => getOrCreateMainWindow(route)
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'TimeWhere',
      submenu: [
        routeItem('Dashboard', routeMap.dashboard, 'CmdOrCtrl+1'),
        routeItem('Tasks', routeMap.tasks, 'CmdOrCtrl+2'),
        routeItem('Calendar', routeMap.calendar, 'CmdOrCtrl+3'),
        routeItem('Settings', routeMap.settings, 'CmdOrCtrl+,'),
        { type: 'separator' },
        routeItem('MatrixView Import', routeMap.matrixview),
        routeItem('ManageBac Sync', routeMap.managebac),
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]));
}

function sendNotificationClick(payload = {}) {
  const route = payload.route
    || (payload.task_id ? `pages/focus/focus.html?task_id=${encodeURIComponent(payload.task_id)}` : null)
    || (payload.journal_date ? `pages/focus/focus.html?journal_date=${encodeURIComponent(payload.journal_date)}` : null);
  if (route) getOrCreateMainWindow(route);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('timewhere-platform:notification-click', payload);
}

function showDesktopNotification(payload = {}) {
  if (!Notification.isSupported()) return { status: 'not_supported' };
  const notification = new Notification({
    title: payload.title || 'TimeWhere',
    body: payload.message || payload.body || '',
    silent: payload.silent === true
  });
  notification.on('click', () => sendNotificationClick(payload));
  notification.show();
  return { status: 'created', id: payload.id || null };
}

function reminderDelayMs(reminder = {}) {
  if (reminder.when) {
    const when = typeof reminder.when === 'number' ? reminder.when : new Date(reminder.when).getTime();
    return Math.max(0, when - Date.now());
  }
  if (reminder.delayInMinutes != null) {
    return Math.max(0, Number(reminder.delayInMinutes) * 60 * 1000);
  }
  return 0;
}

function scheduleReminder(reminder = {}) {
  const id = reminder.id || reminder.key || reminder.name;
  if (!id) return { status: 'invalid', reason: 'missing_id' };
  cancelReminder(id);
  const delay = reminderDelayMs(reminder);
  const timer = setTimeout(() => {
    reminderTimers.delete(id);
    showDesktopNotification({
      id,
      title: reminder.title || reminder.notification?.title || 'TimeWhere',
      message: reminder.message || reminder.notification?.message || reminder.notification?.body || '',
      task_id: reminder.task_id,
      journal_date: reminder.journal_date,
      route: reminder.route
    });
  }, delay);
  reminderTimers.set(id, timer);
  return { status: 'scheduled', id, delay_ms: delay };
}

function cancelReminder(id) {
  if (!id || !reminderTimers.has(id)) return { status: 'missing', id };
  clearTimeout(reminderTimers.get(id));
  reminderTimers.delete(id);
  return { status: 'cleared', id };
}

function rescheduleAllReminders(reminders = []) {
  for (const id of reminderTimers.keys()) cancelReminder(id);
  const scheduled = [];
  for (const reminder of reminders || []) {
    const result = scheduleReminder(reminder);
    if (result.status === 'scheduled') scheduled.push(result);
  }
  return { status: 'scheduled', count: scheduled.length, scheduled };
}

function serializeAuthError(error) {
  return {
    status: 'failed',
    reason: error?.code || 'desktop_oauth_failed',
    message: error?.message || 'Desktop Google authorization failed'
  };
}

ipcMain.handle('timewhere-platform', async (_event, request = {}) => {
  const method = request.method;
  const payload = request.payload || {};
  if (method === 'window.openMain' || method === 'window.focus' || method === 'window.openQuickPanel') {
    const route = payload.route || defaultRoute;
    const win = getOrCreateMainWindow(route);
    return { status: 'opened', route, windowId: win.id };
  }
  if (method === 'notification.notify') {
    return showDesktopNotification(payload);
  }
  if (method === 'reminderRuntime.schedule') {
    return scheduleReminder(payload);
  }
  if (method === 'reminderRuntime.cancel') {
    return cancelReminder(payload.id);
  }
  if (method === 'reminderRuntime.rescheduleAll') {
    return rescheduleAllReminders(payload.reminders || []);
  }
  if (method === 'badge.set') {
    const count = Number(payload.count ?? payload.text ?? 0);
    app.setBadgeCount(Number.isFinite(count) ? Math.max(0, count) : 0);
    return { status: 'set' };
  }
  if (method === 'badge.clear') {
    app.setBadgeCount(0);
    return { status: 'cleared' };
  }
  if (method === 'auth.getStatus') {
    return await desktopAuth.getStatus();
  }
  if (method === 'auth.getGoogleToken') {
    try {
      return await desktopAuth.getGoogleToken(payload);
    } catch (error) {
      return serializeAuthError(error);
    }
  }
  if (method === 'auth.getAccountInfo') {
    return await desktopAuth.getAccountInfo();
  }
  if (method === 'auth.revokeGoogleToken') {
    return await desktopAuth.revokeGoogleToken();
  }
  if (method === 'chromeBridge.connectExtension') {
    return await chromeBridge.connectExtension(payload);
  }
  if (method === 'chromeBridge.status') {
    return chromeBridge.getStatus();
  }
  if (method === 'desktop.info') {
    return {
      status: 'ok',
      name: 'desktop-electron',
      packaged: app.isPackaged,
      version: app.getVersion(),
      extensionRoot: getExtensionRoot()
    };
  }
  return { status: 'not_supported', method };
});

app.whenReady().then(() => {
  buildMenu();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  chromeBridge.closeActiveServer();
  for (const id of reminderTimers.keys()) cancelReminder(id);
  if (process.platform !== 'darwin') app.quit();
});
