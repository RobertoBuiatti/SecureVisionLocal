import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { FFMPEG_PATH } from '../core/ffmpegPath';
import { hwaccelArgs } from '../core/hwaccel';
import { isSafeStreamUrl } from '../core/urlGuard';
import type { Camera } from '../../src/shared/types';
import { getDataDir } from '../core/paths';

const IDLE_TIMEOUT_MS = 30_000; // encerra a sessão após 30s sem acessos

interface HlsSession {
  cameraId: string;
  dir: string;
  ffmpeg: ChildProcess;
  lastAccess: number;
}

// Gera HLS (m3u8 + .ts) sob demanda a partir do RTSP, para players móveis/navegador.
// Sessões inativas são encerradas automaticamente para poupar CPU.
export class HlsManager {
  private sessions = new Map<string, HlsSession>();
  private sweeper: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (!this.sweeper) {
      this.sweeper = setInterval(() => this.sweepIdle(), 10_000);
    }
  }

  stop(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
    for (const id of Array.from(this.sessions.keys())) this.stopSession(id);
  }

  baseDir(cameraId: string): string {
    return join(getDataDir(), 'hls', cameraId);
  }

  // Garante a sessão ativa e devolve o diretório onde o playlist é escrito.
  ensureSession(camera: Camera): string {
    const existing = this.sessions.get(camera.id);
    if (existing) {
      existing.lastAccess = Date.now();
      return existing.dir;
    }

    const dir = this.baseDir(camera.id);
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* noop */
      }
    }
    mkdirSync(dir, { recursive: true });

    if (!isSafeStreamUrl(camera.streamUrl)) return dir; // URL inválida → sem sessão

    const playlist = join(dir, 'index.m3u8');
    const args = [
      ...hwaccelArgs(),
      '-rtsp_transport', 'tcp',
      '-i', camera.streamUrl,
      '-an',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-g', '25',
      '-sc_threshold', '0',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+append_list+omit_endlist',
      '-hls_segment_filename', join(dir, 'seg_%05d.ts'),
      playlist,
    ];

    const ffmpeg = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    ffmpeg.on('error', () => {
      this.stopSession(camera.id);
    });
    ffmpeg.on('close', () => {
      if (this.sessions.get(camera.id)?.ffmpeg === ffmpeg) {
        this.sessions.delete(camera.id);
      }
    });

    this.sessions.set(camera.id, { cameraId: camera.id, dir, ffmpeg, lastAccess: Date.now() });
    return dir;
  }

  touch(cameraId: string): void {
    const s = this.sessions.get(cameraId);
    if (s) s.lastAccess = Date.now();
  }

  stopSession(cameraId: string): void {
    const s = this.sessions.get(cameraId);
    if (!s) return;
    this.sessions.delete(cameraId);
    try {
      s.ffmpeg.kill('SIGKILL');
    } catch {
      /* noop */
    }
    try {
      rmSync(s.dir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  }

  private sweepIdle(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.lastAccess > IDLE_TIMEOUT_MS) this.stopSession(id);
    }
  }
}

export const hlsManager = new HlsManager();
