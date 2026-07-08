import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { ReferenceMark } from '../../src/shared/types';

interface RefMarkRow {
  id: string;
  presetId: string;
  type: string;
  points: string;
  expectedDistanceLeft: number;
  expectedDistanceTop: number;
  tolerance: number;
  createdAt: number;
}

function rowToMark(row: RefMarkRow): ReferenceMark {
  return {
    id: row.id,
    presetId: row.presetId,
    type: row.type as ReferenceMark['type'],
    points: JSON.parse(row.points),
    expectedDistanceLeft: row.expectedDistanceLeft,
    expectedDistanceTop: row.expectedDistanceTop,
    tolerance: row.tolerance,
    createdAt: row.createdAt,
  };
}

export function saveReferenceMarks(presetId: string, marks: Omit<ReferenceMark, 'id' | 'presetId' | 'createdAt'>[]): ReferenceMark[] {
  const db = getDb();
  const del = db.prepare('DELETE FROM preset_reference_marks WHERE presetId = ?');
  const ins = db.prepare(
    `INSERT INTO preset_reference_marks (id, presetId, type, points, expectedDistanceLeft, expectedDistanceTop, tolerance, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const now = Date.now();
  const saved: ReferenceMark[] = [];

  const tx = db.transaction(() => {
    del.run(presetId);
    for (const m of marks) {
      const id = `rm_${randomUUID().slice(0, 8)}`;
      ins.run(
        id,
        presetId,
        m.type,
        JSON.stringify(m.points),
        m.expectedDistanceLeft,
        m.expectedDistanceTop,
        m.tolerance,
        now,
      );
      saved.push({ ...m, id, presetId, createdAt: now });
    }
  });
  tx();

  return saved;
}

export function getReferenceMarks(presetId: string): ReferenceMark[] {
  const rows = getDb()
    .prepare('SELECT * FROM preset_reference_marks WHERE presetId = ? ORDER BY createdAt ASC')
    .all(presetId) as RefMarkRow[];
  return rows.map(rowToMark);
}

export function getReferenceMark(id: string): ReferenceMark | null {
  const row = getDb()
    .prepare('SELECT * FROM preset_reference_marks WHERE id = ?')
    .get(id) as RefMarkRow | undefined;
  return row ? rowToMark(row) : null;
}

export function deleteReferenceMarksByPreset(presetId: string): void {
  getDb().prepare('DELETE FROM preset_reference_marks WHERE presetId = ?').run(presetId);
}

export function getReferenceMarksByCamera(cameraId: string): ReferenceMark[] {
  const rows = getDb()
    .prepare(
      `SELECT rm.* FROM preset_reference_marks rm
       INNER JOIN ptz_presets p ON p.id = rm.presetId
       WHERE p.cameraId = ?
       ORDER BY rm.createdAt ASC`,
    )
    .all(cameraId) as RefMarkRow[];
  return rows.map(rowToMark);
}
