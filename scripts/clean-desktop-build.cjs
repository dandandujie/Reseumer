const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const RELEASE_DIR = path.join(ROOT, 'release');

fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
console.log('[desktop:clean] Removed release directory');
