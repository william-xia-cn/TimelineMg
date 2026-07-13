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
    '127.0.0.1'
  ], rootDir);

  let browser;
  try {
    await waitForUrl(`http://127.0.0.1:${workerPort}/health`, worker, 'local Worker');
    console.log('  PASS local Worker ready');
    await waitForUrl(`http://127.0.0.1:${pagesPort}`, pages, 'local Pages dev server');
    console.log('  PASS local Pages ready');

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
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

    await visible(page, 'Dashboard renders current projection', page.getByText('Today projection'));
    await visible(page, 'Dashboard renders reminder state', page.getByText('Reminder state'));
    await visible(page, 'Dashboard renders projected current work', page.getByText('Projected current work'));

    await page.getByRole('button', { name: /Tasks/ }).click();
    await visible(page, 'Tasks view renders task list', page.getByText('Current work'));
    await page.getByText('Read migration design').click();
    await visible(page, 'Task detail opens from task list', page.getByText('Save task detail'));

    await page.getByRole('button', { name: /Calendar/ }).click();
    await visible(page, 'Calendar renders date projection', page.getByText('Date projection', { exact: true }));
    await visible(page, 'Calendar renders event list', page.getByText('Calendar events', { exact: true }));
    await page.getByRole('button', { name: /Planning block/ }).click();
    await visible(page, 'Calendar event detail opens', page.getByText('Save calendar event detail'));

    await page.getByRole('button', { name: /Settings/ }).click();
    await visible(page, 'Settings renders account panel', page.getByText('Cloud session', { exact: true }));
    await visible(page, 'Settings renders read cache cursor', page.getByText(/Read cache cursor:/));
    const incrementalTaskTitle = `UI incremental sync task ${process.pid}`;
    await requestWorker('POST', '/tasks', {
      title: incrementalTaskTitle,
      due_date: new Date().toISOString().slice(0, 10),
      priority: 'medium',
      notes: 'Created by local WebDev UI walkthrough.'
    });
    console.log('  PASS local Worker created Cloud task after Web App bootstrap');
    await page.getByRole('button', { name: 'Refresh changes' }).click();
    await visible(page, 'Settings refreshes read cache changes by cursor', page.getByText(/Applied \d+ updated, \d+ deleted, \d+ skipped Cloud changes/));
    await page.getByRole('button', { name: /Tasks/ }).click();
    await visible(page, 'Tasks view receives incremental Cloud task from sync changes', page.getByText(incrementalTaskTitle));
    await page.getByRole('button', { name: /Settings/ }).click();
    await visible(page, 'Settings renders expanded preferences', page.getByText('Arrange trigger', { exact: true }));
    await visible(page, 'Settings renders migration panel', page.getByText('Automatic migration', { exact: true }));
    await visible(page, 'Settings renders pending queue panel', page.getByText('Pending Task queue', { exact: true }));
    await visible(page, 'Settings renders sync conflict panel', page.getByText('Task sync conflicts', { exact: true }));
    await visible(page, 'Settings renders structure editor', page.getByText('Structure', { exact: true }));
    await page.getByTitle('Edit container').first().click();
    await visible(page, 'Structure detail opens for container', page.getByText('Container detail'));

    console.log('======================');
    console.log('All WebDev UI walkthrough checks passed.');
  } finally {
    if (browser) await browser.close();
    await Promise.allSettled([stopProcess(pages), stopProcess(worker)]);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
