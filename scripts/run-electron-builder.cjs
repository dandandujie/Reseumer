const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const DESKTOP_APP_DIR = path.join(ROOT, '.desktop-app');
const CONFIG_PATH = path.join(DESKTOP_APP_DIR, 'electron-builder.json');
const BUILDER_CLI_PATH = path.join(ROOT, 'node_modules', 'electron-builder', 'cli.js');

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

function main() {
  ensureExists(DESKTOP_APP_DIR, 'desktop app directory');
  ensureExists(CONFIG_PATH, 'electron-builder config');
  ensureExists(BUILDER_CLI_PATH, 'electron-builder CLI');

  const result = spawnSync(
    process.execPath,
    [BUILDER_CLI_PATH, '--projectDir', DESKTOP_APP_DIR, '--config', CONFIG_PATH, ...process.argv.slice(2)],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    throw new Error(`electron-builder failed with code ${result.status}`);
  }
}

main();
