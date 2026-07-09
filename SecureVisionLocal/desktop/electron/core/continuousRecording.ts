import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FFMPEG_PATH } from './ffmpegPath';
import { isSafeStreamUrl } from './urlGuard';
import type { Camera, Recording } from '../../src/shared/types';
import { getSettings } from './settings';
import {
  insertRecording,
  finalizeRecording,
  findByFilePath,
  listRecordingInProgress,
} from './recordingRepository';
import { injectCredentials } from './onvifInfo';

const SEGMENT_PREFIX = 'seg_';

interface ActiveContinuous {
  camera: Camera;
  dir: string;
  ffmpeg: ChildProcess;
}

function cameraDir(cameraId: string): string {
  const dir = join(getSettings().recordingsPath, cameraId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Extrai o instante de início a partir do nome seg_YYYYMMDD_HHMMSS.mp4
function parseSegmentTime(filename: string): number {
  const m = filename.match(/seg_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return Date.now();
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
}

// Gerencia a gravação contínua 24/7 por câmera, gravando em arquivos segmentados.
// A reciclagem (apagar os mais antigos) é responsabilidade do módulo de retenção.
export class ContinuousRecordingService {
  private active = new Map<string, ActiveContinuous>();

  isActive(cameraId: string): boolean {
    return this.active.has(cameraId);
  }

  start(camera: Camera): void {
    if (this.active.has(camera.id)) return;
    if (!isSafeStreamUrl(camera.streamUrl)) return;

    const dir = cameraDir(camera.id);
    const segmentSeconds = Math.max(1, getSettings().continuousSegmentMinutes) * 60;
    const pattern = join(dir, `${SEGMENT_PREFIX}%Y%m%d_%H%M%S.mp4`);

    const streamUrl = injectCredentials(camera.streamUrl, camera.username, camera.password);
    const args = [
      '-rtsp_transport', 'tcp',
      '-i', streamUrl,
      // Áudio opcional ("0:a?"): câmera sem áudio grava só o vídeo, sem erro.
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'copy', // vídeo sem reencode
      '-c:a', 'aac', // áudio p/ AAC (MP4 não aceita pcm_alaw com copy)
      '-f', 'segment',
      '-segment_time', String(segmentSeconds),
      '-segment_format', 'mp4',
      '-segment_format_options', 'movflags=+faststart',
      '-reset_timestamps', '1',
      '-strftime', '1',
      pattern,
    ];

    const ffmpeg = spawn(FFMPEG_PATH, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    ffmpeg.on('error', () => {
      if (this.active.get(camera.id)?.ffmpeg === ffmpeg) {
        this.active.delete(camera.id);
      }
    });
    ffmpeg.on('close', () => {
      // Se não foi parada intencional, o manager reinicia no próximo ciclo.
      if (this.active.get(camera.id)?.ffmpeg === ffmpeg) {
        this.active.delete(camera.id);
        this.finalizeOpenSegments(camera.id);
      }
    });

    this.active.set(camera.id, { camera, dir, ffmpeg });
  }

  stop(cameraId: string): void {
    const item = this.active.get(cameraId);
    if (!item) return;
    this.active.delete(cameraId);
    try {
      item.ffmpeg.stdin?.write('q');
    } catch {
      try {
        item.ffmpeg.kill('SIGINT');
      } catch {
        /* noop */
      }
    }
    // dá tempo do arquivo fechar e indexa o estado final
    setTimeout(() => this.syncCamera(cameraId, item.dir), 1500);
  }

  stopAll(): void {
    for (const id of Array.from(this.active.keys())) this.stop(id);
  }

  // Varre os diretórios das câmeras ativas e sincroniza os segmentos com o banco.
  sync(): void {
    for (const [cameraId, item] of this.active) {
      this.syncCamera(cameraId, item.dir);
    }
  }

  private syncCamera(cameraId: string, dir: string): void {
    if (!existsSync(dir)) return;
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(SEGMENT_PREFIX) && f.endsWith('.mp4'))
      .sort();
    if (files.length === 0) return;

    const item = this.active.get(cameraId);
    const cameraName = item?.camera.name;
    const lastFile = files[files.length - 1];

    files.forEach((file) => {
      const filePath = join(dir, file);
      let size = 0;
      let mtime = Date.now();
      try {
        const st = statSync(filePath);
        size = st.size;
        mtime = st.mtimeMs;
      } catch {
        return;
      }
      const isActiveSegment = file === lastFile && this.active.has(cameraId);
      const existing = findByFilePath(filePath);

      if (!existing) {
        const startTime = parseSegmentTime(file);
        const rec: Recording = {
          id: `rec_${randomUUID().slice(0, 8)}`,
          cameraId,
          cameraName,
          type: 'continuous',
          status: isActiveSegment ? 'recording' : 'completed',
          startTime,
          endTime: isActiveSegment ? null : Math.round(mtime),
          duration: isActiveSegment ? 0 : Math.max(0, Math.round((mtime - startTime) / 1000)),
          fileSize: size,
          filePath,
          hasMotion: false,
        };
        insertRecording(rec);
      } else if (existing.status === 'recording' && !isActiveSegment) {
        finalizeRecording(existing.id, {
          endTime: Math.round(mtime),
          duration: Math.max(0, Math.round((mtime - existing.startTime) / 1000)),
          fileSize: size,
          status: 'completed',
        });
      }
    });
  }

  // Finaliza no banco segmentos que ficaram 'recording' após o processo encerrar.
  private finalizeOpenSegments(cameraId: string): void {
    for (const rec of listRecordingInProgress(cameraId)) {
      let size = rec.fileSize;
      let mtime = Date.now();
      try {
        const st = statSync(rec.filePath);
        size = st.size;
        mtime = st.mtimeMs;
      } catch {
        /* arquivo pode não existir */
      }
      finalizeRecording(rec.id, {
        endTime: Math.round(mtime),
        duration: Math.max(0, Math.round((mtime - rec.startTime) / 1000)),
        fileSize: size,
        status: size > 0 ? 'completed' : 'error',
      });
    }
  }
}

export const continuousRecordingService = new ContinuousRecordingService();
