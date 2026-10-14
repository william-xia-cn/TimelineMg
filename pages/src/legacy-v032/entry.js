import { renderLegacyAuthGate, shouldShowAuthGate } from './authGate.js';
import { createLegacyCloudRuntimeWithIdBridge } from './idBridge.js';
import { installLegacyWebPlatform } from './platformFacade.js';
import { installSettingsCloudUi } from './settingsCloudUi.js';
import { installExtensionImportUi } from './extensionImportUi.js';

function pageFromPathname(pathname = window.location.pathname) {
  if (/\/pages\/tasks\//.test(pathname)) return 'tasks';
  if (/\/pages\/calendar\//.test(pathname)) return 'calendar';
  if (/\/pages\/settings\//.test(pathname)) return 'settings';
  return 'dashboard';
}

const page = document.currentScript?.dataset?.timewherePage
  || document.querySelector('script[data-timewhere-page]')?.dataset?.timewherePage
  || pageFromPathname();

if (shouldShowAuthGate()) {
  await renderLegacyAuthGate({
    onAuthenticated: () => window.location.reload(),
    onDemo: () => window.location.reload()
  });
} else {
  const runtime = createLegacyCloudRuntimeWithIdBridge();
  globalThis.TimeWhereDB = runtime.facade;
  const platform = installLegacyWebPlatform(runtime);

  const sharedScripts = [
    'icons.js',
    'appearance.js',
    'scheduling.js',
    'reminders.js',
    'widget-snapshot.js',
    'desktop-reminders.js',
    'task-arrange-auto.js',
    'managebac.js',
    'external-links.js',
    'ics.js'
  ].map(name => `/legacy-v032/shared/js/${name}`);

  const pageScripts = {
    dashboard: ['/legacy-v032/pages/focus/script.js'],
    tasks: [
      '/legacy-v032/pages/tasks/state.js',
      '/legacy-v032/pages/tasks/board.js',
      '/legacy-v032/pages/tasks/sidebar.js',
      '/legacy-v032/pages/tasks/detail-panel.js',
      '/legacy-v032/pages/tasks/dialogs.js',
      '/legacy-v032/pages/tasks/script.js'
    ],
    calendar: ['/legacy-v032/pages/calendar/script.js'],
    settings: ['/legacy-v032/pages/settings/script.js']
  };

  function loadClassicScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`legacy_script_failed:${src}`));
      document.head.appendChild(script);
    });
  }

  function installNavigationGuards() {
    document.querySelectorAll('a.nav-item[href="#"]').forEach(link => {
      link.setAttribute('role', 'button');
      link.setAttribute('aria-label', '更多功能暂未开放');
      link.setAttribute('title', '更多功能暂未开放');
      link.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        platform.showToast('更多功能暂未开放', 'info');
      }, true);
    });
  }

  try {
    await runtime.refreshBootstrap();
  } catch (error) {
    console.warn('[TimeWhere Web] Cloud bootstrap deferred:', error.message);
  }

  for (const src of [...sharedScripts, ...(pageScripts[page] || pageScripts.dashboard)]) {
    await loadClassicScript(src);
  }

  installNavigationGuards();

  // The module entry waits for Cloud bootstrap before loading the frozen classic
  // controllers. By then the browser's native DOMContentLoaded may have fired,
  // so replay it once after every v0.3.2 listener has been registered.
  document.dispatchEvent(new Event('DOMContentLoaded'));

  if (page === 'settings') {
    installSettingsCloudUi(runtime, platform);
    installExtensionImportUi(runtime, platform);
  }

  window.setInterval(() => {
    runtime.pollWorkspaceReplacement()
      .then(replaced => {
        if (replaced) location.reload();
      })
      .catch(error => console.warn('[TimeWhere Cloud] replacement polling failed:', error.message));
  }, 60 * 1000);

  document.documentElement.dataset.timewhereWebReady = 'true';
  window.dispatchEvent(new CustomEvent('timewhere-web-ready', { detail: { page, baseline: 'v0.3.2' } }));
}