const { app, BrowserWindow, Menu, Notification, ipcMain, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const { pathToFileURL } = require('url');
const { createDesktopAuth } = require('./desktop-auth');
const { createChromeBridge } = require('./chrome-bridge');

const repoRoot = path.resolve(__dirname, '..', '..');
const devExtensionRoot = path.join(repoRoot, 'extension');
const packagedExtensionRoot = () => path.join(process.resourcesPath, 'extension');
const preloadPath = path.join(__dirname, 'preload.js');
const defaultRoute = 'pages/focus/focus.html';
const widgetSnapshotSchema = 'timewhere-widget-v1';
const widgetSnapshotFileName = 'timewhere-widget-v1.json';
const widgetAppGroupIdentifier = 'group.cn.williamxia.timewhere';
const protocolScheme = 'timewhere';
const smokeMode = process.env.TIMEWHERE_ELECTRON_SMOKE === '1';
const smokeRuntimeRoot = path.join(
  process.env.TMP || process.env.TEMP || repoRoot,
  `timewhere-electron-smoke-${process.pid}`
);

if (smokeMode) {
  app.setPath('userData', path.join(smokeRuntimeRoot, 'user-data'));
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('disk-cache-dir', path.join(smokeRuntimeRoot, 'cache'));
}

const desktopAuth = createDesktopAuth();
const chromeBridge = createChromeBridge();
const reminderTimers = new Map();
const pendingNotificationClicks = [];
let mainWindow = null;
let tray = null;
let isQuitting = false;
let pendingProtocolRoute = null;
const desktopSettingsDefaults = {
  minimizeToTray: false,
  closeToTray: true,
  startAtLogin: false
};
let desktopSettings = { ...desktopSettingsDefaults };
const desktopSettingsPath = () => path.join(app.getPath('userData'), 'timewhere-desktop-settings.json');

function appGroupWidgetSnapshotPath() {
  if (process.platform !== 'darwin') return null;
  return path.join(os.homedir(), 'Library', 'Group Containers', widgetAppGroupIdentifier, widgetSnapshotFileName);
}

function widgetSnapshotPath() {
  if (process.env.TIMEWHERE_WIDGET_SNAPSHOT_PATH) return process.env.TIMEWHERE_WIDGET_SNAPSHOT_PATH;
  const groupPath = appGroupWidgetSnapshotPath();
  if (groupPath && fs.existsSync(path.dirname(groupPath))) return groupPath;
  return path.join(app.getPath('userData'), widgetSnapshotFileName);
}

const routeMap = {
  dashboard: 'pages/focus/focus.html',
  focus: 'pages/focus/focus.html',
  tasks: 'pages/tasks/tasks.html',
  calendar: 'pages/calendar/calendar.html',
  settings: 'pages/settings/settings.html',
  matrixview: 'pages/settings/matrixview.html',
  managebac: 'pages/settings/managebac-sync.html'
};

function isValidDesktopSettings(payload = {}) {
  const next = {};
  if (typeof payload.minimizeToTray === 'boolean') next.minimizeToTray = payload.minimizeToTray;
  if (typeof payload.closeToTray === 'boolean') next.closeToTray = payload.closeToTray;
  if (typeof payload.startAtLogin === 'boolean') next.startAtLogin = payload.startAtLogin;
  return next;
}

function getTrayIcon() {
  const candidates = [
    path.join(getExtensionRoot(), 'icons', 'icon16.png'),
    path.join(getExtensionRoot(), 'icons', 'icon48.png'),
    path.join(getExtensionRoot(), 'icons', 'icon128.png')
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }
  return null;
}

function getWindowVisibilityState() {
  if (!mainWindow || mainWindow.isDestroyed()) return 'hidden';
  return mainWindow.isVisible() ? 'visible' : 'hidden';
}

function createTrayMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: '显示/隐藏',
      type: 'normal',
      click: () => toggleMainWindow()
    },
    {
      label: '打开设置',
      type: 'normal',
      click: () => openWindow(routeMap.settings)
    },
    { type: 'separator' },
    {
      label: '退出',
      type: 'normal',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray?.setContextMenu(menu);
}

function createTray() {
  if (tray) return;
  const icon = getTrayIcon();
  tray = new Tray(icon || nativeImage.createEmpty());
  tray.setToolTip('TimeWhere');
  tray.on('double-click', toggleMainWindow);
  tray.on('click', toggleMainWindow);
  createTrayMenu();
}

function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = null;
}

