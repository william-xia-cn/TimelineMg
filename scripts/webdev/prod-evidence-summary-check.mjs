import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const summaryPath = path.join(root, '.wrangler', 'webdev-gate-r-evidence-summary.json');

const expectedCommandIds = [
  'webdev_verify',
  'preview_acceptance',
  'prod_acceptance',
  'extension_readiness',
  'desktop_readiness',
  'gate_b_readiness',
  'gate_c_readiness',
  'observability_readiness',
  'prod_readiness',
  'completion_audit',
  'local_acceptance',
  'npm_test',
  'git_diff_check',
  'changed_files_sensitive_scan'
];

const forbiddenRawOutputKeys = new Set([
  'stdout',
  'stderr',
  'output',
  'outputs',
  'log',
  'logs',
  'raw',
  'raw_output',
  'rawOutput'
]);

const forbiddenReleaseFragments = [
  'public release',
  'GitHub Release',
  'tag',
  'CWS submission',
  'desktop package/signing/distribution',
  'replay enablement'
];

const forbiddenSummaryCommandFragments = [
  ['wrangler', 'deploy'],
  ['pages', 'deploy'],
  ['gh', 'release'],
  ['git', 'push']
].map(parts => parts.join(' '));

let passed = 0;
let failed = 0;

function git(args, fallback = '') {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) return fallback;
  return String(result.stdout || '').trim();
}

function assert(description, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${description}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${description}`);
}

function readSummary() {
  if (!fs.existsSync(summaryPath)) {
    console.error('Gate R evidence summary is missing.');
    console.error('Run `npm run webdev:prod:evidence -- --run` after the WebDev branch is clean and synced.');
    process.exit(1);
  }

  try {
    return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch (error) {
    console.error(`Gate R evidence summary is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

function collectForbiddenKeys(value, trail = '$', found = []) {
  if (!value || typeof value !== 'object') return found;

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenKeys(entry, `${trail}[${index}]`, found));
    return found;
  }

  for (const [key, child] of Object.entries(value)) {
    const childTrail = `${trail}.${key}`;
    if (forbiddenRawOutputKeys.has(key)) {
      found.push(childTrail);
    }
    collectForbiddenKeys(child, childTrail, found);
  }
  return found;
}

function allCommandsPassed(commands) {
  return commands.every(command => command && command.exit_code === 0);
}

console.log('WebDev Gate R evidence summary check');
console.log('====================================');

const summary = readSummary();
const branch = git(['branch', '--show-current'], 'unknown');
const headCommit = git(['rev-parse', 'HEAD'], 'unknown');
const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], 'unknown');
const upstreamCommit = git(['rev-parse', '@{u}'], 'unknown');
const statusShort = git(['status', '--short']);
const commands = Array.isArray(summary.commands) ? summary.commands : [];
const commandIds = commands.map(command => command?.id);
const forbiddenRawKeys = collectForbiddenKeys(summary);

assert('summary uses Gate R evidence schema',
  summary.schema === 'timewhere-webdev-gate-r-evidence-v1');

assert('summary was generated for WebDev',
  summary.branch === 'WebDev' && branch === 'WebDev');

assert('summary commit matches current HEAD',
  summary.commit === headCommit && headCommit !== 'unknown');

assert('summary upstream is origin/WebDev',
  summary.upstream === 'origin/WebDev' && upstream === 'origin/WebDev');

assert('summary upstream commit matches current upstream',
  summary.upstream_commit === upstreamCommit && upstreamCommit !== 'unknown');

assert('summary records synced upstream and current HEAD is still synced',
  summary.upstream_synced === true && headCommit === upstreamCommit);

assert('summary was started from a clean worktree and current worktree is clean',
  summary.working_tree_clean_at_start === true && statusShort.length === 0);

assert('summary result passed',
  summary.result === 'passed');

assert('summary privacy note says raw command output is not stored',
  typeof summary.privacy_note === 'string'
    && summary.privacy_note.includes('Raw command output is not stored'));

assert('summary release boundary still forbids prod, release, desktop distribution, and replay enablement',
  typeof summary.release_boundary === 'string'
    && forbiddenReleaseFragments.every(fragment => summary.release_boundary.includes(fragment)));

assert('summary command list exactly matches required Gate R evidence order',
  commandIds.length === expectedCommandIds.length
    && expectedCommandIds.every((id, index) => commandIds[index] === id));

assert('every evidence command exited successfully',
  commands.length === expectedCommandIds.length && allCommandsPassed(commands));

const changedFilesScan = commands.find(command => command?.id === 'changed_files_sensitive_scan');
assert('changed-files sensitive scan ran against a clean commit',
  changedFilesScan?.exit_code === 0 && changedFilesScan?.changed_files === 0);

assert('summary stores no raw output fields',
  forbiddenRawKeys.length === 0);

assert('summary check is read-only and does not call Wrangler or release tooling',
  forbiddenSummaryCommandFragments.every(fragment => !JSON.stringify(summary).includes(fragment)));

console.log('====================================');
console.log(`Summary path: ${path.relative(root, summaryPath)}`);
console.log(`Branch: ${branch}`);
console.log(`Commit: ${headCommit}`);
console.log(`Upstream: ${upstream}`);
console.log(`Checks passed: ${passed}`);

if (failed > 0) {
  console.error(`\n${failed} Gate R evidence summary checks failed; ${passed} passed.`);
  console.error('Regenerate evidence on the current clean, pushed WebDev HEAD with `npm run webdev:prod:evidence -- --run`.');
  process.exit(1);
}

console.log('Gate R evidence summary matches current WebDev HEAD and remains status-only.');
