import { spawn } from 'node:child_process';
import { statSync, rmSync, renameSync, existsSync } from 'node:fs';
import { FFMPEG_PATH } from './ffmpegPath';
import type { Recording } from '../../src/shared/types';
import { listEventsBetween } from './detectionRepository';
import { finalizeRecording } from './recordingRepository';

const MAX_MARKS = 200; // limite de traços (evita uma cadeia de filtros gigante)

// Cor do tracinho por tipo de detecção (boa visibilidade sobre qualquer cena).
const COLOR: Record<string, string> = {
  person: '0x3b82f6', // azul
  vehicle: '0x7c3aed', // roxo
  animal: '0x16a34a', // verde
  motion: '0xf59e0b', // laranja
};

// Queima "traços finos" no vídeo marcando cada momento de detecção: uma faixa fina
// na base do vídeo (mini linha do tempo) com um tracinho vertical em cada evento.
// Reescreve o arquivo (temp → original) e atualiza o tamanho no banco. Tolerante a
// falhas: se algo der errado, o arquivo original é preservado.
export async function overlayDetections(recording: Recording): Promise<void> {
  const { filePath, cameraId, startTime } = recording;
  const endTime = recording.endTime ?? Date.now();
  const durationMs = endTime - startTime;
  if (durationMs <= 0 || !existsSync(filePath)) return;

  const events = listEventsBetween(cameraId, startTime, endTime).slice(0, MAX_MARKS);
  if (events.length === 0) return; // nada a marcar

  // Faixa de fundo translúcida na base (mini linha do tempo) para os traços contrastarem.
  const filters: string[] = ['drawbox=x=0:y=ih-15:w=iw:h=15:color=black@0.45:t=fill'];
  for (const ev of events) {
    const frac = Math.max(0, Math.min(1, (ev.timestamp - startTime) / durationMs));
    const color = COLOR[ev.type] ?? '0xffffff';
    // Tracinho vertical fino (2px) na posição temporal do evento.
    filters.push(`drawbox=x=iw*${frac.toFixed(4)}-1:y=ih-14:w=2:h=12:color=${color}@0.95:t=fill`);
  }
  const vf = filters.join(',');

  const tmp = `${filePath}.marked.mp4`;
  const args = [
    '-i', filePath,
    '-vf', vf,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    '-y', tmp,
  ];

  const ok = await new Promise<boolean>((resolve) => {
    const ff = spawn(FFMPEG_PATH, args, { stdio: 'ignore' });
    ff.on('error', () => resolve(false));
    ff.on('close', (code) => resolve(code === 0));
  });

  if (!ok || !existsSync(tmp)) {
    try {
      if (existsSync(tmp)) rmSync(tmp);
    } catch {
      /* noop */
    }
    return;
  }

  // Substitui o original pelo arquivo marcado e atualiza o tamanho no banco.
  try {
    rmSync(filePath);
    renameSync(tmp, filePath);
    const fileSize = statSync(filePath).size;
    finalizeRecording(recording.id, {
      endTime,
      duration: recording.duration,
      fileSize,
      status: 'completed',
    });
  } catch {
    try {
      if (existsSync(tmp)) rmSync(tmp);
    } catch {
      /* noop */
    }
  }
}
