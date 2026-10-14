import { renderLegacyAuthGate, shouldShowAuthGate } from './authGate.js';

const view = (window.location.hash.slice(1).split('?')[0] || 'dashboard').toLowerCase();
const routes = {
  dashboard: '/legacy-v032/pages/focus/focus.html',
  focus: '/legacy-v032/pages/focus/focus.html',
  tasks: '/legacy-v032/pages/tasks/tasks.html',
  calendar: '/legacy-v032/pages/calendar/calendar.html',
  settings: '/legacy-v032/pages/settings/settings.html'
};

const targetUrl = (routes[view] || routes.dashboard) + window.location.search;

if (shouldShowAuthGate()) {
  renderLegacyAuthGate({
    onAuthenticated: () => window.location.replace(targetUrl),
    onDemo: () => window.location.replace(targetUrl)
  });
} else {
  window.location.replace(targetUrl);
}