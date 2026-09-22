const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'darwin') {
  console.log('Media session helper is only built on macOS.');
  process.exit(0);
}

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build', 'media-session-helper');
const source = path.join(root, 'native', 'media-session-helper.m');
fs.mkdirSync(path.dirname(output), { recursive: true });

const result = spawnSync('clang', [
  '-fobjc-arc',
  '-framework', 'Foundation',
  '-framework', 'AppKit',
  '-framework', 'CoreAudio',
  '-ldl',
  '-O2',
  '-o', output,
  source,
], { stdio: 'inherit' });

if (result.status !== 0) process.exit(result.status || 1);
fs.chmodSync(output, 0o755);
console.log(`Built ${output}`);
