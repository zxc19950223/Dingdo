const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MEDIA_ACTIONS = new Set(['play', 'pause', 'toggle', 'next', 'previous']);

function normalizeMediaStatus(value) {
  const source = value && typeof value === 'object' ? value : {};
  const artworkBase64 = typeof source.artworkBase64 === 'string' ? source.artworkBase64 : '';
  const artworkMime = typeof source.artworkMime === 'string' && source.artworkMime
    ? source.artworkMime
    : 'image/jpeg';
  return {
    available: source.ok === true && source.ready !== true,
    active: source.active === true,
    playing: Number(source.playbackState) === 1 || (
      source.playbackState == null && source.playing === true
    ),
    pid: Math.max(0, Math.round(Number(source.pid) || 0)),
    appName: String(source.appName || '').trim(),
    bundleId: String(source.bundleId || '').trim(),
    appPath: String(source.appPath || '').trim(),
    title: String(source.title || '').trim(),
    artist: String(source.artist || '').trim(),
    album: String(source.album || '').trim(),
    duration: Math.max(0, Number(source.duration) || 0),
    elapsed: Math.max(0, Number(source.elapsed) || 0),
    playbackRate: Number(source.playbackRate) || 0,
    volume: Number.isFinite(Number(source.volume))
      ? Math.max(0, Math.min(100, Number(source.volume)))
      : 50,
    artwork: artworkBase64 ? `data:${artworkMime};base64,${artworkBase64}` : '',
  };
}

class MediaSessionService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.helperPath = options.helperPath || path.join(__dirname, 'build', 'media-session-helper');
    this.enabled = process.platform === 'darwin' && fs.existsSync(this.helperPath);
    this.child = null;
    this.buffer = '';
    this.pending = [];
    this.queue = Promise.resolve();
    this.status = normalizeMediaStatus({});
    this.restarts = 0;
    this.stopping = false;
  }

  isAvailable() {
    return this.enabled;
  }

  start() {
    if (!this.enabled || this.child) return;
    this.stopping = false;
    this.child = spawn(this.helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.consume(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', () => {});
    this.child.on('close', () => {
      const wasStopping = this.stopping;
      this.child = null;
      const pending = this.pending.splice(0);
      pending.forEach((request) => request.reject(new Error('media_helper_closed')));
      if (!wasStopping && this.restarts < 3) {
        this.restarts += 1;
        setTimeout(() => this.start(), 500 * this.restarts);
      }
    });
    this.child.on('error', () => {
      this.enabled = false;
    });
  }

  consume(chunk) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        let parsed = null;
        try { parsed = JSON.parse(line); } catch (error) {}
        if (parsed?.ready) {
          while (this.pending.length && this.pending[0].command === '__ready__') {
            this.pending.shift().resolve({ ok: true });
          }
        } else {
          const request = this.pending.shift();
          if (request) request.resolve(parsed);
        }
      }
      newline = this.buffer.indexOf('\n');
    }
  }

  write(command) {
    if (!this.child?.stdin?.writable) {
      this.start();
      return Promise.reject(new Error('media_helper_unavailable'));
    }
    return new Promise((resolve, reject) => {
      this.pending.push({ command, resolve, reject });
      this.child.stdin.write(`${command}\n`);
    });
  }

  run(command) {
    const task = () => this.write(command);
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => {});
    return result;
  }

  async getStatus() {
    if (!this.enabled) return normalizeMediaStatus({});
    const response = await this.run('status').catch(() => null);
    if (response?.ok) {
      this.status = normalizeMediaStatus(response);
      this.emit('status', this.status);
    }
    return this.status;
  }

  async control(action) {
    if (!this.enabled || !MEDIA_ACTIONS.has(action)) {
      return { ok: false, error: 'unsupported' };
    }
    const response = await this.run(action).catch(() => null);
    if (!response?.ok) return { ok: false, error: 'control_failed' };
    await new Promise((resolve) => setTimeout(resolve, 250));
    const status = await this.getStatus();
    return { ok: true, status };
  }

  async activateCurrentPlayer() {
    if (!this.enabled) return { ok: false, error: 'unsupported' };
    const response = await this.run('activate').catch(() => null);
    return response?.ok ? { ok: true } : { ok: false, error: 'activate_failed' };
  }

  async setSystemVolume(volume) {
    if (!this.enabled) return { ok: false, error: 'unsupported' };
    const value = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)));
    const response = await this.run(`volume:${value}`).catch(() => null);
    return response?.ok ? { ok: true, volume: value } : { ok: false, error: 'volume_failed' };
  }

  async seek(positionSeconds) {
    if (!this.enabled) return { ok: false, error: 'unsupported' };
    const position = Math.max(0, Number(positionSeconds) || 0);
    const response = await this.run(`seek:${position}`).catch(() => null);
    if (!response?.ok) return { ok: false, error: 'seek_failed' };
    await new Promise((resolve) => setTimeout(resolve, 350));
    const status = await this.getStatus();
    const applied = Math.abs(Number(status.elapsed) - position) <= 3;
    return applied
      ? { ok: true, position }
      : { ok: false, error: 'seek_unsupported' };
  }

  stop() {
    this.stopping = true;
    if (this.child?.stdin?.writable) this.child.stdin.write('quit\n');
    if (this.child) this.child.kill();
    this.child = null;
  }
}

module.exports = {
  MediaSessionService,
  normalizeMediaStatus,
  MEDIA_ACTIONS,
};
