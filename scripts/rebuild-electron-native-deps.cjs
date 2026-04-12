const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const DESKTOP_APP_DIR = path.join(ROOT, '.desktop-app');
const STANDALONE_RUNTIME_DIR = path.join(DESKTOP_APP_DIR, '.next', 'standalone');
const STANDALONE_NODE_MODULES = path.join(STANDALONE_RUNTIME_DIR, 'node_modules');
const TRACED_NODE_MODULES = path.join(STANDALONE_RUNTIME_DIR, '.next', 'node_modules');
const NATIVE_PACKAGES = ['better-sqlite3'];

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

function resolveStandalonePackageSource(pkg) {
  const source = path.join(ROOT, 'node_modules', ...pkg.split('/'));
  ensureExists(source, `${pkg} source package`);
  return source;
}

function materializeStandalonePackage(pkg) {
  const target = path.join(STANDALONE_NODE_MODULES, ...pkg.split('/'));
  const source = resolveStandalonePackageSource(pkg);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true, dereference: true });

  return target;
}

function resolveElectronVersion() {
  const electronPackagePath = path.join(ROOT, 'node_modules', 'electron', 'package.json');
  const electronPackage = JSON.parse(fs.readFileSync(electronPackagePath, 'utf8'));
  return electronPackage.version;
}

function resolveNodeGypCli() {
  const cliPath = path.join(
    ROOT,
    'node_modules',
    '.pnpm',
    'node-gyp@11.5.0',
    'node_modules',
    'node-gyp',
    'bin',
    'node-gyp.js',
  );

  ensureExists(cliPath, 'node-gyp CLI');
  return cliPath;
}

function buildElectronEnv(electronVersion) {
  const arch = process.arch === 'arm' ? 'armv7l' : process.arch;
  const env = {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_arch: arch,
    npm_config_target_arch: arch,
    npm_config_platform: process.platform,
    npm_config_target_platform: process.platform,
    npm_config_build_from_source: 'true',
    npm_config_update_binary: 'true',
    npm_config_fallback_to_build: 'true',
    npm_config_disturl: process.env.npm_config_electron_mirror || 'https://electronjs.org/headers',
    npm_config_devdir: path.join(os.homedir(), '.electron-gyp'),
  };

  if (process.platform === 'win32' || process.platform === 'darwin') {
    env.npm_config_target_libc = 'unknown';
  }

  return env;
}

function syncTracedPackageCopies(pkg, sourceDir) {
  if (!fs.existsSync(TRACED_NODE_MODULES)) {
    return;
  }

  const packageLeafName = pkg.split('/').at(-1);
  const entries = fs
    .readdirSync(TRACED_NODE_MODULES)
    .filter((entry) => entry === packageLeafName || entry.startsWith(`${packageLeafName}-`));

  for (const entry of entries) {
    const target = path.join(TRACED_NODE_MODULES, entry);
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(sourceDir, target, { recursive: true, force: true, dereference: true });
  }
}

function rebuildNativePackages() {
  ensureExists(DESKTOP_APP_DIR, 'desktop app directory');
  ensureExists(STANDALONE_RUNTIME_DIR, 'desktop standalone runtime');
  ensureExists(STANDALONE_NODE_MODULES, 'desktop standalone node_modules');

  for (const pkg of NATIVE_PACKAGES) {
    materializeStandalonePackage(pkg);
  }

  const electronVersion = resolveElectronVersion();
  const nodeGypCli = resolveNodeGypCli();

  for (const pkg of NATIVE_PACKAGES) {
    const from = materializeStandalonePackage(pkg);
    const rebuildResult = spawnSync(process.execPath, [nodeGypCli, 'rebuild', '--release'], {
      cwd: from,
      stdio: 'inherit',
      env: buildElectronEnv(electronVersion),
    });

    if (rebuildResult.status !== 0) {
      throw new Error(`Electron native dependency rebuild failed for ${pkg} with code ${rebuildResult.status}`);
    }

    ensureExists(from, `${pkg} runtime package`);
    syncTracedPackageCopies(pkg, from);
  }
}

rebuildNativePackages();
