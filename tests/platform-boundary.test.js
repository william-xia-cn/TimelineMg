/**
 * Platform boundary static checks.
 * Run: node tests/platform-boundary.test.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function listFiles(dir, suffixes) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listFiles(full, suffixes));
        } else if (suffixes.some(suffix => entry.name.endsWith(suffix))) {
            out.push(full);
        }
    }
    return out;
}

function assert(desc, condition) {
    if (condition) {
        passed++;
        console.log(`  PASS ${desc}`);
    } else {
        failed++;
        console.log(`  FAIL ${desc}`);
    }
}

console.log('\nTimeWhere platform boundary checks\n' + '='.repeat(42));

const decisions = read('DECISIONS.md');
const projectMaster = read('PROJECT_MASTER.md');
const taskBoard = read('TASK_BOARD.md');
const spec = read('docs/specs/FEATURE_SPEC_DUAL_PLATFORM_EVOLUTION.md');
const boundary = read('docs/PLATFORM_BOUNDARY.md');
const platformJs = read('extension/shared/js/platform.js');
const popupJs = read('extension/popup/popup.js');
const settingsHtml = read('extension/pages/settings/settings.html');
const settingsScript = read('extension/pages/settings/script.js');
const cwsPackageScript = read('tools/package-cws.ps1');
const packageJson = JSON.parse(read('package.json'));
const electronPackage = JSON.parse(read('platforms/desktop-electron/package.json'));
const electronLock = JSON.parse(read('platforms/desktop-electron/package-lock.json'));
const gitignore = read('.gitignore');
const electronMain = read('platforms/desktop-electron/main.js');
const electronPreload = read('platforms/desktop-electron/preload.js');
const desktopAuth = read('platforms/desktop-electron/desktop-auth.js');
const chromeBridge = read('platforms/desktop-electron/chrome-bridge.js');
const bridgeHtml = read('extension/pages/desktop-bridge/bridge.html');
const bridgeJs = read('extension/pages/desktop-bridge/bridge.js');
const manifest = JSON.parse(read('extension/manifest.json'));
const widgetSnapshot = read('extension/shared/js/widget-snapshot.js');
const widgetSwift = read('platforms/macos-widget/TimeWhereWidget/TimeWhereWidget.swift');
const widgetWorkflow = read('.github/workflows/timewhere-macos-widget.yml');

assert('D-031 records standalone Windows desktop app direction',
    decisions.includes('D-031')
    && decisions.includes('standalone Windows desktop app')
    && decisions.includes('optional Chrome extension connection')
    && decisions.includes('safeStorage')
    && decisions.includes('does not approve CWS submission of bridge permissions'));
assert('Project status records Windows desktop portable implementation boundary',
    projectMaster.includes('Windows desktop portable implementation')
    && projectMaster.includes('D-031 approves a standalone Windows Electron portable app')
    && projectMaster.includes('D-032 replaces only its Desktop OAuth secret handling')
    && taskBoard.includes('D-031/D-032 Windows desktop portable implementation is active'));
assert('Dual-platform spec covers desktop OAuth, notifications, portable exe, and bridge as optional',
    spec.includes('standalone Windows Electron app')
    && spec.includes('configured Google Desktop OAuth client ID')
    && spec.includes('TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID')
    && spec.includes('TimeWhere-0.3.0-win-portable.exe')
    && spec.includes('Missing extension, old bridge version, nonce mismatch, or timeout are shown as non-blocking'));
assert('Platform boundary forbids Chrome extension dependency for Windows app',
    boundary.includes('Chrome extension connection is optional')
    && boundary.includes('Desktop refresh tokens must be encrypted')
    && boundary.includes('It must not transfer tasks, calendars, journals, tokens, or other user data')
    && boundary.includes('timewhere-widget-v1.json')
    && boundary.includes('not read IndexedDB, Google sync state, OAuth tokens'));

assert('TimeWherePlatform exposes desktop-capable contract',
    platformJs.includes('global.TimeWherePlatform')
    && platformJs.includes('TimeWherePlatformContract')
    && platformJs.includes("reminderRuntime: ['schedule', 'cancel', 'rescheduleAll']")
    && platformJs.includes("auth: ['getStatus', 'getGoogleToken', 'getAccountInfo', 'revokeGoogleToken']")
    && platformJs.includes("chromeBridge: ['connectExtension', 'getStatus']")
    && platformJs.includes("system: ['getDesktopSettings', 'setDesktopSettings', 'writeWidgetSnapshot']"));
assert('Chrome adapter wraps expected platform APIs',
    platformJs.includes("name: 'chrome-extension'")
    && platformJs.includes('chromeRef.tabs.create')
    && platformJs.includes('chromeRef.sidePanel.open')
    && platformJs.includes('chromeRef.notifications.create')
    && platformJs.includes('chromeRef.alarms.create')
    && platformJs.includes('chromeRef.action.setBadgeText')
    && platformJs.includes('chromeRef.identity.getAuthToken'));
assert('Desktop adapter delegates auth, reminders, and Chrome bridge to Electron preload',
    platformJs.includes("name: 'desktop-electron'")
    && platformJs.includes("call('auth.getGoogleToken'")
    && platformJs.includes("call('auth.getStatus'")
    && platformJs.includes("call('reminderRuntime.rescheduleAll'")
    && platformJs.includes("call('chromeBridge.connectExtension'")
    && platformJs.includes("call('system.getDesktopSettings'")
    && platformJs.includes("call('system.setDesktopSettings'")
    && platformJs.includes("call('system.writeWidgetSnapshot'"));
assert('Fallback platform returns desktop system settings capability as not_supported',
    platformJs.includes("name: 'web-fallback'")
    && platformJs.includes("getDesktopSettings: () => ({ status: 'not_supported'")
    && platformJs.includes("setDesktopSettings: () => ({ status: 'not_supported'")
    && platformJs.includes("writeWidgetSnapshot: () => ({ status: 'not_supported'"));

const pagesWithPlatform = [
    'extension/pages/focus/focus.html',
    'extension/pages/settings/settings.html',
    'extension/pages/tasks/tasks.html',
    'extension/pages/calendar/calendar.html',
    'extension/popup/popup.html',
    'extension/popup/sidepanel.html'
];
assert('Primary pages load platform adapter before page scripts',
    pagesWithPlatform.every(file => read(file).includes('shared/js/platform.js')));
assert('Desktop app pages load reminders and desktop reminder bridge',
    [
        'extension/pages/focus/focus.html',
        'extension/pages/settings/settings.html',
        'extension/pages/tasks/tasks.html',
        'extension/pages/calendar/calendar.html'
    ].every(file => read(file).includes('shared/js/reminders.js') && read(file).includes('shared/js/widget-snapshot.js') && read(file).includes('shared/js/desktop-reminders.js')));
assert('Popup navigation uses TimeWherePlatform with Chrome fallback',
    popupJs.includes('TimeWherePlatform?.window?.openMain')
    && popupJs.includes('TimeWherePlatform?.window?.openSettings')
    && popupJs.includes('falling back to chrome.tabs')
    && popupJs.includes('falling back to options page'));

assert('Root package exposes desktop Electron scripts',
    packageJson.scripts?.['electron:dev'] === 'npm --prefix platforms/desktop-electron start'
    && packageJson.scripts?.['electron:smoke']?.includes('TIMEWHERE_ELECTRON_SMOKE')
    && packageJson.scripts?.['electron:package:win'] === 'npm --prefix platforms/desktop-electron run package:win');
assert('Desktop Electron package builds Windows portable exe',
    electronPackage.private === true
    && electronPackage.main === 'main.js'
    && electronPackage.scripts?.start === 'electron .'
    && electronPackage.scripts?.['package:win']?.includes('electron-builder')
    && electronPackage.dependencies?.ws
    && electronPackage.devDependencies?.electron === '^42.3.2'
    && electronPackage.devDependencies?.['electron-builder']
    && electronPackage.build?.win?.artifactName === 'TimeWhere-0.3.0-win-portable.exe'
    && electronLock.packages?.['node_modules/electron']?.version === '42.3.2'
    && gitignore.includes('!platforms/desktop-electron/package-lock.json'));
assert('Desktop Electron package builds macOS Universal zip',
    electronPackage.scripts?.['package:mac'] === 'electron-builder --mac zip --universal'
    && electronPackage.build?.mac?.target?.[0]?.target === 'zip'
    && electronPackage.build?.mac?.target?.[0]?.arch?.includes('universal')
    && electronPackage.build?.mac?.artifactName === 'TimeWhere-0.3.0-mac-universal.zip');
assert('macOS WidgetKit preparation is display-only and unsigned-build scoped',
    decisions.includes('D-034')
    && boundary.includes('platforms/macos-widget/')
    && packageJson.scripts?.['macos:widget:build']?.includes('CODE_SIGNING_ALLOWED=NO')
    && widgetWorkflow.includes('macos-latest')
    && widgetWorkflow.includes('npm run macos:widget:build')
    && widgetSnapshot.includes('timewhere-widget-v1')
    && widgetSwift.includes('WidgetKit')
    && widgetSwift.includes('timewhere://dashboard')
    && !/token|secret|OAuth|cookie|email/i.test(widgetSwift));
assert('Desktop main loads packaged extension resources and exposes navigation routes',
    electronMain.includes('packagedExtensionRoot')
    && electronMain.includes('process.resourcesPath')
    && electronMain.includes("matrixview: 'pages/settings/matrixview.html'")
    && electronMain.includes("managebac: 'pages/settings/managebac-sync.html'")
    && electronMain.includes("const protocolScheme = 'timewhere'")
    && electronMain.includes('app.setAsDefaultProtocolClient(protocolScheme)')
    && electronMain.includes('TimeWhere-0.3.0-win-portable.exe') === false
    && electronMain.includes('Menu.setApplicationMenu')
    && electronMain.includes('TIMEWHERE_ELECTRON_SMOKE'));
assert('Desktop main exposes auth, reminders, notifications, and Chrome bridge IPC',
    electronMain.includes("method === 'auth.getGoogleToken'")
    && electronMain.includes('serializeAuthError')
    && electronMain.includes("method === 'reminderRuntime.rescheduleAll'")
    && electronMain.includes("method === 'notification.consumePendingClicks'")
    && electronMain.includes('pendingNotificationClicks')
    && electronMain.includes("method === 'chromeBridge.connectExtension'")
    && electronMain.includes('Notification.isSupported'));
assert('Electron preload exposes TimeWhereElectronPlatform bridge',
    electronPreload.includes("contextBridge.exposeInMainWorld('TimeWhereElectronPlatform'")
    && electronPreload.includes("ipcRenderer.invoke('timewhere-platform'")
    && electronPreload.includes('consumePendingNotificationClicks'));

assert('Desktop OAuth uses installed-app PKCE with bundled client metadata secret',
    desktopAuth.includes('541406150907')
    && desktopAuth.includes('0koum8v8mms5d4lrnhuavuh5b55hhben.apps.googleusercontent.com')
    && desktopAuth.includes(".join('-')")
    && desktopAuth.includes('DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET')
    && desktopAuth.includes("require('./desktop-oauth-secrets')")
    && !desktopAuth.includes(['GOC', 'SPX-'].join(''))
    && desktopAuth.includes('TIMEWHERE_GOOGLE_DESKTOP_CLIENT_ID')
    && desktopAuth.includes('net.fetch')
    && desktopAuth.includes('desktop_oauth_network_failed')
    && desktopAuth.includes('client_secret: credentials.clientSecret')
    && desktopAuth.includes('pkce_desktop_client_metadata_secret')
    && desktopAuth.includes('pkce_public_client_override')
    && desktopAuth.includes('code_challenge_method')
    && desktopAuth.includes('S256')
    && desktopAuth.includes('access_type')
    && desktopAuth.includes('safeStorage.encryptString')
    && desktopAuth.includes('refusing to save a plaintext refresh token'));
assert('Desktop package bundles generated OAuth secret module from ignored packaging input',
    electronPackage.scripts['prepackage:win'].includes('prepare-desktop-oauth-secret.ps1')
    && electronPackage.scripts['prepackage:mac'].includes('prepare-desktop-oauth-secret.ps1')
    && electronPackage.build.files.includes('desktop-oauth-secrets.js')
    && gitignore.includes('platforms/desktop-electron/desktop-oauth-secrets.js'));
assert('Chrome bridge is localhost nonce verified and one-shot',
    chromeBridge.includes('127.0.0.1')
    && chromeBridge.includes('nonce_mismatch')
    && chromeBridge.includes('extension_id_mismatch')
    && chromeBridge.includes('bridge_version_too_old')
    && chromeBridge.includes('chrome-extension://'));
assert('Extension bridge page sends only safe handshake fields',
    bridgeHtml.includes('TimeWhere Desktop Bridge')
    && bridgeJs.includes('timewhere.desktopBridge.hello')
    && bridgeJs.includes('extensionId: chrome.runtime.id')
    && bridgeJs.includes('version: manifest.version')
    && bridgeJs.includes('nonce')
    && !/(task|calendar|journal|token|cookie|password)/i.test(bridgeJs.replace('TimeWhere Desktop Bridge', '')));
assert('Settings contains desktop bridge card and non-dependency copy',
    settingsHtml.includes('desktopIntegrationSection')
    && settingsHtml.includes('连接 Chrome 控件')
    && settingsHtml.includes('Windows 版不依赖 Chrome 控件')
    && settingsHtml.includes('关闭到托盘 / 菜单栏')
    && !settingsHtml.includes('desktopMinimizeToTray')
    && settingsHtml.includes('desktopStartAtLogin')
    && settingsScript.includes('handleConnectDesktopBridge')
    && settingsScript.includes('isDesktopElectronPlatform')
    && settingsScript.includes('handleDesktopSystemSettingsChange')
    && settingsScript.includes('desktopSystemSettingsDefaults'));
assert('Desktop window controls keep native minimize and close-to-tray with Dock hiding',
    !electronMain.includes("mainWindow.on('minimize'")
    && electronMain.includes('closeToTray: true')
    && electronMain.includes("mainWindow.on('close'")
    && electronMain.includes('event.preventDefault();')
    && electronMain.includes('hideToTray(mainWindow);')
    && electronMain.includes('showWindow(mainWindow')
    && electronMain.includes('app.dock?.hide')
    && electronMain.includes('showWindow(win)')
    && electronMain.includes('.isMinimized()')
    && electronMain.includes('.restore()'));

assert('Manifest includes local bridge host permission for unpacked bridge testing',
    manifest.host_permissions.includes('ws://127.0.0.1/*')
    && manifest.web_accessible_resources?.some(entry => entry.resources?.includes('pages/**/*')));
