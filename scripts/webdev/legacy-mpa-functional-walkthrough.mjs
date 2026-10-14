import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const workerPort = 8787;
const pagesPort = 4173;
const sessionBearer = process.env.TIMEWHERE_LOCAL_SESSION_BEARER || 'timewhere-local-dev-session';
const persistTo = `.wrangler/legacy-mpa-functional-${process.pid}-${Date.now()}`;
const baseUrl = `http://127.0.0.1:${pagesPort}/legacy-v032/pages`;

function portFree(port) {
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
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${child.label} exited (${child.exitCode})\n${child.logs.join('').slice(-5000)}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function workerRequest(method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${workerPort}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${sessionBearer}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status === 'error') {
    throw new Error(`${method} ${pathname}: ${payload?.error?.code || response.status} ${payload?.error?.message || ''}`);
  }
  return payload.data;
}

async function waitForWorker(pathname, predicate, label) {
  let last;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    last = await workerRequest('GET', pathname);
    if (predicate(last)) return last;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`${label} did not reach the expected Cloud state.`);
}

async function open(context, route) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${baseUrl}/${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('html[data-timewhere-web-ready="true"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  page.runtimeErrors = errors;
  return page;
}

async function expectVisible(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  console.log(`PASS ${label}`);
}

async function checkMore(page, label) {
  const before = page.url();
  await page.locator('a.nav-item[aria-label="更多功能暂未开放"]').click();
  await expectVisible(page.locator('.toast').filter({ hasText: '更多功能暂未开放' }), `${label} More toast`);
  if (page.url() !== before) throw new Error(`${label} More changed route.`);
}

async function main() {
  await Promise.all([portFree(workerPort), portFree(pagesPort)]);
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
  const openedPages = [];
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

    const dashboard = await open(context, 'focus/focus.html');
    openedPages.push(dashboard);
    await expectVisible(dashboard.locator('.board-layout > .column-feed'), 'Dashboard original feed column');
    await checkMore(dashboard, 'Dashboard');

    const tasks = await open(context, 'tasks/tasks.html');
    openedPages.push(tasks);
    await expectVisible(tasks.locator('#kanbanBoard'), 'Tasks original Board');
    await tasks.locator('.view-tabs .btn-tab[data-view="list"]').click();
    await expectVisible(tasks.locator('#taskListView'), 'Tasks original List');
    await tasks.locator('.view-tabs .btn-tab[data-view="calendar"]').click();
    await expectVisible(tasks.locator('#taskCalendarView'), 'Tasks original Calendar');
    await tasks.locator('.view-tabs .btn-tab[data-view="board"]').click();
    await checkMore(tasks, 'Tasks');

    const planName = `Legacy MPA Plan ${process.pid}`;
    await tasks.locator('#btnCreatePlan').click();
    await expectVisible(tasks.locator('#modalOverlay.open .dialog'), 'Tasks create Plan dialog');
    await tasks.locator('#dialogPlanName').fill(planName);
    await tasks.locator('#modalOverlay .btn-dialog-confirm').click();
    await expectVisible(tasks.locator('#plansList').getByText(planName), 'Tasks Plan persisted');

    const taskTitle = `Legacy MPA Task ${process.pid}`;
    await tasks.locator('#kanbanBoard .col-add-task').first().click();
    await expectVisible(tasks.locator('#kanbanBoard .quick-add-form'), 'Tasks original inline quick-add form');
    await tasks.locator('#kanbanBoard .quick-add-title').fill(taskTitle);
    const dueDate = tasks.locator('#kanbanBoard .quick-add-form [data-field="due_date"]');
    if (await dueDate.count()) await dueDate.fill(new Date().toISOString().slice(0, 10));
    await tasks.locator('#kanbanBoard .quick-add-submit').click();
    await expectVisible(tasks.locator('#kanbanBoard').getByText(taskTitle).first(), 'Tasks task persisted');
    const cloudTasks = await workerRequest('GET', '/tasks?include_completed=true');
    if (!cloudTasks.tasks.some(task => task.title === taskTitle)) throw new Error('Task UI did not persist to Cloud.');
    console.log('PASS Task CRUD reaches Cloud repository');

    await tasks.locator('#kanbanBoard').getByText(taskTitle).first().click();
    await expectVisible(tasks.locator('#taskDetailPanel'), 'Tasks detail panel');
    await expectVisible(tasks.locator('#taskDetailPanel .checklist-add-input'), 'Tasks detail original checklist control');

    const calendar = await open(context, 'calendar/calendar.html');
    openedPages.push(calendar);
    await expectVisible(calendar.locator('#weekView'), 'Calendar original week view');
    await calendar.locator('#viewSelector').click();
    await calendar.locator('#viewDropdown [data-view="month"]').click();
    await expectVisible(calendar.locator('#monthView'), 'Calendar original month view');
    await calendar.locator('#viewSelector').click();
    await calendar.locator('#viewDropdown [data-view="week"]').click();
    await checkMore(calendar, 'Calendar');

    const eventTitle = `Legacy MPA Event ${process.pid}`;
    await calendar.locator('#weekColumns .day-col').first().click({ position: { x: 24, y: 240 } });
    await expectVisible(calendar.locator('#calModal .event-modal-content'), 'Calendar original event modal');
    const typeEvent = calendar.locator('#modalTypeToggle [data-type="event"]');
    if (await typeEvent.count()) await typeEvent.click();
    await calendar.locator('#calModal #modalName').fill(eventTitle);
    await calendar.locator('#calModal #modalSave').click();
    await waitForWorker('/calendar/events', payload => payload.events.some(event => event.title === eventTitle), 'Calendar UI save');
    console.log('PASS Calendar CRUD reaches Cloud repository');

    const settings = await open(context, 'settings/settings.html');
    openedPages.push(settings);
    await expectVisible(settings.locator('.main-wrapper .settings-container'), 'Settings original container');
    await expectVisible(settings.locator('#googleSyncSection'), 'Settings Cloud session in original structure');
    await checkMore(settings, 'Settings');
    await settings.locator('#defaultDuration').fill('55');
    await settings.locator('#saveBtn').click();
    await waitForWorker('/settings', payload => Number(payload.settings.default_duration) === 55, 'Settings UI save');
    console.log('PASS Settings save reaches Cloud repository');
    await settings.locator('#syncGoogleNowBtn').click();
    await expectVisible(settings.locator('#googleSyncLastSyncAt'), 'Settings manual Cloud sync status');
    const importedPlanNames = Array.from({ length: 9 }, (_, index) => `Extension JSON Plan ${process.pid}-${index + 1}`);
    const importedTaskTitles = Array.from({ length: 6 }, (_, index) => `Extension JSON Task ${process.pid}-${index + 1}`);
    const extensionBackup = {
      _meta: { version: 1, app: 'TimeWhere', exported_at: '2026-07-12T00:00:00.000Z' },
      plans: importedPlanNames.map((name, index) => ({ id: 9001 + index, name })),
      buckets: [],
      labels: [],
      tasks: importedTaskTitles.map((title, index) => ({
        id: `json-task-${process.pid}-${index + 1}`,
        plan_id: 9001 + index,
        title,
        deadline: new Date().toISOString().slice(0, 10),
        status: 'not_started'
      })),
      containers: [],
      habits: [{ id: `json-habit-${process.pid}`, name: 'Unsupported habit' }],
      events: [],
      daily_journals: [{ date: '2026-07-11', summary: 'Unsupported journal' }],
      settings: [{ key: 'default_duration', value: 65 }]
    };
    const backupFile = {
      name: 'timewhere_backup_test.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(extensionBackup))
    };
    const chooseBackup = async () => {
      const chooserPromise = settings.waitForEvent('filechooser');
      await settings.locator('#importJsonBtn').click();
      const chooser = await chooserPromise;
      await chooser.setFiles(backupFile);
    };
    await chooseBackup();
    const importPanel = settings.locator('#timewhereJsonImportPanel');
    await importPanel.locator('[data-import-action="merge"]').waitFor({ state: 'visible' });
    await expectVisible(importPanel.getByText('Plans: 9 · Buckets: 0 · Labels: 0 · Tasks: 6', { exact: false }), 'Settings inline Extension JSON Plan and Task counts');
    await expectVisible(importPanel.getByText('Habits: 1 · Daily Journals: 1', { exact: false }), 'Settings unsupported import counts');
    if (await settings.locator('.timewhere-json-import-confirm').count()) throw new Error('Safe merge still opened the removed ordinary confirmation dialog.');
    const tasksBeforeImport = await workerRequest('GET', '/tasks?include_completed=true');
    if (tasksBeforeImport.tasks.some(task => importedTaskTitles.includes(task.title))) throw new Error('Extension JSON import reached Cloud before choosing an import mode.');

    await chooseBackup();
    await importPanel.locator('[data-import-action="merge"]').waitFor({ state: 'visible' });
    if (await importPanel.locator('[data-import-action="merge"]').count() !== 1) throw new Error('Extension JSON input/change events duplicated inline import actions.');
    await importPanel.locator('[data-import-action="merge"]').click();
    await settings.locator('#timewhereJsonImportPanel[data-import-stage="completed"]').waitFor({ state: 'visible', timeout: 20000 });
    await expectVisible(importPanel.getByText('Cloud 已接收并核对全部可导入实体。'), 'Settings Cloud import verification');
    await waitForWorker('/tasks?include_completed=true', payload => importedTaskTitles.every(title => payload.tasks.some(task => task.title === title)), 'Extension JSON Task import');
    const importedTasks = await workerRequest('GET', '/tasks?include_completed=true');
    const importedPlans = await workerRequest('GET', '/plans');
    const matchingTasks = importedTasks.tasks.filter(task => importedTaskTitles.includes(task.title));
    const matchingPlans = importedPlans.plans.filter(plan => importedPlanNames.includes(plan.name));
    if (matchingTasks.length !== 6 || matchingPlans.length !== 9) throw new Error(`Extension JSON import count mismatch: plans=${matchingPlans.length}, tasks=${matchingTasks.length}.`);
    const planIds = new Set(matchingPlans.map(plan => plan.id));
    if (!matchingTasks.every(task => planIds.has(task.plan_id))) throw new Error('Extension JSON imported Task lost its Plan reference.');
    await tasks.reload();
    await tasks.locator('html[data-timewhere-web-ready="true"]').waitFor({ state: 'attached', timeout: 15000 });
    const importedPlanLink = tasks.locator('#plansList .plan-link').filter({ hasText: importedPlanNames[0] });
    await expectVisible(importedPlanLink, 'Imported Plan appears in Tasks sidebar');
    await importedPlanLink.click();
    await expectVisible(tasks.locator('.bc-current').getByText(importedPlanNames[0], { exact: true }), 'Imported Plan selection updates Tasks title');
    await expectVisible(tasks.locator('.task-card').filter({ hasText: importedTaskTitles[0] }), 'Imported Plan shows its assigned Task');
    if (await tasks.locator('.task-card').filter({ hasText: importedTaskTitles[1] }).count()) throw new Error('Imported Plan selection leaked a Task assigned to another Plan.');

    const conflictEntry = importPanel.locator('[data-import-action="conflicts"]');
    await expectVisible(conflictEntry, 'Settings import result exposes separate conflict entry');
    await conflictEntry.click();
    const conflictDialog = settings.locator('.timewhere-json-conflict-review');
    await expectVisible(conflictDialog.getByText('设置：default_duration'), 'Settings import conflict detail');
    const durationConflict = conflictDialog.locator('.google-sync-conflict-row').filter({ hasText: '设置：default_duration' });
    await durationConflict.getByRole('button', { name: '保留 Cloud' }).click();
    await expectVisible(conflictDialog.getByText('没有待处理的导入冲突。'), 'Settings import conflict resolution');
    await conflictDialog.getByRole('button', { name: '关闭' }).click();
    const settingsAfterImport = await workerRequest('GET', '/settings');
    if (Number(settingsAfterImport.settings.default_duration) !== 55) throw new Error('Extension JSON safe merge silently overwrote a Cloud setting.');
    const importHistory = await settings.evaluate(() => globalThis.TimeWhereGoogleSync.getGoogleSyncHistory());
    if (!importHistory.some(entry => entry.reason === 'json_import_merge')) throw new Error('Extension JSON import did not record sanitized sync history.');

    await chooseBackup();
    await importPanel.locator('[data-import-action="merge"]').click();
    await settings.locator('#timewhereJsonImportPanel[data-import-stage="completed"]').waitFor({ state: 'visible', timeout: 20000 });
    await waitForWorker('/tasks?include_completed=true', payload => payload.tasks.filter(task => importedTaskTitles.includes(task.title)).length === 6, 'Extension JSON idempotent retry');

    await chooseBackup();
    await importPanel.locator('[data-import-action="replace"]').click();
    const replacementDialog = settings.locator('.timewhere-json-replacement-confirm');
    await expectVisible(replacementDialog, 'Settings complete replacement danger confirmation');
    await expectVisible(replacementDialog.getByText('Cloud 独有', { exact: false }), 'Settings replacement delete warning');
    await replacementDialog.locator('[data-replacement-confirmation]').fill('覆盖导入');
    await replacementDialog.getByRole('button', { name: '覆盖导入' }).click();
    await settings.locator('#timewhereJsonImportPanel[data-import-stage="completed"]').waitFor({ state: 'visible', timeout: 30000 });
    const replacementTasks = await workerRequest('GET', '/tasks?include_completed=true');
    const replacementPlans = await workerRequest('GET', '/plans');
    if (replacementTasks.tasks.length !== 6 || replacementPlans.plans.length !== 9) {
      throw new Error(`Complete replacement mismatch: plans=${replacementPlans.plans.length}, tasks=${replacementTasks.tasks.length}.`);
    }
    const settingsAfterReplacement = await workerRequest('GET', '/settings');
    if (Number(settingsAfterReplacement.settings.default_duration) !== 65) throw new Error('Complete replacement did not adopt backup Settings.');

    await importPanel.locator('[data-import-action="rollback"]').click();
    const rollbackDialog = settings.locator('.timewhere-json-replacement-confirm');
    await expectVisible(rollbackDialog, 'Settings replacement rollback danger confirmation');
    await rollbackDialog.locator('[data-replacement-confirmation]').fill('撤销覆盖');
    await rollbackDialog.getByRole('button', { name: '撤销覆盖' }).click();
    await settings.waitForFunction(() => {
      const stage = document.getElementById('timewhereJsonImportPanel')?.dataset.importStage;
      return stage === 'completed' || stage === 'failed' || stage === 'stale';
    }, null, { timeout: 30000 });
    let rollbackStage = await importPanel.getAttribute('data-import-stage');
    let staleRollbackObserved = rollbackStage === 'stale';
    for (let attempt = 1; rollbackStage === 'stale' && attempt <= 5; attempt += 1) {
      await settings.waitForTimeout(1500);
      await importPanel.locator('[data-import-action="rollback"]').click();
      const retryDialog = settings.locator('.timewhere-json-replacement-confirm');
      await expectVisible(retryDialog, `Settings stale rollback regenerates preview (attempt ${attempt})`);
      await retryDialog.locator('[data-replacement-confirmation]').fill('撤销覆盖');
      await retryDialog.getByRole('button', { name: '撤销覆盖' }).click();
      await settings.waitForFunction(() => {
        const stage = document.getElementById('timewhereJsonImportPanel')?.dataset.importStage;
        return stage === 'completed' || stage === 'failed' || stage === 'stale';
      }, null, { timeout: 30000 });
      rollbackStage = await importPanel.getAttribute('data-import-stage');
      staleRollbackObserved ||= rollbackStage === 'stale';
    }
    if (rollbackStage !== 'completed') throw new Error('Replacement rollback UI failed: ' + await importPanel.textContent());    const settingsAfterRollback = await workerRequest('GET', '/settings');
    if (Number(settingsAfterRollback.settings.default_duration) !== 55) throw new Error('Replacement rollback did not restore pre-overwrite Settings.');
    if (staleRollbackObserved) {
      settings.runtimeErrors = settings.runtimeErrors.filter(error => !error.includes('409 (Conflict)'));
    }
    console.log('PASS Extension JSON import supports inline merge, 9 Plans / 6 Tasks, conflicts, complete replacement, and rollback');
    await settings.locator('#refreshTimeWhereSessionBtn').click();
    console.log('PASS Settings session rotation control executed');

    const runtimeErrors = openedPages.flatMap(page => page.runtimeErrors.map(error => `${page.url()}: ${error}`));
    if (runtimeErrors.length) throw new Error(`Runtime errors:\n${runtimeErrors.join('\n')}`);
    console.log('All legacy MPA functional walkthrough checks passed.');
  } finally {
    if (browser) await browser.close();
    await Promise.allSettled([stop(pages), stop(worker)]);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
