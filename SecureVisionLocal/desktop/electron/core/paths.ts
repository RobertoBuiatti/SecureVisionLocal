import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

// Caminhos padrão do software no Windows (sob %APPDATA%/SecureVision Local).
function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getDataDir(): string {
  return ensureDir(app.getPath('userData'));
}

export function getDbPath(): string {
  return join(getDataDir(), 'securevision.db');
}

export function getDefaultRecordingsDir(): string {
  // Por padrão grava em Vídeos/SecureVision; o usuário pode mudar nas configurações.
  const base = join(app.getPath('videos'), 'SecureVision');
  return ensureDir(base);
}

export function getThumbnailsDir(): string {
  return ensureDir(join(getDataDir(), 'thumbnails'));
}

// Diretório onde o pipeline de detecção grava o último quadro ao vivo de cada câmera
// (um JPEG por câmera). Snapshots e captura de preset reaproveitam esse arquivo em vez
// de abrir uma nova sessão RTSP — reduz a carga de conexões simultâneas na câmera.
export function getLiveFramesDir(): string {
  return ensureDir(join(getDataDir(), 'liveframes'));
}
