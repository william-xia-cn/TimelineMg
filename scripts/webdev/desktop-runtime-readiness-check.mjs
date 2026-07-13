import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const requiredFiles = [
  'platforms/desktop-electron/main.js',
  'platforms/desktop-electron/preload.js',
  'platforms/desktop-electron/README.md',
  'scripts/webdev/desktop-runtime-smoke.mjs',
  'docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md',
  'docs/WEBDEV_COMPLETION_CHECKLIST.md',
  'docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md',
  'docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md',
  'docs/WEBDEV_PROD_READINESS_CHECKLIST.md',
  'package.json'
];

let passed = 0;
let failed = 0;

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(description, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${description}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${description}`);
}

console.log('WebDev Desktop Runtime readiness static check');
console.log('=============================================');

for (const file of requiredFiles) {
  assert(`${file} exists`, exists(file));
}

const main = exists('platforms/desktop-electron/main.js') ? read('platforms/desktop-electron/main.js') : '';
const preload = exists('platforms/desktop-electron/preload.js') ? read('platforms/desktop-electron/preload.js') : '';
const desktopReadme = exists('platforms/desktop-electron/README.md') ? read('platforms/desktop-electron/README.md') : '';
const desktopSmoke = exists('scripts/webdev/desktop-runtime-smoke.mjs') ? read('scripts/webdev/desktop-runtime-smoke.mjs') : '';
const gateEPacket = exists('docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md') ? read('docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md') : '';
const completionChecklist = exists('docs/WEBDEV_COMPLETION_CHECKLIST.md') ? read('docs/WEBDEV_COMPLETION_CHECKLIST.md') : '';
const parityChecklist = exists('docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md') ? read('docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md') : '';
const previewRunbook = exists('docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md') ? read('docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md') : '';
const prodReadiness = exists('docs/WEBDEV_PROD_READINESS_CHECKLIST.md') ? read('docs/WEBDEV_PROD_READINESS_CHECKLIST.md') : '';
const packageJson = exists('package.json') ? JSON.parse(read('package.json')) : { scripts: {} };

assert('root package exposes Desktop Runtime readiness and smoke scripts',
  packageJson.scripts?.['webdev:desktop:readiness'] === 'node scripts/webdev/desktop-runtime-readiness-check.mjs'
    && packageJson.scripts?.['webdev:desktop:smoke'] === 'node scripts/webdev/desktop-runtime-smoke.mjs');

assert('Desktop WebDev runtime mode is opt-in and route based',
  main.includes('TIMEWHERE_DESKTOP_RUNTIME_MODE')
    && main.includes('TIMEWHERE_WEB_APP_URL')
    && main.includes('TIMEWHERE_WEBDEV_APP_URL')
    && main.includes('function isWebDevRuntimeMode()')
    && main.includes('function resolveWebAppRoute')
    && main.includes("mode: isWebDevRuntimeMode() ? 'webdev' : 'extension_legacy'")
    && main.includes("business_logic_owner: isWebDevRuntimeMode() ? 'web_app' : 'extension_legacy'"));

assert('Desktop WebDev runtime guards non-Web-App navigation',
  main.includes('function installWebDevNavigationGuards')
    && main.includes('if (!isWebDevRuntimeMode()) return')
    && main.includes('isAllowedWebAppNavigation(url)')
    && main.includes('External routes are not allowed in the desktop WebDev runtime shell')
    && main.includes('url.hash = view'));

assert('Desktop preload exposes native bridge only',
  preload.includes("contextBridge.exposeInMainWorld('TimeWhereElectronPlatform'")
    && preload.includes("ipcRenderer.invoke('timewhere-platform'")
    && preload.includes('onNotificationClick')
    && preload.includes('onNotificationClose')
    && preload.includes('onWindowActivated')
    && !preload.includes('tasks')
    && !preload.includes('calendar')
    && !preload.includes('migration'));

assert('Desktop Runtime smoke is local-only and packaging-free',
  desktopSmoke.includes('TIMEWHERE_DESKTOP_RUNTIME_MODE')
    && desktopSmoke.includes('TIMEWHERE_WEB_APP_URL')
    && desktopSmoke.includes('webdev:local:prepare')
    && desktopSmoke.includes('Electron loaded WebDev Runtime mode')
    && !desktopSmoke.includes('package:win')
    && !desktopSmoke.includes('package:mac')
    && !desktopSmoke.includes('electron-builder'));

assert('Desktop docs keep Gate E packaging and distribution out of readiness',
  completionChecklist.includes('Gate E')
    && completionChecklist.includes('WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md')
    && completionChecklist.includes('webdev:desktop:readiness')
    && completionChecklist.includes('不生成安装包')
    && parityChecklist.includes('Desktop Runtime')
    && parityChecklist.includes('Gate E required')
    && previewRunbook.includes('Desktop Runtime Preview Smoke')
    && previewRunbook.includes('不生成安装包')
    && prodReadiness.includes('Desktop Runtime Readiness')
    && prodReadiness.includes('Gate E 未批准前只做 readiness'));

assert('Gate E packet is approval-only and does not approve desktop package or signing',
  gateEPacket.includes('Gate E readiness packet')
    && gateEPacket.includes('不批准、不开启、不执行 Desktop internal package')
    && gateEPacket.includes('不签名、不公证、不 staple')
    && gateEPacket.includes('Desktop preload 不暴露 Task / Calendar / Migration 业务 API')
    && gateEPacket.includes('npm.cmd run webdev:desktop:readiness'));

assert('Desktop README documents WebDev runtime mode and smoke boundary',
  desktopReadme.includes('TIMEWHERE_DESKTOP_RUNTIME_MODE')
    && desktopReadme.includes('TIMEWHERE_WEB_APP_URL')
    && desktopReadme.includes('npm run webdev:desktop:smoke')
    && desktopReadme.includes('does not create a desktop package, sign, notarize, or distribute anything'));

if (failed > 0) {
  console.error(`\n${failed} WebDev Desktop Runtime readiness checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log('=============================================');
console.log(`All ${passed} WebDev Desktop Runtime readiness checks passed.`);
console.log('This is readiness evidence only. No desktop package was built, signed, notarized, or distributed.');
