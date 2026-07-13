import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const localStateDir = path.join(root, '.wrangler');
const resourcesPath = path.join(localStateDir, 'timewhere-cloudflare-resources.local.json');
const generatedConfigPath = path.join(localStateDir, 'timewhere-webdev.generated.wrangler.toml');
const wranglerBinPath = path.join(root, 'workers', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const tokenEnvName = 'CLOUDFLARE_' + 'API_' + 'TOKEN';

let passed = 0;
let failed = 0;

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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assert(description, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${description}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${description}${detail ? `: ${sanitize(detail)}` : ''}`);
}

function runWrangler(args, options = {}) {
  const attempts = options.allowFailure ? 1 : (options.attempts || 4);
  let lastResult = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawnSync(process.execPath, [wranglerBinPath, ...args], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      shell: false,
      maxBuffer: 20 * 1024 * 1024
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    const wrapped = { ok: result.status === 0, output, sanitizedOutput: sanitize(output) };
    if (wrapped.ok || options.allowFailure) return wrapped;
    lastResult = wrapped;
    if (!isRetryableWranglerFailure(output) || attempt === attempts) break;
    console.warn(`  WARN Wrangler transient failure, retrying ${attempt}/${attempts - 1}...`);
    sleep(1000 * attempt);
  }
  throw new Error(`${process.execPath} ${[wranglerBinPath, ...args].join(' ')} failed:\n${lastResult?.sanitizedOutput || ''}`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isRetryableWranglerFailure(output) {
  return /Authentication error\s+\[code:\s*10000\]|A request to the Cloudflare API .* failed|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(String(output || ''));
}

function requireLocalState() {
  assert('local Cloudflare resource state exists', fs.existsSync(resourcesPath));
  assert('generated wrangler config exists', fs.existsSync(generatedConfigPath));
  assert('local Wrangler dependency exists', fs.existsSync(wranglerBinPath));
  if (failed > 0) {
    throw new Error('Missing required local preview state. Run provision/deploy before data hygiene smoke.');
  }
}

function parseJsonOutput(output) {
  const trimmed = String(output || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstArray = trimmed.indexOf('[');
    const lastArray = trimmed.lastIndexOf(']');
    if (firstArray >= 0 && lastArray > firstArray) {
      return JSON.parse(trimmed.slice(firstArray, lastArray + 1));
    }
    throw new Error(`Could not parse Wrangler JSON output:\n${sanitize(trimmed.slice(0, 1000))}`);
  }
}

function d1Json(command) {
  const result = runWrangler([
    'd1',
    'execute',
    'DB',
    '--remote',
    '--config',
    generatedConfigPath,
    '--env',
    'preview',
    '--command',
    command,
    '--json'
  ]);
  return parseJsonOutput(result.output);
}

function getD1Rows(command) {
  const payload = d1Json(command);
  if (!Array.isArray(payload) || !payload[0]?.success) {
    throw new Error(`Preview D1 JSON response was not successful:\n${sanitize(JSON.stringify(payload).slice(0, 1000))}`);
  }
  return payload[0].results || [];
}

function kvKeys(preview, prefix) {
  const result = runWrangler([
    'kv',
    'key',
    'list',
    '--namespace-id',
    preview.kv_namespace_id,
    '--prefix',
    prefix
  ]);
  const payload = parseJsonOutput(result.output);
  return Array.isArray(payload) ? payload : [];
}

function assertNoPreviewSmokeRows() {
  const smokeAccountFilter = "account_id LIKE 'acct_smoke_%' OR account_id LIKE 'acct_ui_smoke_%'";
  const checks = [
    ['accounts', "google_sub LIKE 'preview-smoke-%' OR google_sub LIKE 'preview-ui-smoke-%'"],
    ['user_profiles', smokeAccountFilter],
    ['account_sessions', smokeAccountFilter],
    ['plans', smokeAccountFilter],
    ['buckets', smokeAccountFilter],
    ['labels', smokeAccountFilter],
    ['containers', smokeAccountFilter],
    ['tasks', smokeAccountFilter],
    ['calendar_events', smokeAccountFilter],
    ['product_settings', smokeAccountFilter],
    ['migration_runs', smokeAccountFilter],
    ['migration_conflicts', smokeAccountFilter],
    ['sync_changes', smokeAccountFilter],
    ['sync_conflicts', smokeAccountFilter],
    ['sync_mutation_outcomes', smokeAccountFilter]
  ];
  const rows = checks.map(([area, where]) => {
    const result = getD1Rows(`SELECT COUNT(*) AS leftover_count FROM ${area} WHERE ${where};`);
    return { area, leftover_count: Number(result[0]?.leftover_count || 0) };
  });
  const leftovers = rows.filter(row => Number(row.leftover_count || 0) !== 0);
  assert('preview D1 has no smoke account/entity/migration references',
    leftovers.length === 0,
    leftovers.map(row => `${row.area}=${row.leftover_count}`).join(', '));
}

function assertNoPreviewSmokeKv(preview) {
  const prefixes = ['preview-smoke', 'preview-smoke:'];
  for (const prefix of prefixes) {
    const keys = kvKeys(preview, prefix);
    assert(`preview KV has no ${prefix} temporary keys`, keys.length === 0, `${keys.length} leftover key(s)`);
  }
}

function assertNoLocalSmokeFiles() {
  const files = fs.existsSync(localStateDir)
    ? fs.readdirSync(localStateDir).filter(file => /^preview-smoke-.*\.txt$/i.test(file) || /^preview-smoke-.*\.out\.txt$/i.test(file))
    : [];
  assert('local .wrangler has no preview smoke temp files', files.length === 0, `${files.length} leftover file(s)`);
}

console.log('WebDev preview data hygiene smoke');
console.log('=================================');

try {
  requireLocalState();

  const resources = readJson(resourcesPath);
  const preview = resources.environments?.preview;
  assert('local state targets preview environment', preview?.timewhere_env === 'preview');
  assert('preview resource names are scoped to preview',
    preview?.worker_name === 'timewhere-preview-api'
      && preview?.pages_project === 'timewhere-preview-web'
      && preview?.d1_database_name === 'timewhere-preview-db'
      && preview?.r2_bucket_name === 'timewhere-preview-snapshots'
      && preview?.kv_namespace_name === 'timewhere-preview-cache');

  assertNoPreviewSmokeRows();
  assertNoPreviewSmokeKv(preview);
  assertNoLocalSmokeFiles();

  if (failed > 0) {
    console.error(`\n${failed} preview data hygiene checks failed; ${passed} passed.`);
    process.exit(1);
  }

  console.log('=================================');
  console.log(`All ${passed} WebDev preview data hygiene checks passed.`);
  console.log('No prod resources were touched; no token, account email, Cloudflare id, or local path was printed.');
} catch (error) {
  console.error(sanitize(error?.stack || error?.message || error));
  process.exit(1);
}
