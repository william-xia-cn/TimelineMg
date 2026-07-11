import { spawnSync } from 'node:child_process';

const args = ['wrangler', 'd1', 'migrations', 'apply', 'timewhere-dev-db', '--local'];
if (process.env.TIMEWHERE_WRANGLER_PERSIST_TO) {
  args.push('--persist-to', process.env.TIMEWHERE_WRANGLER_PERSIST_TO);
}

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' }
});

process.exit(result.status ?? 1);
