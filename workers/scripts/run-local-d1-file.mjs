import { spawnSync } from 'node:child_process';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-local-d1-file.mjs <sql-file>');
  process.exit(1);
}

const args = ['wrangler', 'd1', 'execute', 'timewhere-dev-db', '--local', '--file', file];
if (process.env.TIMEWHERE_WRANGLER_PERSIST_TO) {
  args.push('--persist-to', process.env.TIMEWHERE_WRANGLER_PERSIST_TO);
}

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
});

process.exit(result.status ?? 1);
