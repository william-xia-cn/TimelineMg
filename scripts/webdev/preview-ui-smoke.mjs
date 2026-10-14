import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const localStateDir = path.join(root, '.wrangler');
const resourcesPath = path.join(localStateDir, 'timewhere-cloudflare-resources.local.json');
const deploymentStatePath = path.join(localStateDir, 'timewhere-preview-deployment.local.json');
const generatedConfigPath = path.join(localStateDir, 'timewhere-webdev.generated.wrangler.toml');
const wranglerBinPath = path.join(root, 'workers', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const tokenEnvName = 'CLOUDFLARE_' + 'API_' + 'TOKEN';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sanitize(text) {
  const token = process.env[tokenEnvName] || '';
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text || '')
    .replaceAll(root, '<workspace>')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<uuid>')
    .replace(/[a-f0-9]{32,}/gi, '<hex-id>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/[A-Za-z]:\\Users\\[^\\\r\n"]+/g, '<user-home>')
    .replace(new RegExp(escapedToken || '___NO_TOKEN___', 'g'), '<token>');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    shell: false
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${sanitize(output)}`);
  }
  return { ok: result.status === 0, output, sanitizedOutput: sanitize(output) };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isRetryableWranglerFailure(output) {
  return /Authentication error\s+\[code:\s*10000\]|A request to the Cloudflare API .* failed|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(String(output || ''));
}

function runWrangler(args, options = {}) {
  const attempts = options.allowFailure ? 1 : (options.attempts || 4);
  let lastResult = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = run(process.execPath, [wranglerBinPath, ...args], { ...options, allowFailure: true });
    if (result.ok || options.allowFailure) return result;
    lastResult = result;
    if (!isRetryableWranglerFailure(result.output) || attempt === attempts) break;
    console.warn(`  WARN Wrangler transient failure, retrying ${attempt}/${attempts - 1}...`);
    sleep(1000 * attempt);
  }
  throw new Error(`${process.execPath} ${[wranglerBinPath, ...args].join(' ')} failed:\n${lastResult?.sanitizedOutput || ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLocalState() {
  assert(fs.existsSync(resourcesPath), 'Missing local Cloudflare resource state. Run npm run webdev:cloudflare:provision first.');
  assert(fs.existsSync(deploymentStatePath), 'Missing local preview deployment state. Run npm run webdev:preview:deploy first.');
  assert(fs.existsSync(generatedConfigPath), 'Missing generated wrangler config. Run npm run webdev:cloudflare:provision first.');
  assert(fs.existsSync(wranglerBinPath), 'Missing local Wrangler dependency. Run npm --prefix workers install first.');
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function d1(command, options = {}) {
  return runWrangler([
    'd1',
    'execute',
    'DB',
    '--remote',
    '--config',
    generatedConfigPath,
    '--env',
    'preview',
    '--command',
    command
  ], options);
}

function cleanupSmokeAccounts(options = {}) {
  const smokeAccountWhere = "account_id IN (SELECT id FROM accounts WHERE google_sub LIKE 'preview-ui-smoke-%')";
  const statements = [
    `DELETE FROM sync_mutation_outcomes WHERE ${smokeAccountWhere};`,
    `DELETE FROM sync_conflicts WHERE ${smokeAccountWhere};`,
    `DELETE FROM sync_changes WHERE ${smokeAccountWhere};`,
    `DELETE FROM migration_conflicts WHERE ${smokeAccountWhere};`,
    `DELETE FROM migration_runs WHERE ${smokeAccountWhere};`,
    `DELETE FROM product_settings WHERE ${smokeAccountWhere};`,
    `DELETE FROM tasks WHERE ${smokeAccountWhere};`,
    `DELETE FROM calendar_events WHERE ${smokeAccountWhere};`,
    `DELETE FROM containers WHERE ${smokeAccountWhere};`,
    `DELETE FROM labels WHERE ${smokeAccountWhere};`,
    `DELETE FROM buckets WHERE ${smokeAccountWhere};`,
    `DELETE FROM plans WHERE ${smokeAccountWhere};`,
    `DELETE FROM account_sessions WHERE ${smokeAccountWhere};`,
    `DELETE FROM user_profiles WHERE ${smokeAccountWhere};`,
    "DELETE FROM accounts WHERE google_sub LIKE 'preview-ui-smoke-%';"
  ];
  for (const statement of statements) d1(statement, options);
}

function createSmokeSession() {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const stamp = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const accountId = `acct_ui_smoke_${stamp}`;
  const profileId = `profile_ui_smoke_${stamp}`;
  const sessionId = `sess_ui_smoke_${stamp}`;
  const token = `${sessionId}.${crypto.randomUUID().replace(/-/g, '')}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  d1(
    `INSERT INTO accounts (id, google_sub, email, display_name, picture_url, created_at, updated_at) VALUES (` +
    [accountId, `preview-ui-smoke-${stamp}`, null, 'Preview UI Smoke Account', null, now, now].map(sqlValue).join(', ') +
    ');'
  );
  d1(
    `INSERT INTO user_profiles (id, account_id, name, created_at, updated_at) VALUES (` +
    [profileId, accountId, 'Preview UI Smoke Workspace', now, now].map(sqlValue).join(', ') +
    ');'
  );
  d1(
    `INSERT INTO account_sessions (id, account_id, token_hash, created_at, expires_at) VALUES (` +
    [sessionId, accountId, tokenHash, now, expiresAt].map(sqlValue).join(', ') +
    ');'
  );
  return { accountId, token, expiresAt };
}

async function fetchWithPowerShell(url, { method = 'GET', token, body } = {}) {
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    [
      "$ErrorActionPreference='Stop'",
      '$headers = @{}',
      "if ($env:TIMEWHERE_PREVIEW_AUTH) { $headers['Authorization'] = ('Bearer ' + $env:TIMEWHERE_PREVIEW_AUTH) }",
      "$params = @{ Uri = $env:TIMEWHERE_PREVIEW_URL; Method = $env:TIMEWHERE_PREVIEW_METHOD; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 45 }",
      "if ($env:TIMEWHERE_PREVIEW_BODY) { $headers['Content-Type'] = 'application/json'; $params['Body'] = $env:TIMEWHERE_PREVIEW_BODY }",
      '$r = Invoke-WebRequest @params',
      '[pscustomobject]@{ status = [int]$r.StatusCode; content = [string]$r.Content } | ConvertTo-Json -Compress'
    ].join('; ')
  ], {
    cwd: root,
    env: {
      ...process.env,
      TIMEWHERE_PREVIEW_URL: url,
      TIMEWHERE_PREVIEW_METHOD: method,
      TIMEWHERE_PREVIEW_AUTH: token || '',
      TIMEWHERE_PREVIEW_BODY: body ? JSON.stringify(body) : ''
    },
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(sanitize(result.stderr || result.stdout || `PowerShell request failed for ${url}`));
  }
  const payload = JSON.parse(result.stdout);
  return {
    ok: payload.status >= 200 && payload.status < 300,
    status: payload.status,
    text: async () => payload.content
  };
}

async function requestJson(workerUrl, token, method, pathName, body) {
  const url = `${workerUrl}${pathName}`;
  const response = process.platform === 'win32'
    ? await fetchWithPowerShell(url, { method, token, body })
    : await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Keep null for structured failure below.
  }
  assert(response.ok, `${method} ${pathName} returned HTTP ${response.status}: ${sanitize(text).slice(0, 500)}`);
  assert(json?.status === 'ok', `${method} ${pathName} did not return ok envelope.`);
  return json.data;
}

async function visible(page, label, locator) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  console.log(`  PASS ${label}`);
}

async function waitForTaskState(page, title, label) {
  try {
    await page.waitForFunction(
      expectedTitle => globalThis.TaskApp?.currentPlanTasks?.some(task => task.title === expectedTitle),
      title,
      { timeout: 60000 }
    );
  } catch (error) {
    const report = await page.evaluate(() => ({
      href: location.href,
      ready: document.documentElement.dataset.timewhereWebReady || null,
      view_mode: globalThis.TaskApp?.viewMode || null,
      task_count: globalThis.TaskApp?.currentPlanTasks?.length ?? null,
      task_titles: (globalThis.TaskApp?.currentPlanTasks || []).slice(0, 10).map(task => task.title),
      board_text: document.getElementById('kanbanBoard')?.textContent?.trim().slice(0, 500) || null
    }));
    throw new Error(label + ' did not enter the frozen controller state: ' + JSON.stringify(report), { cause: error });
  }
  console.log('  PASS ' + label);
}

async function assertMoreStaysOnPage(page, label) {
  const beforeHash = await page.evaluate(() => window.location.hash);
  const moreLink = page.locator('.sidebar .nav-item[aria-label="更多功能暂未开放"]').first();
  await moreLink.click();
  const toast = page.locator('.toast');
  await toast.waitFor({ state: 'visible', timeout: 5000 });
  const afterHash = await page.evaluate(() => window.location.hash);
  if (afterHash !== beforeHash) throw new Error(`${label} changed route from ${beforeHash} to ${afterHash}.`);
  if ((await toast.textContent())?.trim() !== '更多功能暂未开放') throw new Error(`${label} did not show the expected notice.`);
  await toast.evaluate(element => element.remove());
  console.log(`  PASS ${label}`);
}

async function assertSettingsButtonsReadable(page, label) {
  const report = await page.evaluate(() => {
    const root = document.body;
    const isVisible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const buttons = [...root.querySelectorAll('button')].filter(isVisible);
    const blank = buttons.filter(button => !button.textContent.trim() && !button.querySelector('svg')).map(button => button.id || button.className || 'button');
    const contrastIds = ['manageContainersBtn', 'importMatrixViewBtn', 'uploadGoogleSyncBtn', 'legacySignOutBtn'];
    const noContrast = contrastIds.filter(id => {
      const button = root.querySelector(`#${id}`);
      if (!button || !isVisible(button)) return false;
      const style = getComputedStyle(button);
      return style.color === style.backgroundColor;
    });
    return { blank, noContrast };
  });
  if (report.blank.length) throw new Error(`${label} has blank buttons: ${report.blank.join(', ')}`);
  if (report.noContrast.length) throw new Error(`${label} has unreadable button colors: ${report.noContrast.join(', ')}`);
  console.log(`  PASS ${label}`);
}

async function main() {
  console.log('WebDev preview UI smoke');
  console.log('=======================');

  const auth = runWrangler(['whoami'], { allowFailure: true });
  if (!auth.ok) {
    console.error(`Cloudflare auth is not available. Set ${tokenEnvName} in your shell or run wrangler login, then retry.`);
    process.exit(2);
  }

  requireLocalState();
  const resources = readJson(resourcesPath);
  const deployment = readJson(deploymentStatePath);
  const preview = resources.environments?.preview;
  assert(preview?.timewhere_env === 'preview', 'Local Cloudflare resource state does not contain preview resources.');
  assert(preview.worker_name === 'timewhere-preview-api', 'Preview UI smoke refuses to run against a non-preview Worker.');
  assert(preview.pages_project === 'timewhere-preview-web', 'Preview UI smoke refuses to run against a non-preview Pages project.');

  const workerUrl = String(deployment.worker_url || '').replace(/\/$/, '');
  const pagesUrl = String(deployment.pages_urls?.[0] || `https://${preview.pages_project}.pages.dev`).replace(/\/$/, '');
  assert(workerUrl.includes('timewhere-preview-api'), 'Preview UI smoke refuses to run against a non-preview Worker URL.');
  assert(pagesUrl.includes('timewhere-preview-web.pages.dev'), 'Preview UI smoke refuses to run against a non-preview stable Pages URL.');

  let browser = null;
  let primaryError = null;
  try {
    cleanupSmokeAccounts();
    const session = createSmokeSession();
    console.log('  PASS temporary preview UI smoke session created');

    const plan = (await requestJson(workerUrl, session.token, 'POST', '/plans', {
      name: 'Preview UI Smoke Plan',
      color: '#2563eb',
      sort_order: 1
    })).plan;
    const bucket = (await requestJson(workerUrl, session.token, 'POST', '/buckets', {
      plan_id: plan.id,
      name: 'Preview UI Smoke Bucket',
      color: '#047857',
      sort_order: 1
    })).bucket;
    const container = (await requestJson(workerUrl, session.token, 'POST', '/containers', {
      name: 'Preview UI Smoke Container',
      time_start: '09:00',
      time_end: '11:00',
      repeat: 'daily',
      days: [],
      enabled: true
    })).container;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    const taskTitle = `Preview UI Smoke Task ${Date.now()}`;
    await requestJson(workerUrl, session.token, 'POST', '/tasks', {
      plan_id: plan.id,
      bucket_id: bucket.id,
      title: taskTitle,
      due_date: today,
      schedule_time: '09:30',
      duration: 25,
      priority: 'important'
    });
    const eventTitle = `Preview UI Smoke Event ${Date.now()}`;
    await requestJson(workerUrl, session.token, 'POST', '/calendar/events', {
      container_id: container.id,
      title: eventTitle,
      date: today,
      time_start: '09:00',
      time_end: '09:30',
      payload: { repeat: 'none' }
    });
    console.log('  PASS preview UI smoke data seeded through Worker API');

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 2048, height: 1210 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai'
    });
    await context.addInitScript(({ token, expiresAt }) => {
      window.localStorage.setItem('timewhere.web.session', JSON.stringify({
        token,
        expires_at: expiresAt,
        account: { id: 'preview-ui-smoke-account', name: 'Preview UI Smoke Account' },
        profile: { name: 'Preview UI Smoke Workspace' }
      }));
    }, { token: session.token, expiresAt: session.expiresAt });
    const page = await context.newPage();
    page.on('pageerror', error => console.warn('  WARN browser page error: ' + sanitize(error.message)));
    page.on('console', message => {
      if (message.type() === 'error') console.warn('  WARN browser console error: ' + sanitize(message.text()));
    });
    await page.goto(pagesUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await page.waitForURL(url => /\/legacy-v032\/pages\/focus\/focus(?:\.html)?$/.test(url.pathname), { timeout: 30000 });
    await page.locator('html[data-timewhere-web-ready="true"]').waitFor({ timeout: 30000 });

    await visible(page, 'Preview Dashboard uses original app layout', page.locator('.app-layout'));
    await visible(page, 'Preview Dashboard uses original multi-column board layout', page.locator('.board-layout .column-now'));
    await visible(page, 'Preview Dashboard uses original calendar board column', page.locator('.board-layout .column-calendar'));
    await visible(page, 'Preview Dashboard uses original week column', page.locator('.board-layout .column-week'));
    await visible(page, 'Preview Dashboard uses original feed column', page.locator('.board-layout .column-feed'));
    await assertMoreStaysOnPage(page, 'Preview Dashboard More stays on Dashboard and shows notice');

    await page.locator('.sidebar .nav-item[title="任务"], .sidebar .nav-item[title="Tasks"]').first().click();
    await visible(page, 'Preview Tasks uses original context sidebar', page.locator('.context-sidebar'));
    await visible(page, 'Preview Tasks uses original kanban board surface', page.locator('#kanbanBoard'));
    await visible(page, 'Preview Tasks keeps original detail panel node', page.locator('#taskDetailPanel.task-detail-panel'));
    await visible(page, 'Preview Tasks keeps legacy My Day control', page.locator('#navMyDay'));
    await page.locator('#plansList').waitFor({ state: 'attached', timeout: 15000 });
    console.log('  PASS Preview Tasks keeps legacy plan list node');
    await assertMoreStaysOnPage(page, 'Preview Tasks More stays on Tasks and shows notice');
    await waitForTaskState(page, taskTitle, 'Preview Tasks receives Cloud task in controller state');
    await visible(page, 'Preview Tasks renders Cloud task', page.locator('#kanbanBoard').getByText(taskTitle).first());
    await page.locator(".view-tabs .btn-tab[data-view='list']").click();
    await visible(page, 'Preview Tasks legacy List view is available', page.locator('#taskListView'));
    await page.locator(".view-tabs .btn-tab[data-view='calendar']").click();
    await visible(page, 'Preview Tasks legacy Calendar view is available', page.locator('#taskCalendarView'));
    await page.locator(".view-tabs .btn-tab[data-view='board']").click();
    await page.locator('#kanbanBoard').getByText(taskTitle).first().click();
    await visible(page, 'Preview Task detail opens from legacy task card', page.locator('#taskDetailPanel .detail-header'));

    await page.locator('.sidebar .nav-item[title="日历"], .sidebar .nav-item[title="Calendar"]').first().click();
    await visible(page, 'Preview Calendar uses original main content shell', page.locator('.main-content.rounded-container.glass-panel'));
    await visible(page, 'Preview Calendar keeps legacy toolbar date', page.locator('#currentDate'));
    await visible(page, 'Preview Calendar keeps legacy week view', page.locator('#weekView'));
    await assertMoreStaysOnPage(page, 'Preview Calendar More stays on Calendar and shows notice');
    await visible(page, 'Preview Calendar receives Cloud event', page.getByText(eventTitle).first());
    await page.locator('#viewSelector').click();
    await visible(page, 'Preview Calendar legacy view dropdown opens', page.locator('#viewDropdown'));
    await page.locator('#viewDropdown [data-view="month"]').click();
    await visible(page, 'Preview Calendar legacy month view is available', page.locator('#monthView'));
    await page.locator('#btnSearch').click();
    await visible(page, 'Preview Calendar legacy search bar opens', page.locator('#searchBar #searchInput'));
    await page.locator('#searchClose').click();

    await page.locator('.sidebar-bottom .nav-item[title="设置"], .sidebar-bottom .nav-item[title="Settings"]').first().click();
    await visible(page, 'Preview Settings uses original centered glass container', page.locator('.main-wrapper .settings-container'));
    await visible(page, 'Preview Settings uses original header save action', page.locator('.settings-container .header .save-btn'));
    await visible(page, 'Preview Settings uses original single-column setting rows', page.locator('.settings-container .content .section .settings-group .setting-row').first());
    await visible(page, 'Preview Settings renders account Cloud section inside legacy settings container', page.locator('#googleSyncSection'));
    await visible(page, 'Preview Settings renders read cache cursor', page.locator('#googleSyncLastSyncAt'));
    await assertMoreStaysOnPage(page, 'Preview Settings More stays on Settings and shows notice');
    await assertSettingsButtonsReadable(page, 'Preview Settings visible buttons keep readable text and contrast');
    await visible(page, 'Preview Settings keeps old General section', page.locator('#settingsView .section').first());
    await visible(page, 'Preview Settings keeps old Calendar section', page.locator('#calendarSection'));
    await visible(page, 'Preview Settings keeps old Plan section', page.locator('#planSection'));
    console.log('=======================');
    console.log('All WebDev preview UI smoke checks passed.');
    console.log('No prod resources were touched; no Google session, token, account email, or Cloudflare id was printed.');
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (browser) await browser.close();
    try {
      cleanupSmokeAccounts();
    } catch (cleanupError) {
      if (!primaryError) throw cleanupError;
      console.error(`Cleanup failed after primary error: ${sanitize(cleanupError?.message || cleanupError)}`);
    }
  }
}

main().catch(error => {
  console.error(sanitize(error?.stack || error?.message || error));
  process.exit(1);
});
