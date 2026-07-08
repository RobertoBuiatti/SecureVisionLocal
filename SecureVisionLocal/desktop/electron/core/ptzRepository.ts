import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { PTZPreset, PTZTour, PTZTourStep } from '../../src/shared/types';

// ---- Presets ----

interface PresetRow {
  id: string;
  cameraId: string;
  name: string;
  token: string;
  createdAt: number;
  snapshotPath: string | null;
  lastCheckAt: number | null;
  lastCheckOk: number | null;
  lastCheckScore: number | null;
}

function rowToPreset(r: PresetRow): PTZPreset {
  return {
    id: r.id,
    cameraId: r.cameraId,
    name: r.name,
    token: r.token,
    createdAt: r.createdAt,
    snapshotPath: r.snapshotPath ?? undefined,
    lastCheckAt: r.lastCheckAt ?? undefined,
    lastCheckOk: r.lastCheckOk == null ? undefined : !!r.lastCheckOk,
    lastCheckScore: r.lastCheckScore ?? undefined,
  };
}

export function listPresets(cameraId: string): PTZPreset[] {
  const rows = getDb()
    .prepare('SELECT * FROM ptz_presets WHERE cameraId = ? ORDER BY createdAt ASC')
    .all(cameraId) as PresetRow[];
  return rows.map(rowToPreset);
}

export function getPreset(id: string): PTZPreset | null {
  const row = getDb().prepare('SELECT * FROM ptz_presets WHERE id = ?').get(id) as
    | PresetRow
    | undefined;
  return row ? rowToPreset(row) : null;
}

export function setPresetSnapshot(id: string, snapshotPath: string): void {
  getDb().prepare('UPDATE ptz_presets SET snapshotPath = ? WHERE id = ?').run(snapshotPath, id);
}

export function setPresetCheck(id: string, ok: boolean, score: number): void {
  getDb()
    .prepare('UPDATE ptz_presets SET lastCheckAt = ?, lastCheckOk = ?, lastCheckScore = ? WHERE id = ?')
    .run(Date.now(), ok ? 1 : 0, Math.round(score), id);
}

export function addPreset(cameraId: string, name: string, token: string): PTZPreset {
  const preset: PTZPreset = {
    id: `pre_${randomUUID().slice(0, 8)}`,
    cameraId,
    name,
    token,
    createdAt: Date.now(),
  };
  getDb()
    .prepare(
      'INSERT INTO ptz_presets (id, cameraId, name, token, createdAt) VALUES (@id, @cameraId, @name, @token, @createdAt)',
    )
    .run(preset);
  return preset;
}

export function updatePreset(id: string, name: string): PTZPreset | null {
  const existing = getPreset(id);
  if (!existing) return null;
  getDb().prepare('UPDATE ptz_presets SET name = ? WHERE id = ?').run(name, id);
  return { ...existing, name };
}

export function deletePreset(id: string): boolean {
  return getDb().prepare('DELETE FROM ptz_presets WHERE id = ?').run(id).changes > 0;
}

// ---- Rotas (tours) ----

interface TourRow {
  id: string;
  cameraId: string;
  name: string;
  steps: string;
  createdAt: number;
}

function rowToTour(r: TourRow): PTZTour {
  return {
    id: r.id,
    cameraId: r.cameraId,
    name: r.name,
    steps: JSON.parse(r.steps) as PTZTourStep[],
    createdAt: r.createdAt,
  };
}

export function listTours(cameraId: string): PTZTour[] {
  const rows = getDb()
    .prepare('SELECT * FROM ptz_tours WHERE cameraId = ? ORDER BY createdAt ASC')
    .all(cameraId) as TourRow[];
  return rows.map(rowToTour);
}

export function getTour(id: string): PTZTour | null {
  const row = getDb().prepare('SELECT * FROM ptz_tours WHERE id = ?').get(id) as TourRow | undefined;
  return row ? rowToTour(row) : null;
}

export function addTour(cameraId: string, name: string, steps: PTZTourStep[]): PTZTour {
  const tour: PTZTour = {
    id: `tour_${randomUUID().slice(0, 8)}`,
    cameraId,
    name,
    steps,
    createdAt: Date.now(),
  };
  getDb()
    .prepare(
      'INSERT INTO ptz_tours (id, cameraId, name, steps, createdAt) VALUES (@id, @cameraId, @name, @steps, @createdAt)',
    )
    .run({ ...tour, steps: JSON.stringify(steps) });
  return tour;
}

export function updateTour(id: string, name: string, steps: PTZTourStep[]): PTZTour | null {
  const existing = getTour(id);
  if (!existing) return null;
  getDb()
    .prepare('UPDATE ptz_tours SET name = ?, steps = ? WHERE id = ?')
    .run(name, JSON.stringify(steps), id);
  return { ...existing, name, steps };
}

export function deleteTour(id: string): boolean {
  return getDb().prepare('DELETE FROM ptz_tours WHERE id = ?').run(id).changes > 0;
}
