import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { Camera } from '../../src/shared/types';
import type { CameraLogEntry } from '../../src/shared/types';

export function sanitizeUrl(url: string): string {
  try {
    return url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  } catch {
    return url;
  }
}

export function describeCamera(camera: Camera | null): string {
  if (!camera) return 'Câmera não encontrada';
  const parts: string[] = [];
  parts.push(`Nome: ${camera.name}`);
  parts.push(`IP: ${camera.ip}:${camera.port}`);
  parts.push(`Protocolo: ${camera.protocol}`);
  if (camera.username) parts.push(`Usuário: ${camera.username}`);
  parts.push(`URL principal: ${sanitizeUrl(camera.streamUrl)}`);
  if (camera.subStreamUrl) parts.push(`URL secundária: ${sanitizeUrl(camera.subStreamUrl)}`);
  parts.push(`Fabricante: ${camera.manufacturer || '—'}`);
  parts.push(`PTZ: ${camera.hasPTZ ? 'Sim' : 'Não'}`);
  return parts.join('\n');
}

interface CameraLogRow {
  id: string;
  cameraId: string;
  cameraName: string;
  level: string;
  message: string;
  details: string;
  timestamp: number;
  source: string;
}

function rowToEntry(r: CameraLogRow): CameraLogEntry {
  return {
    id: r.id,
    cameraId: r.cameraId,
    cameraName: r.cameraName,
    level: r.level as CameraLogEntry['level'],
    message: r.message,
    details: r.details,
    timestamp: r.timestamp,
    source: r.source,
  };
}

export function insertCameraLog(
  cameraId: string,
  cameraName: string,
  level: CameraLogEntry['level'],
  message: string,
  details: string,
  source: string,
): CameraLogEntry {
  const entry: CameraLogEntry = {
    id: `log_${randomUUID().slice(0, 12)}`,
    cameraId,
    cameraName,
    level,
    message,
    details,
    timestamp: Date.now(),
    source,
  };
  try {
    getDb()
      .prepare(
        `INSERT INTO camera_logs (id, cameraId, cameraName, level, message, details, timestamp, source)
         VALUES (@id, @cameraId, @cameraName, @level, @message, @details, @timestamp, @source)`,
      )
      .run(entry);
  } catch (err) {
    console.error('[cameraLogger] Falha ao salvar log:', err);
  }
  return entry;
}

export function listCameraLogs(cameraId?: string, limit = 100): CameraLogEntry[] {
  try {
    const db = getDb();
    let rows: CameraLogRow[];
    if (cameraId) {
      rows = db
        .prepare(
          'SELECT * FROM camera_logs WHERE cameraId = ? ORDER BY timestamp DESC LIMIT ?',
        )
        .all(cameraId, limit) as CameraLogRow[];
    } else {
      rows = db
        .prepare('SELECT * FROM camera_logs ORDER BY timestamp DESC LIMIT ?')
        .all(limit) as CameraLogRow[];
    }
    return rows.map(rowToEntry);
  } catch {
    return [];
  }
}

export function clearCameraLogs(cameraId?: string): void {
  try {
    const db = getDb();
    if (cameraId) {
      db.prepare('DELETE FROM camera_logs WHERE cameraId = ?').run(cameraId);
    } else {
      db.prepare('DELETE FROM camera_logs').run();
    }
  } catch {
    /* noop */
  }
}