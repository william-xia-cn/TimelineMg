const { app, BrowserWindow, Menu, Notification, ipcMain, Tray, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const crypto = require('node:crypto');
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
const desktopAppId = 'cn.williamxia.timewhere';
const smokeMode = process.env.TIMEWHERE_ELECTRON_SMOKE === '1';
const smokeRuntimeRoot = path.join(
  process.env.TMP || process.env.TEMP || repoRoot,
  `timewhere-electron-smoke-${process.pid}`
);

if (process.platform === 'win32') {
  app.setAppUserModelId(desktopAppId);
}

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
const desktopProfileDefaults = {
  schema: 'timewhere-desktop-profile-v1',
  active_profile_id: 'default',
  profiles: {
    default: {
      profile_id: 'default',
      partition: null,
      owner_account_key: null,
      owner_display: null,
      created_at: null,
      updated_at: null
    }
  }
};
let desktopProfileState = JSON.parse(JSON.stringify(desktopProfileDefaults));
let switchingDesktopProfile = false;
const pendingGoogleAccountSwitches = new Map();
const desktopSettingsPath = () => path.join(app.getPath('userData'), 'timewhere-desktop-settings.json');
const desktopProfilePath = () => path.join(app.getPath('userData'), 'timewhere-desktop-profile.json');

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

function getWindowIcon() {
  const candidates = [
    path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    path.join(getExtensionRoot(), 'icons', 'icon128.png'),
    path.join(getExtensionRoot(), 'icons', 'icon48.png')
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }
  return null;
}

function getDefaultWindowBounds() {
  const fallback = {
    width: 1880,
    height: 980,
    minWidth: 1400,
    minHeight: 840
  };
  try {
    const workArea = screen.getPrimaryDisplay()?.workArea;
    if (!workArea || workArea.width <= 0 || workArea.height <= 0) {
      return fallback;
    }
    const width = Math.min(1880, Math.floor(workArea.width * 0.95));
    const height = Math.min(1120, Math.floor(workArea.height * 0.9));
    const minWidth = Math.min(width, Math.max(1120, Math.floor(width * 0.88)));
    const minHeight = Math.min(height, Math.max(760, Math.floor(height * 0.86)));
    return {
      width,
      height,
      minWidth,
      minHeight
    };
  } catch (_) {
    return fallback;
  }
}

function showWindow(win) {
  if (!win || win.isDestroyed()) return null;
  if (win.isMinimized()) {
    win.restore();
  }
  if (process.platform === 'darwin' && app.dock?.show) {
    app.dock.show();
  }
  win.show();
  win.focus();
  return win;
}

function hideToTray(win) {
  if (!win || win.isDestroyed()) return;
  win.hide();
  if (process.platform === 'darwin' && app.dock?.hide) {
    app.dock.hide();
  }
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
  return getOrCreateMainWindow(route);
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

function normalizeExternalHttpUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

async function openExternalHttpUrl(rawUrl) {
  const url = normalizeExternalHttpUrl(rawUrl);
  if (!url) return { status: 'invalid', reason: 'unsupported_url_protocol' };
  await shell.openExternal(url);
  return { status: 'opened', url };
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

function nowISO() {
  return new Date().toISOString();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeAccountDisplay(account = {}) {
  return {
    account_key: account.account_key || null,
    name: account.name || null,
    email: account.email || null
  };
}

function makeDesktopProfileId(accountKey = '') {
  return `google-${String(accountKey).slice(0, 16)}`;
}

function makeDesktopPartition(accountKey = '') {
  return `persist:timewhere-google-${String(accountKey).replace(/[^a-f0-9]/gi, '').toLowerCase()}`;
}

function normalizeDesktopProfileState(raw = {}) {
  const base = cloneJson(desktopProfileDefaults);
  const profiles = raw.profiles && typeof raw.profiles === 'object' ? raw.profiles : {};
  const now = nowISO();
  const normalizedProfiles = {
    ...base.profiles,
    ...profiles
  };
  if (!normalizedProfiles.default) {
    normalizedProfiles.default = { ...base.profiles.default };
  }
  normalizedProfiles.default = {
    ...base.profiles.default,
    ...normalizedProfiles.default,
    profile_id: 'default',
    partition: normalizedProfiles.default.partition || null,
    created_at: normalizedProfiles.default.created_at || now,
    updated_at: normalizedProfiles.default.updated_at || now
  };
  const active = raw.active_profile_id && normalizedProfiles[raw.active_profile_id]
    ? raw.active_profile_id
    : 'default';
  return {
    schema: desktopProfileDefaults.schema,
    active_profile_id: active,
    profiles: normalizedProfiles,
    updated_at: raw.updated_at || now
  };
}

async function loadDesktopProfileState() {
  try {
    const raw = await fsp.readFile(desktopProfilePath(), 'utf8');
    desktopProfileState = normalizeDesktopProfileState(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[Desktop] loadDesktopProfileState failed: ${error.message}`);
    }
    desktopProfileState = normalizeDesktopProfileState(desktopProfileDefaults);
  }
  return desktopProfileState;
}

async function persistDesktopProfileState() {
  desktopProfileState.updated_at = nowISO();
  await fsp.mkdir(path.dirname(desktopProfilePath()), { recursive: true });
  await fsp.writeFile(desktopProfilePath(), JSON.stringify(desktopProfileState, null, 2), 'utf8');
  return desktopProfileState;
}

function getActiveDesktopProfile() {
  const state = normalizeDesktopProfileState(desktopProfileState);
  desktopProfileState = state;
  return state.profiles[state.active_profile_id] || state.profiles.default;
}

function getDesktopProfileSnapshot() {
  const profile = getActiveDesktopProfile();
  return {
    status: 'ok',
    profile_id: profile.profile_id,
    owner_account_key: profile.owner_account_key || null,
    owner_display: profile.owner_display || null,
    partition: profile.partition || 'default',
    is_account_owned: Boolean(profile.owner_account_key)
  };
}

async function bindActiveProfileToAccount(accountInfo = {}) {
  if (!accountInfo.account_key) return getDesktopProfileSnapshot();
  const profile = getActiveDesktopProfile();
  const display = normalizeAccountDisplay(accountInfo);
  desktopProfileState.profiles[profile.profile_id] = {
    ...profile,
    owner_account_key: accountInfo.account_key,
    owner_display: display,
    updated_at: nowISO()
  };
  await persistDesktopProfileState();
  return getDesktopProfileSnapshot();
}

async function activateDesktopProfileForAccount(accountInfo = {}) {
  if (!accountInfo.account_key) {
    return { status: 'failed', reason: 'missing_account_key' };
  }
  const display = normalizeAccountDisplay(accountInfo);
  const existing = Object.values(desktopProfileState.profiles || {})
    .find(profile => profile.owner_account_key === accountInfo.account_key);
  const profileId = existing?.profile_id || makeDesktopProfileId(accountInfo.account_key);
  const now = nowISO();
  desktopProfileState.profiles[profileId] = {
    ...(existing || {}),
    profile_id: profileId,
    partition: existing?.partition || makeDesktopPartition(accountInfo.account_key),
    owner_account_key: accountInfo.account_key,
    owner_display: display,
    created_at: existing?.created_at || now,
    updated_at: now
  };
  desktopProfileState.active_profile_id = profileId;
  await persistDesktopProfileState();
  return getDesktopProfileSnapshot();
}

function createPendingGoogleAccountSwitch(accountInfo = {}, currentProfile = null) {
  const pendingAuthId = crypto.randomBytes(16).toString('hex');
  pendingGoogleAccountSwitches.set(pendingAuthId, {
    account_info: normalizeAccountDisplay(accountInfo),
    current_profile: currentProfile || getActiveDesktopProfile(),
    created_at: Date.now()
  });
  return pendingAuthId;
}

async function ensureDesktopProfileForAuth(authResult = {}) {
  const accountInfo = authResult.account_info || null;
  if (!accountInfo?.account_key) return { status: 'ok', profile: getDesktopProfileSnapshot() };
  const profile = getActiveDesktopProfile();
  if (!profile.owner_account_key) {
    return { status: 'ok', profile: await bindActiveProfileToAccount(accountInfo) };
  }
  if (profile.owner_account_key === accountInfo.account_key) {
    return { status: 'ok', profile: await bindActiveProfileToAccount(accountInfo) };
  }
  const pendingAuthId = createPendingGoogleAccountSwitch(accountInfo, profile);
  return {
    status: 'account_mismatch',
    reason: 'account_mismatch',
    message: 'The connected Google account belongs to a different TimeWhere desktop data space.',
    pending_auth_id: pendingAuthId,
    current_account: profile.owner_display || null,
    authorized_account: normalizeAccountDisplay(accountInfo)
  };
}

function recreateMainWindowForActiveProfile(route = routeMap.settings) {
  switchingDesktopProfile = true;
  const oldWindow = mainWindow;
  const win = createMainWindow(route);
  showWindow(win);
  if (oldWindow && !oldWindow.isDestroyed()) {
    oldWindow.destroy();
  }
  setTimeout(() => {
    switchingDesktopProfile = false;
  }, 250);
  return win;
}

async function confirmGoogleAccountSwitch(payload = {}) {
  const pendingAuthId = payload.pending_auth_id;
  const pending = pendingGoogleAccountSwitches.get(pendingAuthId);
  if (!pending) {
    return { status: 'failed', reason: 'pending_auth_missing' };
  }
  pendingGoogleAccountSwitches.delete(pendingAuthId);
  const profile = await activateDesktopProfileForAccount(pending.account_info);
  setTimeout(() => recreateMainWindowForActiveProfile(routeMap.settings), 50);
  return { status: 'ok', profile };
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
  const bounds = getDefaultWindowBounds();
  const profile = getActiveDesktopProfile();
  const webPreferences = {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false
  };
  if (profile.partition) {
    webPreferences.partition = profile.partition;
  }
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    title: 'TimeWhere',
    icon: getWindowIcon() || undefined,
    backgroundColor: '#f1f5f9',
    webPreferences
  });
  mainWindow = win;

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

  win.on('close', event => {
    if (isQuitting) return;
    if (desktopSettings.closeToTray) {
      event.preventDefault();
      hideToTray(win);
    }
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  return win;
}

function getOrCreateMainWindow(route = defaultRoute) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    const win = createMainWindow(route);
    if (win) {
      showWindow(win);
      return win;
    }
    return null;
  }
  showWindow(mainWindow);
  if (route) {
    loadRoute(mainWindow, route).catch(error => {
      console.error(`TimeWhere route failed: ${error.message}`);
    });
  }
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
      const result = await desktopAuth.getGoogleToken(payload);
      if (result?.status === 'ok') {
        const profileResult = await ensureDesktopProfileForAuth(result);
        if (profileResult.status === 'account_mismatch') {
          return profileResult;
        }
        return { ...result, desktop_profile: profileResult.profile };
      }
      return result;
    } catch (error) {
      return serializeAuthError(error);
    }
  }
  if (method === 'auth.getAccountInfo') {
    const info = await desktopAuth.getAccountInfo();
    return { ...info, desktop_profile: getDesktopProfileSnapshot() };
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
  if (method === 'external.openUrl') {
    return await openExternalHttpUrl(payload.url);
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
  if (method === 'system.getDesktopProfile') {
    return getDesktopProfileSnapshot();
  }
  if (method === 'system.confirmGoogleAccountSwitch') {
    return await confirmGoogleAccountSwitch(payload);
  }
  return { status: 'not_supported', method };
});

  app.whenReady().then(() => {
  if (!smokeMode) app.setAsDefaultProtocolClient(protocolScheme);
  loadDesktopSettings()
    .then(() => loadDesktopProfileState())
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
  if (switchingDesktopProfile) return;
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
