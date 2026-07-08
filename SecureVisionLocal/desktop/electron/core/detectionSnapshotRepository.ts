import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { DetectionSnapshot } from '../../src/shared/types';

interface SnapRow {
  id: string;
  cameraId: string;
  detectionType: string;
  timestamp: number;
  filePath: string;
  score: number | null;
}

function rowToSnap(row: SnapRow): DetectionSnapshot {
  return {
    id: row.id,
    cameraId: row.cameraId,
    detectionType: row.detectionType as DetectionSnapshot['detectionType'],
    timestamp: row.timestamp,
    filePath: row.filePath,
    score: row.score ?? undefined,
  };
}

export function insertSnapshot(snap: Omit<DetectionSnapshot, 'id'>): DetectionSnapshot {
  const id = `ds_${randomUUID().slice(0, 8)}`;
  getDb()
    .prepare(
      `INSERT INTO detection_snapshots (id, cameraId, detectionType, timestamp, filePath, score)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, snap.cameraId, snap.detectionType, snap.timestamp, snap.filePath, snap.score ?? null);
  return { ...snap, id };
}

export function listSnapshots(cameraId?: string, limit = 50): DetectionSnapshot[] {
  let query = 'SELECT * FROM detection_snapshots';
  const params: (string | number)[] = [];

  if (cameraId) {
    query += ' WHERE cameraId = ?';
    params.push(cameraId);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  const rows = getDb().prepare(query).all(...params) as SnapRow[];
  return rows.map(rowToSnap);
}

export function countSnapshotsByCamera(cameraId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS count FROM detection_snapshots WHERE cameraId = ?')
    .get(cameraId) as { count: number };
  return row.count;
}

export function deleteOldestSnapshot(cameraId: string): void {
  getDb()
    .prepare(
      `DELETE FROM detection_snapshots
       WHERE id = (
         SELECT id FROM detection_snapshots
         WHERE cameraId = ?
         ORDER BY timestamp ASC
         LIMIT 1
       )`,
    )
    .run(cameraId);
}

export function deleteSnapshot(id: string): void {
  getDb().prepare('DELETE FROM detection_snapshots WHERE id = ?').run(id);
}

export function deleteSnapshotsByCamera(cameraId: string): void {
  getDb().prepare('DELETE FROM detection_snapshots WHERE cameraId = ?').run(cameraId);
}
