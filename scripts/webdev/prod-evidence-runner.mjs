import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runMode = process.argv.includes('--run');
const allowDirty = process.argv.includes('--allow-dirty');
const allowUnpushed = process.argv.includes('--allow-unpushed');
const outputDir = path.join(root, '.wrangler');
const outputFile = path.join(outputDir, 'webdev-gate-r-evidence-summary.json');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const evidenceCommands = [
  { id: 'webdev_verify', display: 'npm run webdev:verify', command: npmCommand, args: ['run', 'webdev:verify'] },
  { id: 'preview_acceptance', display: 'npm run webdev:preview:acceptance', command: npmCommand, args: ['run', 'webdev:preview:acceptance'] },
  { id: 'prod_acceptance', display: 'npm run webdev:prod:acceptance', command: npmCommand, args: ['run', 'webdev:prod:acceptance'] },
  { id: 'extension_readiness', display: 'npm run webdev:extension:readiness', command: npmCommand, args: ['run', 'webdev:extension:readiness'] },
  { id: 'desktop_readiness', display: 'npm run webdev:desktop:readiness', command: npmCommand, args: ['run', 'webdev:desktop:readiness'] },
  { id: 'gate_b_readiness', display: 'npm run webdev:gate-b:readiness', command: npmCommand, args: ['run', 'webdev:gate-b:readiness'] },
  { id: 'gate_c_readiness', display: 'npm run webdev:gate-c:readiness', command: npmCommand, args: ['run', 'webdev:gate-c:readiness'] },
  { id: 'observability_readiness', display: 'npm run webdev:observability:readiness', command: npmCommand, args: ['run', 'webdev:observability:readiness'] },
  { id: 'prod_readiness', display: 'npm run webdev:prod:readiness', command: npmCommand, args: ['run', 'webdev:prod:readiness'] },
  { id: 'completion_audit', display: 'npm run webdev:completion:audit', command: npmCommand, args: ['run', 'webdev:completion:audit'] },
  { id: 'local_acceptance', display: 'npm run webdev:acceptance:local', command: npmCommand, args: ['run', 'webdev:acceptance:local'] },
  { id: 'npm_test', display: 'npm test', command: npmCommand, args: ['test'] },
  { id: 'git_diff_check', display: 'git diff --check', command: 'git', args: ['diff', '--check'] }
];

const forbiddenCommandFragments = [
  'gh release',
  'webdev:preview:deploy',
  'webdev:cloudflare:provision',
  'electron:package',
  'git push',
  'gh workflow run'
];

function git(args, fallback = '') {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  if (result.status !== 0) return fallback;
  return String(result.stdout || '').trim();
}

function assertSafeCommandPlan() {
  const plan = evidenceCommands.map(command => command.display).join('\n');
  const unsafe = forbiddenCommandFragments.find(fragment => plan.includes(fragment));
  if (unsafe) {
    console.error(`Unsafe evidence command plan contains forbidden fragment: ${unsafe}`);
    process.exit(1);
  }
}

function runSensitivePatternScan() {
  const changed = [
    ...git(['diff', '--name-only']).split(/\r?\n/),
    ...git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/)
  ]
    .map(file => file.trim())
    .filter(Boolean)
    .filter(file => fs.existsSync(path.join(root, file)));

  if (changed.length === 0) {
    return { status: 0, changed_files: 0 };
  }

  const patterns = [
    'GOC' + 'SPX-',
    'ya' + '29\\.',
    'CF_' + 'API_' + 'TOKEN',
    'CLOUDFLARE_' + 'API_' + 'TOKEN',
    'cloudflare_' + 'api_' + 'token',
    'BEGIN ' + 'PRIVATE KEY',
    'BEGIN RSA ' + 'PRIVATE KEY',
    '\\bsk-[A-Za-z0-9_-]{20,}',
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'
  ];
  const globArgs = [
    '--hidden',
    '--glob', '!node_modules/**',
    '--glob', '!pages/dist/**',
    '--glob', '!workers/.wrangler/**',
    '--glob', '!.wrangler/**',
    '--glob', '!dist/**',
    '--glob', '!platforms/desktop-electron/dist/**',
    '--glob', '!*.local.json',
    '--glob', '!*.log'
  ];

  for (const pattern of patterns) {
    const result = spawnSync('rg', ['-l', ...globArgs, pattern, ...changed], {
      cwd: root,
      encoding: 'utf8',
      shell: false
    });
    if (result.status === 0 && String(result.stdout || '').trim()) {
      return { status: 1, changed_files: changed.length, pattern };
    }
    if (![0, 1].includes(result.status)) {
      return { status: result.status ?? 1, changed_files: changed.length, pattern, tool: 'rg' };
    }
  }

  return { status: 0, changed_files: changed.length };
}

