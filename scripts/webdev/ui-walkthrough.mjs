import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const workerPort = 8787;
const pagesPort = 4173;
const persistTo = `.wrangler/ui-walkthrough-state-${process.pid}-${Date.now()}`;
const sessionBearer = process.env.TIMEWHERE_LOCAL_SESSION_BEARER || 'timewhere-local-dev-session';

function command(name) {
  return name;
}

function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') reject(new Error(`Port ${port} is already in use. Stop the local WebDev service using it and retry.`));
      else reject(error);
    });
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function runPrepare() {
  execFileSync(command('npm'), ['run', 'webdev:local:prepare'], {
    cwd: rootDir,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TIMEWHERE_WRANGLER_PERSIST_TO: persistTo,
      TIMEWHERE_LOCAL_SESSION_BEARER: sessionBearer
    }
  });
}

function startProcess(label, commandName, args, cwd, extraEnv = {}) {
  const child = spawn(command(commandName), args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', ...extraEnv }
  });
  const logs = [];
  child.stdout.on('data', chunk => logs.push(String(chunk)));
  child.stderr.on('data', chunk => logs.push(String(chunk)));
  child.once('exit', code => {
    if (!child.stopping && code !== null && code !== 0) {
      console.error(`[${label}] exited with ${code}\n${logs.join('').slice(-4000)}`);
    }
  });
  child.logs = logs;
  child.label = label;
  return child;
}

async function stopProcess(child) {
  if (!child || child.killed) return;
  child.stopping = true;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      return;
    } catch {
      // Fall through to cross-platform kill.
    }
  }
  child.kill('SIGTERM');
}

async function waitForUrl(url, child, label) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < 60000) {
    if (child?.exitCode !== null) {
      throw new Error(`${label} exited early (${child.exitCode}). Logs:\n${child.logs.join('').slice(-4000)}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}: ${lastError?.message || 'unknown'}\n${child?.logs?.join('').slice(-4000) || ''}`);
}

async function visible(page, label, locator) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  console.log(`  PASS ${label}`);
}

async function requestWorker(method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${workerPort}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${sessionBearer}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status === 'error') {
    const detail = payload?.error ? `${payload.error.code}: ${payload.error.message}` : `HTTP ${response.status}`;
    throw new Error(`${method} ${pathname} failed: ${detail}`);
  }
  return payload.data;
}

