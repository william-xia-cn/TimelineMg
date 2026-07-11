import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('.wrangler/state/v3/d1');

if (!target.includes(`${resolve('.wrangler')}\\state\\v3\\d1`) && !target.includes(`${resolve('.wrangler')}/state/v3/d1`)) {
  throw new Error(`Refusing to remove unexpected path: ${target}`);
}

rmSync(target, { recursive: true, force: true });
console.log(`Removed local D1 state: ${target}`);
