import { getDb } from './db';
import type { Recording } from '../../src/shared/types';

interface RecordingRow {
  id: string;
  cameraId: string;
  cameraName: string | null;
  type: string;
  status: string;
  startTime: number;
  endTime: number | null;
  duration: number;
  fileSize: number;
  filePath: string;
  thumbnailPath: string | null;
  hasMotion: number;
  detectionType: string | null;
}

function rowToRecording(r: RecordingRow): Recording {
  return {
    id: r.id,
    cameraId: r.cameraId,
    cameraName: r.cameraName ?? undefined,
    type: r.type as Recording['type'],
    detectionType: (r.detectionType as Recording['detectionType']) ?? undefined,
    status: r.status as Recording['status'],
    startTime: r.startTime,
    endTime: r.endTime,
    duration: r.duration,
    fileSize: r.fileSize,
    filePath: r.filePath,
    thumbnailPath: r.thumbnailPath ?? undefined,
    hasMotion: !!r.hasMotion,
  };
}

export function insertRecording(rec: Recording): void {
  getDb()
    .prepare(
      `INSERT INTO recordings
        (id, cameraId, cameraName, type, detectionType, status, startTime, endTime, duration,
         fileSize, filePath, thumbnailPath, hasMotion)
       VALUES
        (@id, @cameraId, @cameraName, @type, @detectionType, @status, @startTime, @endTime, @duration,
         @fileSize, @filePath, @thumbnailPath, @hasMotion)`,
    )
    .run({
      ...rec,
      cameraName: rec.cameraName ?? null,
      detectionType: rec.detectionType ?? null,
      endTime: rec.endTime ?? null,
      thumbnailPath: rec.thumbnailPath ?? null,
      hasMotion: rec.hasMotion ? 1 : 0,
    });
}

export function finalizeRecording(
  id: string,
  data: { endTime: number; duration: number; fileSize: number; status: Recording['status'] },
): void {
  getDb()
    .prepare(
      `UPDATE recordings SET endTime=@endTime, duration=@duration, fileSize=@fileSize, status=@status WHERE id=@id`,
    )
    .run({ id, ...data });
}

export function listRecordings(cameraId?: string): Recording[] {
  const db = getDb();
  const rows = (
    cameraId
      ? db
          .prepare('SELECT * FROM recordings WHERE cameraId = ? ORDER BY startTime DESC LIMIT 500')
          .all(cameraId)
      : db.prepare('SELECT * FROM recordings ORDER BY startTime DESC LIMIT 500').all()
  ) as RecordingRow[];
  return rows.map(rowToRecording);
}

export function getRecording(id: string): Recording | null {
  const row = getDb().prepare('SELECT * FROM recordings WHERE id = ?').get(id) as
    | RecordingRow
    | undefined;
  return row ? rowToRecording(row) : null;
}

export function deleteRecording(id: string): boolean {
  const info = getDb().prepare('DELETE FROM recordings WHERE id = ?').run(id);
  return info.changes > 0;
}

export function countRecordings(): number {
  const row = getDb().prepare('SELECT COUNT(*) as n FROM recordings').get() as { n: number };
  return row.n;
}

// Verifica se um arquivo já está indexado (evita duplicar segmentos contínuos).
export function findByFilePath(filePath: string): Recording | null {
  const row = getDb().prepare('SELECT * FROM recordings WHERE filePath = ?').get(filePath) as
    | RecordingRow
    | undefined;
  return row ? rowToRecording(row) : null;
}

// Segmentos de uma câmera ainda marcados como 'recording' (para finalização).
export function listRecordingInProgress(cameraId: string): Recording[] {
  const rows = getDb()
    .prepare("SELECT * FROM recordings WHERE cameraId = ? AND status = 'recording'")
    .all(cameraId) as RecordingRow[];
  return rows.map(rowToRecording);
}

// Soma de bytes de todas as gravações indexadas.
export function sumFileSize(): number {
  const row = getDb().prepare('SELECT COALESCE(SUM(fileSize), 0) as total FROM recordings').get() as {
    total: number;
  };
  return row.total;
}

export function getOldestStartTime(): number | null {
  const row = getDb().prepare('SELECT MIN(startTime) as t FROM recordings').get() as { t: number | null };
  return row.t ?? null;
}

// Candidatas à reciclagem: mais antigas primeiro, nunca as que ainda estão gravando.
export function listRetentionCandidates(limit = 100): Recording[] {
  const rows = getDb()
    .prepare("SELECT * FROM recordings WHERE status != 'recording' ORDER BY startTime ASC LIMIT ?")
    .all(limit) as RecordingRow[];
  return rows.map(rowToRecording);
}

// Gravações mais antigas que um instante (para retenção por idade).
export function listOlderThan(timestamp: number): Recording[] {
  const rows = getDb()
    .prepare("SELECT * FROM recordings WHERE status != 'recording' AND startTime < ? ORDER BY startTime ASC")
    .all(timestamp) as RecordingRow[];
  return rows.map(rowToRecording);
}