async function main() {
  console.log('WebDev UI walkthrough');
  console.log('======================');
  await assertPortFree(workerPort);
  await assertPortFree(pagesPort);
  runPrepare();
  console.log('  PASS local D1 prepared for UI walkthrough');

  const worker = startProcess('worker', 'npx', [
    'wrangler',
    'dev',
    '--ip',
    '127.0.0.1',
    '--port',
    String(workerPort),
    '--local',
    '--local-protocol',
    'http',
    '--persist-to',
    persistTo,
    '--show-interactive-dev-session=false',
    '--log-level',
    'error'
  ], `${rootDir}/workers`, { TIMEWHERE_WRANGLER_PERSIST_TO: persistTo });

  const pages = startProcess('pages', 'npm', [
    '--prefix',
    'pages',
    'run',
    'dev',
    '--',
    '--host',
    '127.0.0.1',
    '--configLoader',
    'runner'
  ], rootDir);

  let browser;
  try {
    await waitForUrl(`http://127.0.0.1:${workerPort}/health`, worker, 'local Worker');
    console.log('  PASS local Worker ready');
    await waitForUrl(`http://127.0.0.1:${pagesPort}`, pages, 'local Pages dev server');
    console.log('  PASS local Pages ready');

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('pageerror', error => console.log('  BROWSER PAGE ERROR', error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) console.log('  BROWSER CONSOLE', message.type(), message.text()); });
    await page.goto(`http://127.0.0.1:${pagesPort}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(token => {
      window.localStorage.setItem('timewhere.web.session', JSON.stringify({
        token,
        expires_at: '2099-01-01T00:00:00.000Z',
        account: {
          id: 'acct_local_dev',
          name: 'Local Dev User',
          email: 'local-dev@example.invalid'
        }
      }));
    }, sessionBearer);
    await page.reload({ waitUntil: 'networkidle' });

    await visible(page, 'Dashboard uses original app layout', page.locator('.legacy-page-dashboard .app-layout'));
    await visible(page, 'Dashboard uses original multi-column board layout', page.locator('.board-layout .column-now'));
    await visible(page, 'Dashboard uses original calendar board column', page.locator('.board-layout .column-calendar'));
    await visible(page, 'Dashboard uses original week column', page.locator('.board-layout .column-week'));
    await visible(page, 'Dashboard uses original feed column', page.locator('.board-layout .column-feed'));

    await page.evaluate(() => { window.location.hash = '#tasks'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await visible(page, 'Tasks uses original context sidebar', page.locator('.legacy-page-tasks .context-sidebar'));
    await visible(page, 'Tasks uses original kanban board surface', page.locator('#kanbanBoard'));
    await visible(page, 'Tasks keeps original detail panel node', page.locator('#taskDetailPanel.task-detail-panel'));
    await visible(page, 'Tasks keeps legacy My Day control', page.locator('#navMyDay'));
    await visible(page, 'Tasks keeps legacy plan list', page.locator('#plansList'));
    await page.locator(".view-tabs .btn-tab[data-view='list']").click();
    await visible(page, 'Tasks legacy List view is available', page.locator('#taskListView'));
    await page.locator(".view-tabs .btn-tab[data-view='calendar']").click();
    await visible(page, 'Tasks legacy Calendar view is available', page.locator('#taskCalendarView'));
    await page.locator(".view-tabs .btn-tab[data-view='board']").click();
    await visible(page, 'Tasks view renders task cards', page.locator('#kanbanBoard .task-card').first());
    await page.locator('#kanbanBoard .task-card').first().click();
    await visible(page, 'Task detail opens from task card', page.locator('#taskDetailPanel .task-detail-content'));

    await page.locator('.sidebar .nav-item[title="日历"], .sidebar .nav-item[title="Calendar"]').first().click();
    await visible(page, 'Calendar uses original main content shell', page.locator('.legacy-page-calendar .main-content.rounded-container.glass-panel'));
    await visible(page, 'Calendar keeps legacy toolbar date', page.locator('#currentDate'));
    await visible(page, 'Calendar keeps legacy week view', page.locator('#weekView'));
    await page.locator('#viewSelector').click();
    await visible(page, 'Calendar legacy view dropdown opens', page.locator('#viewDropdown'));
    await page.locator('#viewDropdown [data-view="month"]').click();
    await visible(page, 'Calendar legacy month view is available', page.locator('#monthView'));
    await page.locator('#btnSearch').click();
    await visible(page, 'Calendar legacy search bar opens', page.locator('#searchBar #searchInput'));
    await page.locator('#searchClose').click();

    await page.locator('.sidebar-bottom .nav-item[title="设置"], .sidebar-bottom .nav-item[title="Settings"]').first().click();
    await visible(page, 'Settings uses original centered glass container', page.locator('.main-wrapper .settings-container'));
    await visible(page, 'Settings uses original header save action', page.locator('.settings-container .header .save-btn'));
    await visible(page, 'Settings uses original single-column setting rows', page.locator('.settings-container .content .section .settings-group .setting-row').first());
    await visible(page, 'Settings renders account Cloud section inside legacy settings container', page.locator('#webdevCloudSection'));
    await visible(page, 'Settings renders read cache cursor', page.getByText(/Read cache cursor:/));
    const incrementalTaskTitle = `UI incremental sync task ${process.pid}`;
    await requestWorker('POST', '/tasks', {
      title: incrementalTaskTitle,
      due_date: new Date().toISOString().slice(0, 10),
      priority: 'medium',
      notes: 'Created by local WebDev UI walkthrough.'
    });
    console.log('  PASS local Worker created Cloud task after Web App bootstrap');
    await page.getByRole('button', { name: '刷新变更' }).click();
    await visible(page, 'Settings refreshes read cache changes by cursor', page.getByText(/Applied \d+ updated, \d+ deleted, \d+ skipped Cloud changes/));
    await page.evaluate(() => { window.location.hash = '#tasks'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await visible(page, 'Tasks view receives incremental Cloud task from sync changes', page.locator('#kanbanBoard').getByText(incrementalTaskTitle).first());
    await page.locator('.sidebar-bottom .nav-item[title="设置"], .sidebar-bottom .nav-item[title="Settings"]').first().click();
    await visible(page, 'Settings keeps old General section', page.locator('#settingsView .section').first());
    await visible(page, 'Settings keeps old Calendar section', page.locator('#calendarSection'));
    await visible(page, 'Settings keeps old Plan section', page.locator('#planSection'));
    console.log('======================');
    console.log('All WebDev UI walkthrough checks passed.');
  } finally {
    if (browser) await browser.close();
    await Promise.allSettled([stopProcess(pages), stopProcess(worker)]);
  }
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});