function openWindow(route = defaultRoute) {
  const win = getOrCreateMainWindow(route);
  if (win?.isMinimized?.()) win.restore();
  win?.show();
  win?.focus();
  return win;
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    openWindow(defaultRoute);
    return;
  }
  if (getWindowVisibilityState() === 'visible') {
    mainWindow.hide();
  } else {
    openWindow();
  }
}

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

function routeFromProtocolUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== `${protocolScheme}:`) return defaultRoute;
    const target = `${url.hostname || ''}${url.pathname || ''}`.replace(/^\/+/, '');
    if (target === 'dashboard' || target === 'focus' || !target) return routeMap.dashboard;
    return routeMap[target] || defaultRoute;
  } catch (_) {
    return defaultRoute;
  }
}

function openProtocolUrl(rawUrl) {
  const route = routeFromProtocolUrl(rawUrl);
  if (!app.isReady()) {
    pendingProtocolRoute = route;
    return;
  }
  openWindow(route);
}

async function loadDesktopSettings() {
  try {
    const raw = await fsp.readFile(desktopSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = {
      ...desktopSettingsDefaults,
      ...parsed
    };
    desktopSettings = {
      minimizeToTray: typeof normalized.minimizeToTray === 'boolean' ? normalized.minimizeToTray : desktopSettingsDefaults.minimizeToTray,
      closeToTray: typeof normalized.closeToTray === 'boolean' ? normalized.closeToTray : desktopSettingsDefaults.closeToTray,
      startAtLogin: typeof normalized.startAtLogin === 'boolean' ? normalized.startAtLogin : desktopSettingsDefaults.startAtLogin
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[Desktop] loadDesktopSettings failed: ${error.message}`);
    }
    desktopSettings = { ...desktopSettingsDefaults };
  }
  return desktopSettings;
}

async function persistDesktopSettings(next = {}) {
  desktopSettings = {
    ...desktopSettings,
    ...next
  };
  try {
    await fsp.writeFile(desktopSettingsPath(), JSON.stringify(desktopSettings, null, 2), 'utf8');
    return { status: 'ok', settings: { ...desktopSettings } };
  } catch (error) {
    console.error(`[Desktop] saveDesktopSettings failed: ${error.message}`);
    return { status: 'failed', reason: 'settings_save_failed', message: error.message };
  }
}

function applyLoginItemSettings(value) {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(value),
      openAsHidden: false
    });
    return { status: 'ok' };
  } catch (error) {
    return { status: 'failed', reason: 'set_login_item_failed', message: error.message };
  }
}

async function applyDesktopSettings(next = {}) {
  const updates = isValidDesktopSettings(next);
  const before = { ...desktopSettings };
  const saveResult = await persistDesktopSettings(updates);
  if (saveResult.status !== 'ok') {
    return {
      status: 'failed',
      reason: saveResult.reason,
      message: saveResult.message,
      settings: before
    };
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'startAtLogin')) {
    const targetStartAtLogin = desktopSettings.startAtLogin;
    const login = applyLoginItemSettings(desktopSettings.startAtLogin);
    if (login.status !== 'ok') {
      await persistDesktopSettings({ startAtLogin: before.startAtLogin });
      desktopSettings.startAtLogin = before.startAtLogin;
      return {
        status: 'failed',
        reason: login.reason,
        message: login.message,
        settings: { ...desktopSettings }
      };
    }
  }

  return { status: 'ok', settings: { ...desktopSettings } };
}

function sanitizeWidgetTask(task = {}) {
  return {
    id: String(task.id || ''),
    title: String(task.title || '无标题任务').slice(0, 120),
    plan_name: String(task.plan_name || '').slice(0, 80),
    schedule_time: task.schedule_time ? String(task.schedule_time).slice(0, 8) : null,
    duration: Number.isFinite(Number(task.duration)) ? Number(task.duration) : 45,
    priority: String(task.priority || 'medium').slice(0, 24),
    progress: String(task.progress || 'not_started').slice(0, 32),
    assignment_label: String(task.assignment_label || '').slice(0, 80)
  };
}

function sanitizeWidgetSnapshot(snapshot = {}) {
  const counts = snapshot.counts || {};
  return {
    schema: widgetSnapshotSchema,
    generated_at: snapshot.generated_at || new Date().toISOString(),
    counts: {
      completed_today: Math.max(0, Number(counts.completed_today) || 0),
      pending_today: Math.max(0, Number(counts.pending_today) || 0)
    },
    current_tasks: Array.isArray(snapshot.current_tasks)
      ? snapshot.current_tasks.slice(0, 3).map(sanitizeWidgetTask).filter(task => task.id)
      : []
  };
}

async function writeWidgetSnapshot(snapshot = {}) {
  const safeSnapshot = sanitizeWidgetSnapshot(snapshot);
  const target = widgetSnapshotPath();
  try {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, JSON.stringify(safeSnapshot, null, 2), 'utf8');
    return { status: 'ok', path: target, schema: safeSnapshot.schema };
  } catch (error) {
    return { status: 'failed', reason: 'widget_snapshot_write_failed', message: error.message };
  }
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

  mainWindow.on('close', event => {
    if (isQuitting) return;
    if (desktopSettings.closeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

function getOrCreateMainWindow(route = defaultRoute) {
  if (!mainWindow || mainWindow.isDestroyed()) return createMainWindow(route);
  if (mainWindow.isMinimized()) mainWindow.restore();
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
        {
          label: '退出',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
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
  const clickPayload = {
    ...payload,
    clicked_at: new Date().toISOString()
  };
  pendingNotificationClicks.push(clickPayload);
  if (pendingNotificationClicks.length > 25) pendingNotificationClicks.shift();

  const route = payload.route
    || (payload.task_id ? `pages/focus/focus.html?task_id=${encodeURIComponent(payload.task_id)}` : null)
    || (payload.journal_date ? `pages/focus/focus.html?journal_date=${encodeURIComponent(payload.journal_date)}` : null);
  if (route) getOrCreateMainWindow(route);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('timewhere-platform:notification-click', clickPayload);
}

function consumePendingNotificationClicks() {
  const clicks = pendingNotificationClicks.splice(0, pendingNotificationClicks.length);
  return { status: 'ok', clicks };
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
  if (method === 'window.show') {
    const route = payload.route || defaultRoute;
    const win = openWindow(route);
    return { status: 'shown', route, windowId: win?.id };
  }
  if (method === 'window.hide') {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
      return { status: 'hidden', route: null };
    }
    return { status: 'hidden', route: null };
  }
  if (method === 'notification.notify') {
    return showDesktopNotification(payload);
  }
  if (method === 'notification.consumePendingClicks') {
    return consumePendingNotificationClicks();
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
  if (method === 'system.getDesktopSettings') {
    return {
      status: 'ok',
      settings: { ...desktopSettings }
    };
  }
  if (method === 'system.setDesktopSettings') {
    return await applyDesktopSettings(payload);
  }
  if (method === 'system.writeWidgetSnapshot') {
    return await writeWidgetSnapshot(payload);
  }
  return { status: 'not_supported', method };
});

app.whenReady().then(() => {
  if (!smokeMode) app.setAsDefaultProtocolClient(protocolScheme);
  loadDesktopSettings()
    .then(() => {
      applyLoginItemSettings(desktopSettings.startAtLogin);
      return syncLoginItemStateFromOS();
    })
    .then(() => {
      buildMenu();
      createMainWindow(pendingProtocolRoute || defaultRoute);
      pendingProtocolRoute = null;
      createTray();
      syncTrayMenuLabels();
    })
    .catch(error => {
      console.error(`[Desktop] init failed: ${error.message}`);
      buildMenu();
      createMainWindow();
      createTray();
      syncTrayMenuLabels();
    });
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow();
      return;
    }
    openWindow();
  });
});

app.on('open-url', (event, rawUrl) => {
  event.preventDefault();
  openProtocolUrl(rawUrl);
});

function syncLoginItemStateFromOS() {
  if (!app.getLoginItemSettings) return Promise.resolve(desktopSettings);
  const state = app.getLoginItemSettings();
  if (typeof state?.openAtLogin === 'boolean' && state.openAtLogin !== desktopSettings.startAtLogin) {
    return persistDesktopSettings({ startAtLogin: state.openAtLogin }).then(() => ({ settings: { ...desktopSettings } }));
  }
  return Promise.resolve({ settings: { ...desktopSettings } });
}

function syncTrayMenuLabels() {
  if (!tray) return;
  createTrayMenu();
}

app.on('window-all-closed', () => {
  chromeBridge.closeActiveServer();
  for (const id of reminderTimers.keys()) cancelReminder(id);
  app.quit();
});

app.on('will-quit', () => {
  destroyTray();
});

app.on('before-quit', () => {
  isQuitting = true;
});
