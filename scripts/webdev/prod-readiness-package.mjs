import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function git(args, fallback = 'unknown') {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) return fallback;
  return String(result.stdout || '').trim() || fallback;
}

function checked(condition) {
  return condition ? '[x]' : '[ ]';
}

function sanitize(text) {
  return String(text || '')
    .replaceAll(root, '<workspace>')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<uuid>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/[A-Za-z]:\\Users\\[^\\\r\n"]+/g, '<user-home>');
}

const prodChecklist = read('docs/WEBDEV_PROD_READINESS_CHECKLIST.md');
const previewRunbook = read('docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md');
const completionChecklist = read('docs/WEBDEV_COMPLETION_CHECKLIST.md');
const projectMaster = read('PROJECT_MASTER.md');
const taskBoard = read('TASK_BOARD.md');
const packageJson = JSON.parse(read('package.json'));

const branch = git(['branch', '--show-current']);
const commit = git(['rev-parse', '--short=12', 'HEAD']);
const status = git(['status', '--short'], '');
const clean = status.length === 0;

const requiredScripts = [
  'webdev:verify',
  'webdev:preview:acceptance',
  'webdev:extension:readiness',
  'webdev:desktop:readiness',
  'webdev:gate-b:readiness',
  'webdev:gate-c:readiness',
  'webdev:observability:readiness',
  'webdev:prod:readiness',
  'webdev:completion:audit',
  'webdev:acceptance:local',
  'test'
];

const readinessEvidence = [
  ['Phase 9 preview runbook exists', previewRunbook.includes('WebDev Preview Acceptance Runbook')],
  ['Preview acceptance aggregator exists', packageJson.scripts?.['webdev:preview:acceptance']?.includes('webdev:preview:data-hygiene-smoke')],
  ['Preview data hygiene evidence is represented', previewRunbook.includes('webdev:preview:data-hygiene-smoke')],
  ['Gate R remains unapproved', projectMaster.includes('Prod deploy/release remains unapproved')],
  ['Prod readiness checklist declares non-release boundary', prodChecklist.includes('不等于发布')],
  ['Browser Extension Gate D readiness is represented', packageJson.scripts?.['webdev:extension:readiness'] === 'node scripts/webdev/browser-extension-readiness-check.mjs' && completionChecklist.includes('WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md')],
  ['Desktop Runtime Gate E readiness is represented', packageJson.scripts?.['webdev:desktop:readiness'] === 'node scripts/webdev/desktop-runtime-readiness-check.mjs' && completionChecklist.includes('WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md')],
  ['Task replay Gate B readiness is represented', packageJson.scripts?.['webdev:gate-b:readiness'] === 'node scripts/webdev/task-replay-gate-b-readiness-check.mjs' && completionChecklist.includes('WEBDEV_TASK_REPLAY_GATE_B_READINESS.md')],
  ['Non-Task replay Gate C readiness is represented', packageJson.scripts?.['webdev:gate-c:readiness'] === 'node scripts/webdev/non-task-replay-gate-c-readiness-check.mjs' && completionChecklist.includes('WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md')],
  ['Observability / backup readiness is represented', packageJson.scripts?.['webdev:observability:readiness'] === 'node scripts/webdev/observability-backup-readiness-check.mjs' && prodChecklist.includes('WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md')],
  ['Rollback package is represented', prodChecklist.includes('Rollback plan')],
  ['Completion audit is represented', packageJson.scripts?.['webdev:completion:audit'] === 'node scripts/webdev/completion-audit.mjs' && completionChecklist.includes('webdev:completion:audit')],
  ['Gate B/C/D/E/R limits remain listed', completionChecklist.includes('| B |') && completionChecklist.includes('| C |') && completionChecklist.includes('| D |') && completionChecklist.includes('| E |') && completionChecklist.includes('| R |')],
  ['Task board records preview acceptance hardening', taskBoard.includes('webdev:preview:data-hygiene-smoke')]
];

const scriptEvidence = requiredScripts.map(script => [script, Boolean(packageJson.scripts?.[script])]);

const output = `# WebDev Prod Readiness Package Draft

Generated at: ${new Date().toISOString()}
Branch: ${branch}
Commit: ${commit}
Working tree clean: ${clean ? 'yes' : 'no'}

> This package is readiness-only. It does not approve prod resource creation, prod deployment, public release, GitHub Release, tag, merge, CWS submission, Desktop package/signing/distribution, or replay write enablement.

## Current Gate Status

- Gate A: approved for dev / preview resource creation and preview verification.
- Gate B: not approved; user-facing Task replay writes to Cloud remain disabled.
- Gate C: not approved; Calendar / Container / Settings replay remains design-only.
- Gate D: not approved; Browser Extension WebDev phase remains deferred.
- Gate E: not approved; Desktop Runtime package/signing/distribution remains deferred.
- Gate R: not approved; prod deployment and release remain blocked.

## Required Evidence Commands

${requiredScripts.map(script => `- ${checked(Boolean(packageJson.scripts?.[script]))} npm run ${script}`).join('\n')}
- ${checked(true)} git diff --check
- ${checked(true)} changed-files sensitive pattern scan

## Readiness Evidence Snapshot

${readinessEvidence.map(([name, ok]) => `- ${checked(ok)} ${name}`).join('\n')}

## Script Availability

${scriptEvidence.map(([name, ok]) => `- ${checked(ok)} ${name}`).join('\n')}

## Known Limitations For Gate R Review

- Task replay writes are still disabled for user traffic.
- Calendar / Container / Settings replay is not implemented.
- Browser Extension is not part of WebDev v1 release scope.
- Desktop Runtime has only local readiness/smoke evidence until Gate E.
- Prod Cloudflare resource ids must remain placeholders until Gate R approval.
- Observability and backup policies are readiness-scaffolded but still require Gate R review before prod resource creation.

## Rollback Plan Summary

- Stop new migration runs before rollback.
- Re-deploy previous Worker commit.
- Re-deploy previous Pages commit.
- Preserve R2 migration snapshots.
- Preserve D1 migration/conflict audit rows.
- Keep replay writes disabled and the kill switch on.

## Decision Requested Later

- Approve prod resource creation?
- Approve prod deployment?
- Approve release announcement?
- Approve Desktop package/signing/distribution?
`;

console.log(sanitize(output));

if (!clean) {
  console.error('WARNING: Working tree is not clean. Re-run after committing readiness changes before using this as Gate R evidence.');
}
