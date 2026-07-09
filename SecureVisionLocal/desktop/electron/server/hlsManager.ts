import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { FFMPEG_PATH } from '../core/ffmpegPath';
import { hwaccelArgs } from '../core/hwaccel';
import { injectCredentials } from '../core/onvifInfo';
import { isSafeStreamUrl } from '../core/urlGuard';
import { insertCameraLog } from '../core/cameraLogger';
import type { Camera } from '../../src/shared/types';
import { getDataDir } from '../core/paths';

const IDLE_TIMEOUT_MS = 30_000; // encerra a sessão após 30s sem acessos

interface HlsSession {
  cameraId: string;
  cameraName: string;
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

    if (!isSafeStreamUrl(camera.streamUrl)) {
      insertCameraLog(
        camera.id,
        camera.name,
        'error',
        `URL inválida para HLS em "${camera.name}"`,
        `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nURL rejeitada: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nA URL do stream foi rejeitada pelo validador de segurança (isSafeStreamUrl). Edite a câmera com uma URL válida para que o streaming HLS funcione no app mobile.`,
        'hls',
      );
      return dir;
    }

    const playlist = join(dir, 'index.m3u8');
    const args = [
      ...hwaccelArgs(),
      '-rtsp_transport', 'tcp',
      '-i', injectCredentials(camera.streamUrl, camera.username, camera.password),
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
    ffmpeg.on('error', (err) => {
      insertCameraLog(
        camera.id,
        camera.name,
        'error',
        `Falha ao iniciar stream HLS para "${camera.name}"`,
        `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nUsuário: ${camera.username || '—'}\nURL: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nErro FFmpeg: ${err?.message || 'Erro desconhecido'}\n\nO stream HLS (para app mobile/navegador) não pôde ser iniciado. Verifique se a câmera está acessível.`,
        'hls',
      );
      this.stopSession(camera.id);
    });
    ffmpeg.on('close', () => {
      if (this.sessions.get(camera.id)?.ffmpeg === ffmpeg) {
        insertCameraLog(
          camera.id,
          camera.name,
          'warn',
          `Stream HLS encerrado inesperadamente para "${camera.name}"`,
          `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nURL: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nO processo FFmpeg do HLS fechou sozinho. Uma nova sessão será criada na próxima solicitação do app mobile/navegador.`,
          'hls',
        );
        this.sessions.delete(camera.id);
      }
    });

    this.sessions.set(camera.id, { cameraId: camera.id, cameraName: camera.name, dir, ffmpeg, lastAccess: Date.now() });
    insertCameraLog(
      camera.id,
      camera.name,
      'info',
      `Stream HLS para "${camera.name}" iniciado`,
      `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nUsuário: ${camera.username || '—'}\nURL: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nDiretório HLS: ${dir}\nPlaylist: index.m3u8\nSegmentos: 2s, máx 6 no playlist\n\nO stream HLS foi iniciado com sucesso para acesso pelo app mobile/navegador.`,
      'hls',
    );
    return dir;
  }

  touch(cameraId: string): void {
    const s = this.sessions.get(cameraId);
    if (s) s.lastAccess = Date.now();
  }

  stopSession(cameraId: string): void {
    const s = this.sessions.get(cameraId);
    if (!s) return;
    const cameraName = s.cameraName;
    this.sessions.delete(cameraId);
    insertCameraLog(
      cameraId,
      cameraName,
      'info',
      `Sessão HLS para "${cameraName}" encerrada`,
      `Câmera: ${cameraName}\nID: ${cameraId}\n\nA sessão de streaming HLS foi encerrada (inatividade ou parada intencional).`,
      'hls',
    );
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
      if (now - s.lastAccess > IDLE_TIMEOUT_MS) {
        insertCameraLog(
          id,
          s.cameraName,
          'info',
          `Sessão HLS de "${s.cameraName}" removida por inatividade (${Math.round((now - s.lastAccess) / 1000)}s ociosa)`,
          `Câmera: ${s.cameraName}\nID: ${id}\nTempo ocioso: ${Math.round((now - s.lastAccess) / 1000)}s\nLimite: ${IDLE_TIMEOUT_MS / 1000}s\n\nA sessão HLS foi encerrada por idle timeout — ninguém acessava o stream há mais de 30s. Uma nova sessão será criada automaticamente na próxima solicitação.`,
          'hls',
        );
        this.stopSession(id);
      }
    }
  }
}

export const hlsManager = new HlsManager();
