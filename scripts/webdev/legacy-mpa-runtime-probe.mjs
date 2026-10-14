import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const workerPort = 8787;
const pagesPort = 4173;
const sessionBearer = process.env.TIMEWHERE_LOCAL_SESSION_BEARER || 'timewhere-local-dev-session';
const persistTo = `.wrangler/legacy-mpa-probe-${process.pid}-${Date.now()}`;
const evidenceDir = path.join(rootDir, '.tmp', 'webdev-legacy-mpa-probe');
const routes = {
  dashboard: '/legacy-v032/pages/focus/focus.html',
  tasks: '/legacy-v032/pages/tasks/tasks.html',
  calendar: '/legacy-v032/pages/calendar/calendar.html',
  settings: '/legacy-v032/pages/settings/settings.html'
};

function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function start(label, command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', ...env }
  });
  child.label = label;
  child.logs = [];
  child.stdout.on('data', chunk => child.logs.push(String(chunk)));
  child.stderr.on('data', chunk => child.logs.push(String(chunk)));
  return child;
}

async function stop(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      return;
    } catch {}
  }
  child.kill('SIGTERM');
}

async function waitFor(url, child) {
  const deadline = Date.now() + 60000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${child.label} exited (${child.exitCode})\n${child.logs.join('').slice(-5000)}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown'}`);
}

async function inspectRootEntry(context) {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${pagesPort}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => /\/legacy-v032\/pages\/focus\/focus(?:\.html)?$/.test(url.pathname), { timeout: 20000 });
  await page.locator('html[data-timewhere-web-ready="true"]').waitFor({ timeout: 20000 });
  await page.locator('.app-layout').waitFor({ state: 'visible', timeout: 20000 });
  await page.close();
  console.log('PASS root entry redirects through CSP-safe module to frozen Dashboard');
}

async function inspectPage(context, name, route) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  const response = await page.goto(`http://127.0.0.1:${pagesPort}${route}`, { waitUntil: 'domcontentloaded' });
  if (!response?.ok()) throw new Error(`${name} returned HTTP ${response?.status()}`);
  await page.locator('html[data-timewhere-web-ready="true"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);

  const report = await page.evaluate(pageName => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll('button,a,input,select,textarea')].map(element => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      class_name: typeof element.className === 'string' ? element.className : '',
      type: element.getAttribute('type'),
      text: (element.textContent || element.getAttribute('aria-label') || element.title || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      enabled: !element.disabled,
      visible: visible(element)
    }));
    const dashboard = pageName === 'dashboard' ? (() => {
      const board = document.querySelector('.board-layout');
      const columns = [...document.querySelectorAll('.board-layout > .board-column')];
      const boardRect = board?.getBoundingClientRect();
      return {
        client_width: board?.clientWidth || 0,
        scroll_width: board?.scrollWidth || 0,
        columns: columns.map(column => {
          const rect = column.getBoundingClientRect();
          return {
            class_name: column.className,
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            in_viewport: rect.left >= 0 && rect.right <= innerWidth + 1,
            in_board: !boardRect || (rect.left >= boardRect.left - 1 && rect.right <= boardRect.right + 1)
          };
        })
      };
    })() : null;
    return {
      title: document.title,
      ready: document.documentElement.dataset.timewhereWebReady,
      body_class: document.body.className,
      controls,
      dashboard
    };
  }, name);

  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${name}-2048x1210.png`), fullPage: true });
  await writeFile(path.join(evidenceDir, `${name}-controls.json`), JSON.stringify(report, null, 2));
  await page.close();
  return { ...report, errors };
}

async function main() {
  await Promise.all([assertPortFree(workerPort), assertPortFree(pagesPort)]);
  execFileSync('npm', ['run', 'webdev:local:prepare'], {
    cwd: rootDir,
    shell: process.platform === 'win32',
    stdio: 'pipe',
    env: { ...process.env, TIMEWHERE_WRANGLER_PERSIST_TO: persistTo, TIMEWHERE_LOCAL_SESSION_BEARER: sessionBearer }
  });

  const worker = start('worker', 'npx', [
    'wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(workerPort), '--local',
    '--local-protocol', 'http', '--persist-to', persistTo,
    '--show-interactive-dev-session=false', '--log-level', 'error'
  ], path.join(rootDir, 'workers'), { TIMEWHERE_WRANGLER_PERSIST_TO: persistTo });
  const pages = start('pages', 'npm', ['--prefix', 'pages', 'run', 'dev'], rootDir);
  let browser;
  try {
    await waitFor(`http://127.0.0.1:${workerPort}/health`, worker);
    await waitFor(`http://127.0.0.1:${pagesPort}`, pages);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 2048, height: 1210 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    await context.addInitScript(token => {
      localStorage.setItem('timewhere.web.session', JSON.stringify({
        token,
        expires_at: '2099-01-01T00:00:00.000Z',
        account: { id: 'acct_local_dev', name: 'Local Dev User', email: null }
      }));
    }, sessionBearer);

    await inspectRootEntry(context);

    const reports = {};
    for (const [name, route] of Object.entries(routes)) {
      reports[name] = await inspectPage(context, name, route);
      console.log(`PASS ${name}: ${reports[name].controls.length} controls, ${reports[name].errors.length} runtime errors`);
    }
    const dashboard = reports.dashboard.dashboard;
    if (dashboard.columns.length !== 4) throw new Error(`Dashboard expected 4 columns, found ${dashboard.columns.length}`);
    if (dashboard.scroll_width > dashboard.client_width + 1) throw new Error(`Dashboard has horizontal overflow (${dashboard.scroll_width} > ${dashboard.client_width})`);
    if (dashboard.columns.some(column => !column.in_viewport || !column.in_board)) throw new Error('Dashboard has a column outside the first viewport.');
    const runtimeErrors = Object.entries(reports).flatMap(([name, report]) => report.errors.map(error => `${name}: ${error}`));
    if (runtimeErrors.length) throw new Error(`Legacy MPA runtime errors:\n${runtimeErrors.join('\n')}`);
    console.log(`Evidence: ${evidenceDir}`);
  } finally {
    if (browser) await browser.close();
    await Promise.allSettled([stop(pages), stop(worker)]);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
