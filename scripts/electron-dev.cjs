const http = require('http');
const { spawn } = require('child_process');

const NEXT_PORT = 3000;
const NEXT_URL = `http://127.0.0.1:${NEXT_PORT}`;
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const SHARED_ENV = {
  ...process.env,
  NODE_ENV: 'development',
  APP_NAME: process.env.APP_NAME || 'JadeAI',
  AUTH_ENABLED: process.env.AUTH_ENABLED ?? 'false',
  AUTH_SECRET: process.env.AUTH_SECRET || 'jadeai-desktop-secret',
};

function waitForUrl(targetUrl, timeoutMs = 60_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const ping = () => {
      const request = http.get(targetUrl, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${targetUrl}`));
          return;
        }

        setTimeout(ping, 500);
      });

      request.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${targetUrl}`));
          return;
        }

        setTimeout(ping, 500);
      });
    };

    ping();
  });
}

function killTree(child) {
  if (!child || !child.pid) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // ignore
  }
}

async function main() {
  const nextProcess = spawn(
    PNPM,
    ['exec', 'next', 'dev', '--turbopack', '--hostname', '127.0.0.1', '--port', String(NEXT_PORT)],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: SHARED_ENV,
      detached: process.platform !== 'win32',
    }
  );

  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    killTree(nextProcess);
  };

  process.on('SIGINT', () => {
    shutdown();
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    shutdown();
    process.exit(143);
  });

  nextProcess.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      process.exit(code || 1);
    }
  });

  await waitForUrl(NEXT_URL);

  const electronProcess = spawn(PNPM, ['exec', 'electron', 'electron/main.cjs'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...SHARED_ENV,
      ELECTRON_RENDERER_URL: NEXT_URL,
      ELECTRON_DEV: 'true',
    },
  });

  electronProcess.on('exit', (code) => {
    shutdown();
    process.exit(code || 0);
  });
}

main().catch((error) => {
  console.error('[desktop:dev] Failed to start:', error);
  process.exit(1);
});
