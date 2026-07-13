import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
    .replace(/[a-f0-9]{32}/gi, '<hex-id>')
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
  return {
    ok: result.status === 0,
    output,
    sanitizedOutput: sanitize(output)
  };
}

function runWrangler(args, options = {}) {
  return run(process.execPath, [wranglerBinPath, ...args], options);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithRetry(url, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = process.platform === 'win32'
        ? fetchWithPowerShell(url)
        : await fetch(url, options);
      if (response.ok || attempt === 4) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  }
  throw lastError || new Error(`Failed to fetch ${url}`);
}

function fetchWithPowerShell(url) {
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    "$ErrorActionPreference='Stop'; $r = Invoke-WebRequest -Uri $env:TIMEWHERE_PREVIEW_SMOKE_URL -UseBasicParsing -TimeoutSec 30; [pscustomobject]@{ status = [int]$r.StatusCode; content = [string]$r.Content } | ConvertTo-Json -Compress"
  ], {
    cwd: root,
    env: {
      ...process.env,
      TIMEWHERE_PREVIEW_SMOKE_URL: url
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

async function fetchJson(url) {
  const response = await fetchWithRetry(url);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Keep null and let the caller produce the structured failure.
  }
  assert(response.ok, `${url} returned HTTP ${response.status}: ${sanitize(text).slice(0, 500)}`);
  return json;
}

function requireLocalState() {
  assert(fs.existsSync(resourcesPath), 'Missing local Cloudflare resource state. Run npm run webdev:cloudflare:provision first.');
  assert(fs.existsSync(deploymentStatePath), 'Missing local preview deployment state. Run npm run webdev:preview:deploy first.');
  assert(fs.existsSync(generatedConfigPath), 'Missing generated wrangler config. Run npm run webdev:cloudflare:provision first.');
  assert(fs.existsSync(wranglerBinPath), 'Missing local Wrangler dependency. Run npm --prefix workers install first.');
}

function main() {
  console.log('WebDev preview smoke');
  console.log('====================');

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
  assert(preview.worker_name === 'timewhere-preview-api', 'Preview smoke refuses to run against a non-preview Worker.');
  assert(preview.pages_project === 'timewhere-preview-web', 'Preview smoke refuses to run against a non-preview Pages project.');

  const workerUrl = String(deployment.worker_url || '').replace(/\/$/, '');
  const pagesUrl = String(deployment.pages_urls?.[0] || `https://${preview.pages_project}.pages.dev`).replace(/\/$/, '');
  assert(workerUrl.includes('timewhere-preview-api'), 'Preview smoke refuses to run against a non-preview Worker URL.');
  assert(pagesUrl === `https://${preview.pages_project}.pages.dev`, 'Preview smoke must use the stable Pages preview URL.');

  return Promise.resolve()
    .then(async () => {
      const health = await fetchJson(`${workerUrl}/health`);
      assert(health?.status === 'ok', 'Preview Worker health did not return ok.');
      assert(health?.data?.service === 'timewhere-api', 'Preview Worker health did not identify timewhere-api.');
      assert(health?.data?.env === 'preview', 'Preview Worker health did not identify preview env.');
      console.log('  PASS preview Worker /health');

      const pagesResponse = await fetchWithRetry(pagesUrl);
      const pagesHtml = await pagesResponse.text();
      assert(pagesResponse.ok, `Preview Pages returned HTTP ${pagesResponse.status}.`);
      assert(pagesHtml.includes('<div id="root"'), 'Preview Pages did not contain the React root.');
      assert(pagesHtml.includes('TimeWhere'), 'Preview Pages did not contain TimeWhere app marker.');
      console.log('  PASS stable preview Pages load');
    })
    .then(() => {
      const tableCheck = runWrangler([
        'd1',
        'execute',
        'DB',
        '--remote',
        '--config',
        generatedConfigPath,
        '--env',
        'preview',
        '--command',
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('accounts','account_sessions','tasks','calendar_events','containers','product_settings','migration_runs','sync_changes','sync_conflicts') ORDER BY name;"
      ]);
      for (const table of ['accounts', 'account_sessions', 'tasks', 'calendar_events', 'containers', 'product_settings', 'migration_runs', 'sync_changes', 'sync_conflicts']) {
        assert(tableCheck.output.includes(table), `Preview D1 is missing expected table ${table}.`);
      }
      console.log('  PASS preview D1 core tables');

      const accountCount = runWrangler([
        'd1',
        'execute',
        'DB',
        '--remote',
        '--config',
        generatedConfigPath,
        '--env',
        'preview',
        '--command',
        'SELECT COUNT(*) AS account_count FROM accounts;'
      ]);
      assert(/account_count/i.test(accountCount.output), 'Preview D1 account count query did not return account_count.');
      console.log('  PASS preview D1 account table query');
    })
    .then(() => {
      const stamp = `${Date.now()}-${process.pid}`;
      const smokeKey = `preview-smoke/${stamp}.txt`;
      const smokeText = `timewhere preview smoke ${stamp}\n`;
      const sourceFile = path.join(localStateDir, `preview-smoke-${stamp}.txt`);
      const outFile = path.join(localStateDir, `preview-smoke-${stamp}.out.txt`);
      fs.writeFileSync(sourceFile, smokeText, 'utf8');
      try {
        runWrangler(['r2', 'object', 'put', `${preview.r2_bucket_name}/${smokeKey}`, '--file', sourceFile]);
        runWrangler(['r2', 'object', 'get', `${preview.r2_bucket_name}/${smokeKey}`, '--file', outFile]);
        assert(fs.readFileSync(outFile, 'utf8') === smokeText, 'Preview R2 object readback did not match.');
        runWrangler(['r2', 'object', 'delete', `${preview.r2_bucket_name}/${smokeKey}`]);
        console.log('  PASS preview R2 temporary object write/read/delete');
      } finally {
        fs.rmSync(sourceFile, { force: true });
        fs.rmSync(outFile, { force: true });
      }
    })
    .then(() => {
      const stamp = `${Date.now()}-${process.pid}`;
      const key = `preview-smoke:${stamp}`;
      const value = `ok-${stamp}`;
      try {
        runWrangler(['kv', 'key', 'put', '--namespace-id', preview.kv_namespace_id, key, value]);
        const readback = runWrangler(['kv', 'key', 'get', '--namespace-id', preview.kv_namespace_id, key]);
        assert(readback.output.trim().includes(value), 'Preview KV key readback did not match.');
        runWrangler(['kv', 'key', 'delete', '--namespace-id', preview.kv_namespace_id, key]);
        console.log('  PASS preview KV temporary key write/read/delete');
      } catch (error) {
        try {
          runWrangler(['kv', 'key', 'delete', '--namespace-id', preview.kv_namespace_id, key], { allowFailure: true });
        } catch {
          // Ignore cleanup failure and report the original error.
        }
        throw error;
      }
    })
    .then(() => {
      console.log('====================');
      console.log('All WebDev preview smoke checks passed.');
      console.log('No prod resources were touched; local Cloudflare ids remain only under ignored .wrangler/ state.');
    });
}

main().catch(error => {
  console.error(sanitize(error?.stack || error?.message || error));
  process.exit(1);
});
