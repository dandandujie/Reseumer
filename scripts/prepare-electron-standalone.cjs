const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const NEXT_DIR = path.join(ROOT, '.next');
const STANDALONE_DIR = path.join(NEXT_DIR, 'standalone');
const DESKTOP_APP_DIR = path.join(ROOT, '.desktop-app');
const DESKTOP_PACKAGE_NAME = 'reseumer-desktop-runtime';

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

function copyDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true, dereference: true });
}

function writeDesktopPackageJson() {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const desktopPackage = {
    name: DESKTOP_PACKAGE_NAME,
    version: rootPackage.version,
    description: rootPackage.description,
    author: rootPackage.author,
    private: true,
    main: 'electron/main.cjs',
  };

  fs.writeFileSync(
    path.join(DESKTOP_APP_DIR, 'package.json'),
    `${JSON.stringify(desktopPackage, null, 2)}\n`,
    'utf8',
  );
}

function writeElectronBuilderConfig() {
  const electronPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8'));
  const config = {
    appId: 'com.reseumer.desktop',
    productName: 'Reseumer',
    electronVersion: electronPackage.version,
    asar: false,
    disableDefaultIgnoredFiles: true,
    npmRebuild: false,
    directories: {
      output: '../release',
      buildResources: '../build',
    },
    icon: 'icon.png',
    files: [
      'electron/**/*',
      '.next/standalone/**/*',
      'package.json',
    ],
    mac: {
      category: 'public.app-category.productivity',
      icon: 'icon.icns',
      target: ['dmg', 'zip'],
    },
    win: {
      icon: 'icon.ico',
      target: ['nsis', 'zip'],
    },
  };

  fs.writeFileSync(
    path.join(DESKTOP_APP_DIR, 'electron-builder.json'),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  );
}

function main() {
  ensureExists(STANDALONE_DIR, 'Next standalone output');
  ensureExists(path.join(NEXT_DIR, 'static'), 'Next static assets');
  ensureExists(path.join(ROOT, 'public'), 'public directory');
  ensureExists(path.join(ROOT, 'drizzle'), 'drizzle migrations');
  ensureExists(path.join(ROOT, 'electron'), 'electron directory');

  fs.rmSync(DESKTOP_APP_DIR, { recursive: true, force: true });

  copyDir(STANDALONE_DIR, path.join(DESKTOP_APP_DIR, '.next', 'standalone'));
  copyDir(path.join(NEXT_DIR, 'static'), path.join(DESKTOP_APP_DIR, '.next', 'standalone', '.next', 'static'));
  copyDir(path.join(ROOT, 'public'), path.join(DESKTOP_APP_DIR, '.next', 'standalone', 'public'));
  copyDir(path.join(ROOT, 'drizzle'), path.join(DESKTOP_APP_DIR, '.next', 'standalone', 'drizzle'));
  copyDir(path.join(ROOT, 'electron'), path.join(DESKTOP_APP_DIR, 'electron'));
  writeDesktopPackageJson();
  writeElectronBuilderConfig();

  console.log('[desktop:prepare] Created isolated desktop app in .desktop-app');
}

main();
