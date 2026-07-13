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

function runWrangler(args, options = {}) {
  return run(process.execPath, [wranglerBinPath, ...args], options);
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
    const today = new Date().toISOString().slice(0, 10);
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(pagesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(({ token, expiresAt }) => {
      window.localStorage.setItem('timewhere.web.session', JSON.stringify({
        token,
        expires_at: expiresAt,
        account: { id: 'preview-ui-smoke-account', name: 'Preview UI Smoke Account' },
        profile: { name: 'Preview UI Smoke Workspace' }
      }));
    }, { token: session.token, expiresAt: session.expiresAt });
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });

    await visible(page, 'Preview Dashboard renders projection', page.getByText('Today projection'));
    await visible(page, 'Preview Dashboard renders reminder state', page.getByText('Reminder state'));

    await page.getByRole('button', { name: /Tasks/ }).click();
    await visible(page, 'Preview Tasks view receives Cloud task', page.getByText(taskTitle));
    await page.getByText(taskTitle).click();
    await visible(page, 'Preview Task detail opens', page.getByText('Save task detail'));

    await page.getByRole('button', { name: /Calendar/ }).click();
    await visible(page, 'Preview Calendar renders date projection', page.getByText('Date projection', { exact: true }));
    await visible(page, 'Preview Calendar receives Cloud event', page.getByText(eventTitle).first());

    await page.getByRole('button', { name: /Settings/ }).click();
    await visible(page, 'Preview Settings renders Cloud session panel', page.getByText('Cloud session', { exact: true }));
    await visible(page, 'Preview Settings renders data authority panel', page.getByText('Data authority', { exact: true }));
    await visible(page, 'Preview Settings renders migration panel', page.getByText('Automatic migration', { exact: true }));
    await visible(page, 'Preview Settings renders replay safety diagnostics', page.getByText('Replay safety gate', { exact: true }));
    await visible(page, 'Preview Settings renders structure editor', page.getByText('Structure', { exact: true }));

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
