const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, '..');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
function run(executable, args) {
  console.log(`Checking ${args.join(' ')}`);
  const result = spawnSync(executable, args, { cwd: root, env, stdio: 'inherit', timeout: 180000 });
  if (result.error) console.error(result.error);
  if (result.status !== 0) {
    if (env.TODO_TEST_LOG && fs.existsSync(env.TODO_TEST_LOG)) console.error(fs.readFileSync(env.TODO_TEST_LOG, 'utf8'));
    process.exit(result.status || 1);
  }
}
run(process.execPath, ['--test', ...fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.js')).map((name) => `tests/${name}`)]);
env.TODO_TEST_LOG = path.join(root, 'dist.noindex', 'windows-smoke', 'renderer-test.log');
fs.mkdirSync(path.dirname(env.TODO_TEST_LOG), { recursive: true });
fs.writeFileSync(env.TODO_TEST_LOG, '');
// notch-focus predates the removal of the legacy panels and still targets
// credentials/recordings controls that no longer exist. Keep it as historical
// coverage; the current renderer smoke tests below cover the shipped surfaces.
for (const file of ['retained-workspace', 'collapsed-visuals', 'strong-reminder', 'todo-block', 'todo-snooze-main', 'desktop-card', 'desktop-card-main', 'siri-import-main', 'report-export', 'startup']) {
  // These renderer-only checks depend on interactive compositor and
  // contextBridge behavior that GitHub's headless runners do not provide
  // consistently. They remain part of the local full test suite.
  if (process.env.CI && ['collapsed-visuals', 'strong-reminder', 'siri-import-main'].includes(file)) continue;
  const testProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-renderer-test-'));
  env.TODO_TEST_USER_DATA = testProfile;
  run(require('electron'), [`tests/${file}.electron.js`]);
  fs.rmSync(testProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
for (const file of ['main.js', 'main-services.js', 'media-session.js', 'browser-media.js', 'platform.js', 'report-export.js', 'preload.js', 'renderer/domain.js', 'renderer/theme.js', 'renderer/effects.js', 'renderer/app.js', 'renderer/todo.js', 'renderer/workspace.js', 'renderer/icon-motion.js', 'renderer/notification.js', 'renderer/strong-reminder.js', 'renderer/desktop-card.js', 'renderer/desktop-card-preload.js', 'build/afterPack.js', 'scripts/build-media-helper.js', 'scripts/codex-notify.js', 'scripts/claude-notify.js', 'scripts/smoke-app.js']) {
  run(process.execPath, ['--check', file]);
}
