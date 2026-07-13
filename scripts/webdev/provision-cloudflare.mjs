import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const localStateDir = path.join(root, '.wrangler');
const resourcesPath = path.join(localStateDir, 'timewhere-cloudflare-resources.local.json');
const generatedConfigPath = path.join(localStateDir, 'timewhere-webdev.generated.wrangler.toml');
const tokenEnvName = 'CLOUDFLARE_' + 'API_' + 'TOKEN';
const googleClientEnvName = 'TIMEWHERE_GOOGLE_WEB_CLIENT_ID';

const environments = {
  dev: {
    workerName: 'timewhere-dev-api',
    pagesProject: 'timewhere-dev-web',
    d1Name: 'timewhere-dev-db',
    r2Bucket: 'timewhere-dev-snapshots',
    kvTitle: 'timewhere-dev-cache',
    timewhereEnv: 'dev'
  },
  preview: {
    workerName: 'timewhere-preview-api',
    pagesProject: 'timewhere-preview-web',
    d1Name: 'timewhere-preview-db',
    r2Bucket: 'timewhere-preview-snapshots',
    kvTitle: 'timewhere-preview-cache',
    timewhereEnv: 'preview'
  }
};

function sanitize(text) {
  const token = process.env[tokenEnvName] || '';
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text || '')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<uuid>')
    .replace(/[a-f0-9]{32}/gi, '<hex-id>')
    .replace(new RegExp(escapedToken || '___NO_TOKEN___', 'g'), '<token>');
}

function runWrangler(args, options = {}) {
  const result = spawnSync(npmBin, ['--prefix', 'workers', 'exec', '--', 'wrangler', ...args], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`wrangler ${args.join(' ')} failed:\n${sanitize(output)}`);
  }
  return {
    ok: result.status === 0,
    output,
    sanitizedOutput: sanitize(output)
  };
}

function parseJsonArray(output) {
  const trimmed = output.trim();
  const jsonStart = trimmed.indexOf('[');
  if (jsonStart < 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(jsonStart));
  } catch {
    return null;
  }
}

function parseTomlString(value) {
  return JSON.stringify(String(value || ''));
}

function getD1Database(name) {
  const listed = runWrangler(['d1', 'list', '--json']);
  const databases = parseJsonArray(listed.output) || [];
  return databases.find(db => db.name === name || db.database_name === name) || null;
}

function ensureD1Database(name) {
  let database = getD1Database(name);
  if (!database) {
    runWrangler(['d1', 'create', name]);
    database = getD1Database(name);
  }
  const id = database?.uuid || database?.id || database?.database_id;
  if (!id) {
    throw new Error(`Could not resolve D1 database id for ${name}.`);
  }
  return { name, id };
}

function parseKvNamespaces(output) {
  const parsed = parseJsonArray(output);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  const matches = [];
  const pattern = /"id"\s*:\s*"([^"]+)"[\s\S]*?"title"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = pattern.exec(output))) {
    matches.push({ id: match[1], title: match[2] });
  }
  return matches;
}

function getKvNamespace(title) {
  const listed = runWrangler(['kv', 'namespace', 'list']);
  const namespaces = parseKvNamespaces(listed.output);
  return namespaces.find(ns => ns.title === title || ns.name === title) || null;
}

function ensureKvNamespace(title) {
  let namespace = getKvNamespace(title);
  if (!namespace) {
    runWrangler(['kv', 'namespace', 'create', title]);
    namespace = getKvNamespace(title);
  }
  const id = namespace?.id;
  if (!id) {
    throw new Error(`Could not resolve KV namespace id for ${title}.`);
  }
  return { title, id };
}

function ensureR2Bucket(name) {
  const created = runWrangler(['r2', 'bucket', 'create', name], { allowFailure: true });
  if (!created.ok && !/already exists|already been taken|bucket.*exists/i.test(created.output)) {
    throw new Error(`Could not create or confirm R2 bucket ${name}:\n${created.sanitizedOutput}`);
  }
  return { name };
}