function printPlan() {
  console.log('WebDev Gate R evidence runner');
  console.log('=============================');
  console.log('Default mode is plan-only. Run with `npm run webdev:prod:evidence -- --run` to execute.');
  console.log('The runner records command status and duration only; it does not store raw command output.');
  console.log('Output summary path: .wrangler/webdev-gate-r-evidence-summary.json');
  console.log('');
  console.log('Planned evidence commands:');
  for (const command of evidenceCommands) {
    console.log(`- ${command.display}`);
  }
  console.log('- changed-files sensitive pattern scan');
  console.log('');
  console.log('No prod deploy, GitHub Release, CWS submission, desktop packaging, signing, or replay enablement is part of this plan.');
}

function runCommand(command) {
  const startedAt = new Date();
  const startedMs = Date.now();
  console.log(`\n>>> ${command.display}`);
  const needsShell = process.platform === 'win32' && /\.cmd$/i.test(command.command);
  const result = spawnSync(command.command, command.args, {
    cwd: root,
    stdio: 'inherit',
    shell: needsShell
  });
  const durationMs = Date.now() - startedMs;
  const summary = {
    id: command.id,
    command: command.display,
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    exit_code: result.status ?? 1
  };
  if (result.error?.code) {
    summary.error_code = result.error.code;
  }
  return summary;
}

assertSafeCommandPlan();

const branch = git(['branch', '--show-current'], 'unknown');
const commit = git(['rev-parse', 'HEAD'], 'unknown');
const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], 'unknown');
const upstreamCommit = git(['rev-parse', '@{u}'], 'unknown');
const statusShort = git(['status', '--short']);
const upstreamSynced = commit !== 'unknown' && commit === upstreamCommit;

if (!runMode) {
  printPlan();
  process.exit(0);
}

if (statusShort && !allowDirty) {
  console.error('Working tree is not clean. Commit readiness changes first, or pass --allow-dirty for a local rehearsal.');
  process.exit(1);
}

if (!upstreamSynced && !allowUnpushed) {
  console.error('HEAD does not match upstream. Push or pull WebDev first, or pass --allow-unpushed for a local rehearsal.');
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

const startedAt = new Date();
const results = [];
let failed = false;

for (const command of evidenceCommands) {
  const result = runCommand(command);
  results.push(result);
  if (result.exit_code !== 0) {
    failed = true;
    break;
  }
}

if (!failed) {
  console.log('\n>>> changed-files sensitive pattern scan');
  const startedMs = Date.now();
  const scan = runSensitivePatternScan();
  results.push({
    id: 'changed_files_sensitive_scan',
    command: 'changed-files sensitive pattern scan',
    started_at: new Date().toISOString(),
    duration_ms: Date.now() - startedMs,
    exit_code: scan.status,
    changed_files: scan.changed_files
  });
  if (scan.status !== 0) failed = true;
}

const summary = {
  schema: 'timewhere-webdev-gate-r-evidence-v1',
  generated_at: new Date().toISOString(),
  branch,
  commit,
  upstream,
  upstream_commit: upstreamCommit,
  upstream_synced: upstreamSynced,
  working_tree_clean_at_start: statusShort.length === 0,
  started_at: startedAt.toISOString(),
  completed_at: new Date().toISOString(),
  result: failed ? 'failed' : 'passed',
  privacy_note: 'Raw command output is not stored. Do not commit this local evidence summary.',
  release_boundary: 'Internal prod verification may use already provisioned prod resources. No public release, GitHub Release, tag, CWS submission, desktop package/signing/distribution, or replay enablement is performed by this runner.',
  commands: results
};

fs.writeFileSync(outputFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`\nEvidence summary written to ${path.relative(root, outputFile)}`);

if (failed) {
  console.error('One or more evidence commands failed. See terminal output and local summary for status only.');
  process.exit(1);
}

console.log('All Gate R evidence commands passed.');
