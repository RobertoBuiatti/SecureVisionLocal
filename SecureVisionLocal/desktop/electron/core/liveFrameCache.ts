import { join } from 'node:path';
import { statSync } from 'node:fs';
import { getLiveFramesDir } from './paths';

// Idade máxima (ms) para um quadro ao vivo em cache ainda ser considerado "atual".
// Precisa ser generoso o bastante para cobrir o intervalo entre quadros do pipeline
// de detecção (1 fps → ~1s) mais folga; a captura de preset espera 1500ms após mover
// a câmera, então um limite de ~3s garante que o quadro reflita a posição nova.
const DEFAULT_MAX_AGE_MS = 3000;

// Caminho do último quadro ao vivo (JPEG) de uma câmera. Gravado pelo pipeline de
// detecção de movimento (2ª saída do FFmpeg) e lido pelos snapshots/preset.
export function liveFramePath(cameraId: string): string {
  return join(getLiveFramesDir(), `${cameraId}.jpg`);
}

// Retorna o caminho do último quadro ao vivo SE ele existir e for recente o bastante.
// Caso contrário retorna null (o chamador deve cair para a captura RTSP direta).
export function freshLiveFrame(cameraId: string, maxAgeMs = DEFAULT_MAX_AGE_MS): string | null {
  const p = liveFramePath(cameraId);
  try {
    const st = statSync(p);
    if (st.size > 0 && Date.now() - st.mtimeMs <= maxAgeMs) return p;
  } catch {
    /* arquivo ainda não existe (detecção desligada ou primeiro quadro não chegou) */
  }
  return null;
}
