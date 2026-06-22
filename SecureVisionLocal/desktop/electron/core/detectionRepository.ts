import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { DetectionConfig, DetectionEvent } from '../../src/shared/types';

function defaults(cameraId: string): DetectionConfig {
  return {
    cameraId,
    motionEnabled: false,
    aiEnabled: false,
    sensitivity: 50,
    recordMotion: false,
    recordPerson: false,
    recordVehicle: false,
    recordAnimal: false,
    trackEnabled: false,
    trackSeconds: 30,
  };
}

export function getDetectionConfig(cameraId: string): DetectionConfig {
  const row = getDb()
    .prepare('SELECT config FROM detection_config WHERE cameraId = ?')
    .get(cameraId) as { config: string } | undefined;
  if (!row) return defaults(cameraId);
  try {
    return { ...defaults(cameraId), ...JSON.parse(row.config), cameraId };
  } catch {
    return defaults(cameraId);
  }
}

export function setDetectionConfig(cameraId: string, config: DetectionConfig): DetectionConfig {
  const merged = { ...getDetectionConfig(cameraId), ...config, cameraId };
  getDb()
    .prepare(
      `INSERT INTO detection_config (cameraId, config) VALUES (@cameraId, @config)
       ON CONFLICT(cameraId) DO UPDATE SET config=@config`,
    )
    .run({ cameraId, config: JSON.stringify(merged) });
  return merged;
}

export function listAllDetectionConfigs(): DetectionConfig[] {
  const rows = getDb().prepare('SELECT cameraId, config FROM detection_config').all() as {
    cameraId: string;
    config: string;
  }[];
  return rows.map((r) => {
    try {
      return { ...defaults(r.cameraId), ...JSON.parse(r.config), cameraId: r.cameraId };
    } catch {
      return defaults(r.cameraId);
    }
  });
}

// ---- Eventos de detecção ----

export function insertDetectionEvent(ev: DetectionEvent): void {
  getDb()
    .prepare('INSERT INTO events (id, cameraId, type, timestamp, meta) VALUES (?, ?, ?, ?, ?)')
    .run(ev.id, ev.cameraId, ev.type, ev.timestamp, JSON.stringify({ score: ev.score }));
}

export function newEventId(): string {
  return `evt_${randomUUID().slice(0, 8)}`;
}

interface EventRow {
  id: string;
  cameraId: string;
  type: string;
  timestamp: number;
  meta: string | null;
}

// Eventos de uma câmera dentro de um intervalo de tempo (para marcar na gravação).
export function listEventsBetween(cameraId: string, from: number, to: number): DetectionEvent[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM events WHERE cameraId = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC',
    )
    .all(cameraId, from, to) as EventRow[];
  return rows.map((r) => {
    let score: number | undefined;
    try {
      score = r.meta ? JSON.parse(r.meta).score : undefined;
    } catch {
      score = undefined;
    }
    return {
      id: r.id,
      cameraId: r.cameraId,
      type: r.type as DetectionEvent['type'],
      timestamp: r.timestamp,
      score,
    };
  });
}

export function listDetectionEvents(limit = 200): DetectionEvent[] {
  const rows = getDb()
    .prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as EventRow[];
  return rows.map((r) => {
    let score: number | undefined;
    try {
      score = r.meta ? JSON.parse(r.meta).score : undefined;
    } catch {
      score = undefined;
    }
    return {
      id: r.id,
      cameraId: r.cameraId,
      type: r.type as DetectionEvent['type'],
      timestamp: r.timestamp,
      score,
    };
  });
}