function ensurePagesProject(name) {
  const created = runWrangler(['pages', 'project', 'create', name, '--production-branch', 'WebDev'], { allowFailure: true });
  if (!created.ok && !/already exists|already.*created|project.*exists/i.test(created.output)) {
    throw new Error(`Could not create or confirm Pages project ${name}:\n${created.sanitizedOutput}`);
  }
  return { name };
}

function writeGeneratedConfig(resources) {
  const googleClientId = process.env[googleClientEnvName] || '';
  const dev = resources.environments.dev;
  const preview = resources.environments.preview;
  const content = `name = ${parseTomlString(dev.worker_name)}
main = "../workers/src/index.ts"
compatibility_date = "2026-07-10"

[[d1_databases]]
binding = "DB"
database_name = ${parseTomlString(dev.d1_database_name)}
database_id = ${parseTomlString(dev.d1_database_id)}
migrations_dir = "../workers/migrations"

[[r2_buckets]]
binding = "SNAPSHOTS"
bucket_name = ${parseTomlString(dev.r2_bucket_name)}

[[kv_namespaces]]
binding = "APP_CACHE"
id = ${parseTomlString(dev.kv_namespace_id)}

[vars]
TIMEWHERE_ENV = "dev"
GOOGLE_OIDC_CLIENT_ID = ${parseTomlString(googleClientId)}
TIMEWHERE_TASK_REPLAY_KILL_SWITCH = "on"
TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED = "false"

[env.preview]
name = ${parseTomlString(preview.worker_name)}

[[env.preview.d1_databases]]
binding = "DB"
database_name = ${parseTomlString(preview.d1_database_name)}
database_id = ${parseTomlString(preview.d1_database_id)}
migrations_dir = "../workers/migrations"

[[env.preview.r2_buckets]]
binding = "SNAPSHOTS"
bucket_name = ${parseTomlString(preview.r2_bucket_name)}

[[env.preview.kv_namespaces]]
binding = "APP_CACHE"
id = ${parseTomlString(preview.kv_namespace_id)}

[env.preview.vars]
TIMEWHERE_ENV = "preview"
GOOGLE_OIDC_CLIENT_ID = ${parseTomlString(googleClientId)}
TIMEWHERE_TASK_REPLAY_KILL_SWITCH = "on"
TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED = "false"
`;
  fs.mkdirSync(localStateDir, { recursive: true });
  fs.writeFileSync(generatedConfigPath, content, 'utf8');
}

function main() {
  console.log('WebDev Cloudflare resource provision');
  console.log('====================================');

  const auth = runWrangler(['whoami'], { allowFailure: true });
  if (!auth.ok) {
    console.error(`Cloudflare auth is not available. Set ${tokenEnvName} in your shell or run wrangler login, then retry.`);
    process.exit(2);
  }

  fs.mkdirSync(localStateDir, { recursive: true });

  const resourceState = {
    schema: 'timewhere-cloudflare-resources-v1',
    generated_at: new Date().toISOString(),
    environments: {}
  };

  for (const [envName, config] of Object.entries(environments)) {
    console.log(`  Preparing ${envName} resources`);
    const d1 = ensureD1Database(config.d1Name);
    const r2 = ensureR2Bucket(config.r2Bucket);
    const kv = ensureKvNamespace(config.kvTitle);
    const pages = ensurePagesProject(config.pagesProject);
    resourceState.environments[envName] = {
      worker_name: config.workerName,
      pages_project: pages.name,
      d1_database_name: d1.name,
      d1_database_id: d1.id,
      r2_bucket_name: r2.name,
      kv_namespace_name: kv.title,
      kv_namespace_id: kv.id,
      timewhere_env: config.timewhereEnv
    };
    console.log(`  PASS ${envName} resources are present`);
  }

  fs.writeFileSync(resourcesPath, `${JSON.stringify(resourceState, null, 2)}\n`, 'utf8');
  writeGeneratedConfig(resourceState);

  console.log('====================================');
  console.log('Cloudflare dev/preview resource state is ready.');
  console.log(`Local resource state: ${path.relative(root, resourcesPath)}`);
  console.log(`Generated deploy config: ${path.relative(root, generatedConfigPath)}`);
  console.log('These files are under .wrangler/ and must stay uncommitted.');
}

main();
