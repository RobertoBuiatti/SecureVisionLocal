import { spawn, type ChildProcess } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FFMPEG_PATH } from './ffmpegPath';
import type { Camera, Recording } from '../../src/shared/types';
import { getSettings } from './settings';
import { insertRecording, finalizeRecording } from './recordingRepository';
import { overlayDetections } from './markRecording';

interface ActiveRecording {
  recording: Recording;
  ffmpeg: ChildProcess;
}

function timestampName(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}.mp4`;
}

// Gerencia gravações em disco local. Usa `-c copy` (sem reencode) para baixo uso de CPU.
export class RecordingService {
  private active = new Map<string, ActiveRecording>();

  isRecording(cameraId: string): boolean {
    return this.active.has(cameraId);
  }

  start(camera: Camera, type: Recording['type'] = 'manual'): Recording {
    const existing = this.active.get(camera.id);
    if (existing) return existing.recording;

    const { recordingsPath } = getSettings();
    const filename = timestampName(camera.name.replace(/[^\w-]/g, '_'));
    const filePath = join(recordingsPath, filename);

    const recording: Recording = {
      id: `rec_${randomUUID().slice(0, 8)}`,
      cameraId: camera.id,
      cameraName: camera.name,
      type,
      status: 'recording',
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      fileSize: 0,
      filePath,
      hasMotion: false,
    };

    const args = [
      '-rtsp_transport', 'tcp',
      '-i', camera.streamUrl,
      '-c:v', 'copy', // copia o vídeo (sem reencode) — baixo uso de CPU
      '-c:a', 'aac', // converte o áudio (ex.: pcm_alaw da Xiongmai) p/ AAC compatível com MP4
      '-movflags', '+frag_keyframe+empty_moov',
      '-f', 'mp4',
      '-y', filePath,
    ];

    // stdin habilitado para enviar 'q' e finalizar o arquivo de forma limpa.
    const ffmpeg = spawn(FFMPEG_PATH, args, { stdio: ['pipe', 'ignore', 'ignore'] });

    ffmpeg.on('error', () => {
      this.handleClosed(camera.id);
    });
    ffmpeg.on('close', () => {
      this.handleClosed(camera.id);
    });

    insertRecording(recording);
    this.active.set(camera.id, { recording, ffmpeg });
    return recording;
  }

  stop(cameraId: string): void {
    const item = this.active.get(cameraId);
    if (!item) return;
    try {
      // 'q' faz o FFmpeg encerrar gravando o trailer do MP4 corretamente.
      item.ffmpeg.stdin?.write('q');
    } catch {
      try {
        item.ffmpeg.kill('SIGINT');
      } catch {
        /* noop */
      }
    }
  }

  stopAll(): void {
    for (const id of Array.from(this.active.keys())) this.stop(id);
  }

  private handleClosed(cameraId: string): void {
    const item = this.active.get(cameraId);
    if (!item) return;
    this.active.delete(cameraId);

    const endTime = Date.now();
    let fileSize = 0;
    try {
      fileSize = statSync(item.recording.filePath).size;
    } catch {
      /* arquivo pode não existir se falhou cedo */
    }
    const duration = Math.round((endTime - item.recording.startTime) / 1000);
    const completed = fileSize > 0;
    finalizeRecording(item.recording.id, {
      endTime,
      duration,
      fileSize,
      status: completed ? 'completed' : 'error',
    });

    // Marca as detecções no próprio vídeo (traços finos), se habilitado. Só em clipes
    // por evento/movimento/manual — nunca nos segmentos 24/7 (preserva o baixo CPU).
    if (completed && item.recording.type !== 'continuous' && getSettings().overlayDetectionMarks) {
      void overlayDetections({ ...item.recording, endTime, duration, fileSize, status: 'completed' });
    }
  }
}

export const recordingService = new RecordingService();
