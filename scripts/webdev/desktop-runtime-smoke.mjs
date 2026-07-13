import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

const rootDir = process.cwd();
const workerPort = 8787;
const pagesPort = 4173;
const persistTo = `.wrangler/desktop-runtime-smoke-state-${process.pid}-${Date.now()}`;
const sessionBearer = process.env.TIMEWHERE_LOCAL_SESSION_BEARER || 'timewhere-local-dev-session';

function command(name) {
  return name;
}

function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') reject(new Error(`Port ${port} is already in use. Stop the local WebDev service using it and retry.`));
      else reject(error);
    });
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function runPrepare() {
  execFileSync(command('npm'), ['run', 'webdev:local:prepare'], {
    cwd: rootDir,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TIMEWHERE_WRANGLER_PERSIST_TO: persistTo,
      TIMEWHERE_LOCAL_SESSION_BEARER: sessionBearer
    }
  });
}

function startProcess(label, commandName, args, cwd, extraEnv = {}) {
  const child = spawn(command(commandName), args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', ...extraEnv }
  });
  const logs = [];
  child.stdout.on('data', chunk => logs.push(String(chunk)));
  child.stderr.on('data', chunk => logs.push(String(chunk)));
  child.once('exit', code => {
    if (!child.stopping && code !== null && code !== 0) {
      console.error(`[${label}] exited with ${code}\n${logs.join('').slice(-4000)}`);
    }
  });
  child.logs = logs;
  child.label = label;
  return child;
}

async function stopProcess(child) {
  if (!child || child.killed) return;
  child.stopping = true;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      return;
    } catch {
      // Fall through to cross-platform kill.
    }
  }
  child.kill('SIGTERM');
}

async function waitForUrl(url, child, label) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < 60000) {
    if (child?.exitCode !== null) {
      throw new Error(`${label} exited early (${child.exitCode}). Logs:\n${child.logs.join('').slice(-4000)}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}: ${lastError?.message || 'unknown'}\n${child?.logs?.join('').slice(-4000) || ''}`);
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.stopping = true;
      reject(new Error(`${child.label} did not exit within ${timeoutMs}ms.\n${child.logs.join('').slice(-4000)}`));
    }, timeoutMs);
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${child.label} exited with ${code}.\n${child.logs.join('').slice(-4000)}`));
    });
  });
}

async function main() {
  console.log('WebDev Desktop Runtime smoke');
  console.log('============================');
  await assertPortFree(workerPort);
  await assertPortFree(pagesPort);
  runPrepare();
  console.log('  PASS local D1 prepared for desktop runtime smoke');

  const worker = startProcess('worker', 'npx', [
    'wrangler',
    'dev',
    '--ip',
    '127.0.0.1',
    '--port',
    String(workerPort),
    '--local',
    '--local-protocol',
    'http',
    '--persist-to',
    persistTo,
    '--show-interactive-dev-session=false',
    '--log-level',
    'error'
  ], `${rootDir}/workers`, { TIMEWHERE_WRANGLER_PERSIST_TO: persistTo });

  const pages = startProcess('pages', 'npm', [
    '--prefix',
    'pages',
    'run',
    'dev',
    '--',
    '--host',
    '127.0.0.1'
  ], rootDir);

  let electron;
  try {
    await waitForUrl(`http://127.0.0.1:${workerPort}/health`, worker, 'local Worker');
    console.log('  PASS local Worker ready');
    await waitForUrl(`http://127.0.0.1:${pagesPort}`, pages, 'local Pages dev server');
    console.log('  PASS local Pages ready');

    electron = startProcess('electron-webdev-runtime', 'npm', [
      '--prefix',
      'platforms/desktop-electron',
      'start'
    ], rootDir, {
      TIMEWHERE_ELECTRON_SMOKE: '1',
      TIMEWHERE_DESKTOP_RUNTIME_MODE: 'webdev',
      TIMEWHERE_WEB_APP_URL: `http://127.0.0.1:${pagesPort}/`
    });
    await waitForExit(electron, 30000);
    console.log('  PASS Electron loaded WebDev Runtime mode and exited smoke cleanly');
    console.log('============================');
    console.log('All WebDev Desktop Runtime smoke checks passed.');
  } finally {
    await Promise.allSettled([stopProcess(electron), stopProcess(pages), stopProcess(worker)]);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
