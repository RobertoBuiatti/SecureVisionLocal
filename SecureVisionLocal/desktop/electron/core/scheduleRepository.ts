import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { RecordingSchedule } from '../../src/shared/types';

interface ScheduleRow {
  id: string;
  cameraId: string;
  enabled: number;
  startTime: string;
  endTime: string;
  daysOfWeek: string; // CSV de 0–6
  createdAt: number;
}

function rowToSchedule(r: ScheduleRow): RecordingSchedule {
  return {
    id: r.id,
    cameraId: r.cameraId,
    enabled: !!r.enabled,
    startTime: r.startTime,
    endTime: r.endTime,
    daysOfWeek: r.daysOfWeek
      ? r.daysOfWeek.split(',').map((n) => Number(n)).filter((n) => !Number.isNaN(n))
      : [],
    createdAt: r.createdAt,
  };
}

export function listSchedules(cameraId?: string): RecordingSchedule[] {
  const db = getDb();
  const rows = (
    cameraId
      ? db.prepare('SELECT * FROM recording_schedules WHERE cameraId = ? ORDER BY startTime').all(cameraId)
      : db.prepare('SELECT * FROM recording_schedules ORDER BY cameraId, startTime').all()
  ) as ScheduleRow[];
  return rows.map(rowToSchedule);
}

// Insere ou atualiza um agendamento (upsert pela chave primária id).
export function upsertSchedule(schedule: RecordingSchedule): RecordingSchedule {
  const id = schedule.id || randomUUID();
  const record: RecordingSchedule = { ...schedule, id, createdAt: schedule.createdAt || Date.now() };
  getDb()
    .prepare(
      `INSERT INTO recording_schedules (id, cameraId, enabled, startTime, endTime, daysOfWeek, createdAt)
       VALUES (@id, @cameraId, @enabled, @startTime, @endTime, @daysOfWeek, @createdAt)
       ON CONFLICT(id) DO UPDATE SET
         enabled=@enabled, startTime=@startTime, endTime=@endTime, daysOfWeek=@daysOfWeek`,
    )
    .run({
      id: record.id,
      cameraId: record.cameraId,
      enabled: record.enabled ? 1 : 0,
      startTime: record.startTime,
      endTime: record.endTime,
      daysOfWeek: record.daysOfWeek.join(','),
      createdAt: record.createdAt,
    });
  return record;
}

export function deleteSchedule(id: string): boolean {
  const info = getDb().prepare('DELETE FROM recording_schedules WHERE id = ?').run(id);
  return info.changes > 0;
}
