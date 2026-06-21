import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { Camera, CreateCameraDTO, CameraType } from '../../src/shared/types';

// Linha do SQLite (inteiros para booleanos) → objeto de domínio.
interface CameraRow {
  id: string;
  name: string;
  ip: string;
  port: number;
  protocol: string;
  type: string;
  manufacturer: string | null;
  username: string | null;
  password: string | null;
  streamUrl: string;
  subStreamUrl: string | null;
  onvifProfile: string | null;
  onvifPort: number | null;
  status: string;
  hasPTZ: number;
  hasAudio: number;
  presetCount: number;
  recordContinuous: number;
  createdAt: number;
  updatedAt: number;
}

function rowToCamera(r: CameraRow): Camera {
  return {
    id: r.id,
    name: r.name,
    ip: r.ip,
    port: r.port,
    protocol: r.protocol as Camera['protocol'],
    type: r.type as CameraType,
    manufacturer: r.manufacturer ?? undefined,
    username: r.username ?? undefined,
    password: r.password ?? undefined,
    streamUrl: r.streamUrl,
    subStreamUrl: r.subStreamUrl ?? undefined,
    onvifProfile: r.onvifProfile ?? undefined,
    onvifPort: r.onvifPort ?? undefined,
    status: r.status as Camera['status'],
    hasPTZ: !!r.hasPTZ,
    hasAudio: !!r.hasAudio,
    presetCount: r.presetCount,
    recordContinuous: !!r.recordContinuous,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function listCameras(): Camera[] {
  const rows = getDb().prepare('SELECT * FROM cameras ORDER BY createdAt ASC').all() as CameraRow[];
  return rows.map(rowToCamera);
}

export function getCamera(id: string): Camera | null {
  const row = getDb().prepare('SELECT * FROM cameras WHERE id = ?').get(id) as CameraRow | undefined;
  return row ? rowToCamera(row) : null;
}

export function addCamera(dto: CreateCameraDTO): Camera {
  const now = Date.now();
  const camera: Camera = {
    id: `cam_${randomUUID().slice(0, 8)}`,
    name: dto.name,
    ip: dto.ip,
    port: dto.port,
    protocol: dto.protocol,
    type: dto.type ?? (dto.hasPTZ ? 'ptz' : 'bullet'),
    manufacturer: dto.manufacturer,
    username: dto.username,
    password: dto.password,
    streamUrl: dto.streamUrl,
    subStreamUrl: dto.subStreamUrl,
    onvifPort: dto.onvifPort,
    status: 'offline',
    hasPTZ: dto.hasPTZ ?? false,
    hasAudio: dto.hasAudio ?? false,
    presetCount: 0,
    recordContinuous: dto.recordContinuous ?? false,
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO cameras
        (id, name, ip, port, protocol, type, manufacturer, username, password,
         streamUrl, subStreamUrl, onvifProfile, onvifPort, status, hasPTZ, hasAudio,
         presetCount, recordContinuous, createdAt, updatedAt)
       VALUES
        (@id, @name, @ip, @port, @protocol, @type, @manufacturer, @username, @password,
         @streamUrl, @subStreamUrl, @onvifProfile, @onvifPort, @status, @hasPTZ, @hasAudio,
         @presetCount, @recordContinuous, @createdAt, @updatedAt)`,
    )
    .run({
      ...camera,
      manufacturer: camera.manufacturer ?? null,
      username: camera.username ?? null,
      password: camera.password ?? null,
      subStreamUrl: camera.subStreamUrl ?? null,
      onvifProfile: camera.onvifProfile ?? null,
      onvifPort: camera.onvifPort ?? null,
      hasPTZ: camera.hasPTZ ? 1 : 0,
      hasAudio: camera.hasAudio ? 1 : 0,
      recordContinuous: camera.recordContinuous ? 1 : 0,
    });

  return camera;
}

export function updateCamera(id: string, updates: Partial<Camera>): Camera | null {
  const existing = getCamera(id);
  if (!existing) return null;
  const merged: Camera = { ...existing, ...updates, id, updatedAt: Date.now() };

  getDb()
    .prepare(
      `UPDATE cameras SET
        name=@name, ip=@ip, port=@port, protocol=@protocol, type=@type,
        manufacturer=@manufacturer, username=@username, password=@password,
        streamUrl=@streamUrl, subStreamUrl=@subStreamUrl, onvifProfile=@onvifProfile,
        onvifPort=@onvifPort, status=@status, hasPTZ=@hasPTZ, hasAudio=@hasAudio,
        presetCount=@presetCount, recordContinuous=@recordContinuous, updatedAt=@updatedAt
       WHERE id=@id`,
    )
    .run({
      ...merged,
      manufacturer: merged.manufacturer ?? null,
      username: merged.username ?? null,
      password: merged.password ?? null,
      subStreamUrl: merged.subStreamUrl ?? null,
      onvifProfile: merged.onvifProfile ?? null,
      onvifPort: merged.onvifPort ?? null,
      hasPTZ: merged.hasPTZ ? 1 : 0,
      hasAudio: merged.hasAudio ? 1 : 0,
      recordContinuous: merged.recordContinuous ? 1 : 0,
    });

  return merged;
}

export function removeCamera(id: string): boolean {
  const info = getDb().prepare('DELETE FROM cameras WHERE id = ?').run(id);
  return info.changes > 0;
}