assert('CWS packaging strips bridge-only local permission and bridge page until separately approved',
    cwsPackageScript.includes('ws://127.0.0.1/*')
    && cwsPackageScript.includes('pages\\desktop-bridge')
    && cwsPackageScript.includes('PSObject.Properties.Remove("key")'));

const directChromePattern = /chrome\.(tabs|notifications|alarms|identity|action|sidePanel|windows|runtime\.openOptionsPage|runtime\.sendMessage|runtime\.id|runtime\.getManifest)/g;
const remainingDirectChromeCalls = [];
for (const file of listFiles(path.join(root, 'extension'), ['.js'])) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (rel === 'extension/shared/js/platform.js') continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
        directChromePattern.lastIndex = 0;
        if (directChromePattern.test(line)) {
            remainingDirectChromeCalls.push(`${rel}:${index + 1}:${line.trim()}`);
        }
    });
}
const allowedRemainingChromeFiles = new Set([
    'extension/background.js',
    'extension/shared/js/managebac.js',
    'extension/pages/settings/script.js',
    'extension/popup/popup.js',
    'extension/pages/desktop-bridge/bridge.js'
]);
console.log('\nRemaining direct chrome.* calls outside platform adapter:');
remainingDirectChromeCalls.forEach(line => console.log(`  ${line}`));
assert('Remaining direct chrome.* calls are documented and limited to shell/relay/fallback files',
    remainingDirectChromeCalls.length > 0
    && remainingDirectChromeCalls.every(line => allowedRemainingChromeFiles.has(line.split(':')[0])));

if (failed > 0) {
    console.log(`\n${failed} platform boundary checks failed; ${passed} passed.`);
    process.exit(1);
}

console.log(`\nAll ${passed} platform boundary checks passed.`);
