const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const NEXT_DIR = path.join(ROOT, '.next');
const STANDALONE_DIR = path.join(NEXT_DIR, 'standalone');

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

function copyDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true });
}

function main() {
  ensureExists(STANDALONE_DIR, 'Next standalone output');
  ensureExists(path.join(NEXT_DIR, 'static'), 'Next static assets');
  ensureExists(path.join(ROOT, 'public'), 'public directory');
  ensureExists(path.join(ROOT, 'drizzle'), 'drizzle migrations');

  copyDir(path.join(NEXT_DIR, 'static'), path.join(STANDALONE_DIR, '.next', 'static'));
  copyDir(path.join(ROOT, 'public'), path.join(STANDALONE_DIR, 'public'));
  copyDir(path.join(ROOT, 'drizzle'), path.join(STANDALONE_DIR, 'drizzle'));

  console.log('[desktop:prepare] Copied static assets, public files, and migrations into .next/standalone');
}

main();
