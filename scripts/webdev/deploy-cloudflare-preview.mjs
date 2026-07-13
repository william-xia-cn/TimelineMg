import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const localStateDir = path.join(root, '.wrangler');
const resourcesPath = path.join(localStateDir, 'timewhere-cloudflare-resources.local.json');
const generatedConfigPath = path.join(localStateDir, 'timewhere-webdev.generated.wrangler.toml');
const deploymentStatePath = path.join(localStateDir, 'timewhere-preview-deployment.local.json');
const tokenEnvName = 'CLOUDFLARE_' + 'API_' + 'TOKEN';
const googleClientEnvName = 'TIMEWHERE_GOOGLE_WEB_CLIENT_ID';

function sanitize(text) {
  const token = process.env[tokenEnvName] || '';
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text || '')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<uuid>')
    .replace(/[a-f0-9]{32}/gi, '<hex-id>')
    .replace(new RegExp(escapedToken || '___NO_TOKEN___', 'g'), '<token>');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32'
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
  return run(npmBin, ['--prefix', 'workers', 'exec', '--', 'wrangler', ...args], options);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseFirstWorkersUrl(output) {
  const match = String(output || '').match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i);
  return match ? match[0] : null;
}

function requireLocalState() {
  if (!fs.existsSync(resourcesPath) || !fs.existsSync(generatedConfigPath)) {
    throw new Error('Missing local Cloudflare resource state. Run npm run webdev:cloudflare:provision first.');
  }
}

function main() {
  console.log('WebDev Cloudflare preview deploy');
  console.log('=================================');

  const auth = runWrangler(['whoami'], { allowFailure: true });
  if (!auth.ok) {
    console.error(`Cloudflare auth is not available. Set ${tokenEnvName} in your shell or run wrangler login, then retry.`);
    process.exit(2);
  }

  requireLocalState();

  const googleClientId = process.env[googleClientEnvName];
  if (!googleClientId) {
    console.error(`Missing ${googleClientEnvName}. Create a Google Web OAuth client for preview SSO and set the public client id in this shell.`);
    process.exit(2);
  }

  const resources = readJson(resourcesPath);
  const preview = resources.environments?.preview;
  if (!preview) {
    throw new Error('Local Cloudflare resource state does not contain preview resources.');
  }

  console.log('  Applying remote preview D1 migrations');
  runWrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', generatedConfigPath, '--env', 'preview']);
  console.log('  PASS preview D1 migrations applied');

  console.log('  Deploying preview Worker');
  const workerDeploy = runWrangler(['deploy', '--config', generatedConfigPath, '--env', 'preview']);
  const workerUrl = process.env.TIMEWHERE_PREVIEW_WORKER_API_BASE_URL || parseFirstWorkersUrl(workerDeploy.output);
  if (!workerUrl) {
    throw new Error('Could not determine preview Worker URL from deploy output. Set TIMEWHERE_PREVIEW_WORKER_API_BASE_URL and rerun.');
  }
  console.log(`  PASS preview Worker deployed: ${workerUrl}`);

  console.log('  Building Web App for preview Pages');
  run(npmBin, ['--prefix', 'pages', 'run', 'build'], {
    env: {
      ...process.env,
      VITE_WORKER_API_BASE_URL: workerUrl,
      VITE_GOOGLE_OIDC_CLIENT_ID: googleClientId
    }
  });
  console.log('  PASS preview Web App build complete');

  console.log('  Deploying preview Pages');
  const pagesDeploy = runWrangler([
    'pages',
    'deploy',
    path.join(root, 'pages', 'dist'),
    '--project-name',
    preview.pages_project,
    '--branch',
    'WebDev',
    '--commit-dirty=true',
    '--commit-message',
    'TimeWhere-WebDev-preview-deploy'
  ]);
  const canonicalPagesUrl = `https://${preview.pages_project}.pages.dev`;
  const pagesUrls = [
    canonicalPagesUrl,
    ...[...new Set(String(pagesDeploy.output || '').match(/https:\/\/[^\s]+/g) || [])]
      .filter(url => url !== canonicalPagesUrl)
  ];
  const deploymentState = {
    schema: 'timewhere-preview-deployment-v1',
    generated_at: new Date().toISOString(),
    worker_url: workerUrl,
    pages_project: preview.pages_project,
    pages_urls: pagesUrls
  };
  fs.writeFileSync(deploymentStatePath, `${JSON.stringify(deploymentState, null, 2)}\n`, 'utf8');
  console.log(`  PASS preview Pages deployed for project ${preview.pages_project}`);
  if (pagesUrls.length) {
    console.log(`  Preview URL: ${pagesUrls[0]}`);
  }

  console.log('=================================');
  console.log(`Deployment state saved locally: ${path.relative(root, deploymentStatePath)}`);
  console.log('The local state file is under .wrangler/ and must stay uncommitted.');
}

main();
