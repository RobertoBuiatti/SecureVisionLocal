import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { encryptSecret, decryptSecret, isEncrypted } from './secrets';
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
  hasOnboardTracking: number | null;
  presetCount: number;
  recordContinuous: number;
  createdAt: number;
  updatedAt: number;
}

// Campos sensíveis são descriptografados na leitura (safeStorage/DPAPI). As URLs de
// stream também, pois costumam embutir usuário:senha (padrão RTSP).
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
    password: decryptSecret(r.password) ?? undefined,
    streamUrl: decryptSecret(r.streamUrl) ?? r.streamUrl,
    subStreamUrl: decryptSecret(r.subStreamUrl) ?? undefined,
    onvifProfile: r.onvifProfile ?? undefined,
    onvifPort: r.onvifPort ?? undefined,
    status: r.status as Camera['status'],
    hasPTZ: !!r.hasPTZ,
    hasAudio: !!r.hasAudio,
    hasOnboardTracking: !!r.hasOnboardTracking,
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
    hasOnboardTracking: dto.hasOnboardTracking ?? false,
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
         hasOnboardTracking, presetCount, recordContinuous, createdAt, updatedAt)
       VALUES
        (@id, @name, @ip, @port, @protocol, @type, @manufacturer, @username, @password,
         @streamUrl, @subStreamUrl, @onvifProfile, @onvifPort, @status, @hasPTZ, @hasAudio,
         @hasOnboardTracking, @presetCount, @recordContinuous, @createdAt, @updatedAt)`,
    )
    .run({
      ...camera,
      manufacturer: camera.manufacturer ?? null,
      username: camera.username ?? null,
      password: encryptSecret(camera.password ?? null),
      streamUrl: encryptSecret(camera.streamUrl) ?? camera.streamUrl,
      subStreamUrl: encryptSecret(camera.subStreamUrl ?? null),
      onvifProfile: camera.onvifProfile ?? null,
      onvifPort: camera.onvifPort ?? null,
      hasPTZ: camera.hasPTZ ? 1 : 0,
      hasAudio: camera.hasAudio ? 1 : 0,
      hasOnboardTracking: camera.hasOnboardTracking ? 1 : 0,
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
        hasOnboardTracking=@hasOnboardTracking,
        presetCount=@presetCount, recordContinuous=@recordContinuous, updatedAt=@updatedAt
       WHERE id=@id`,
    )
    .run({
      ...merged,
      manufacturer: merged.manufacturer ?? null,
      username: merged.username ?? null,
      password: encryptSecret(merged.password ?? null),
      streamUrl: encryptSecret(merged.streamUrl) ?? merged.streamUrl,
      subStreamUrl: encryptSecret(merged.subStreamUrl ?? null),
      onvifProfile: merged.onvifProfile ?? null,
      onvifPort: merged.onvifPort ?? null,
      hasPTZ: merged.hasPTZ ? 1 : 0,
      hasAudio: merged.hasAudio ? 1 : 0,
      hasOnboardTracking: merged.hasOnboardTracking ? 1 : 0,
      recordContinuous: merged.recordContinuous ? 1 : 0,
    });

  return merged;
}

export function removeCamera(id: string): boolean {
  const info = getDb().prepare('DELETE FROM cameras WHERE id = ?').run(id);
  return info.changes > 0;
}

// Migração única na inicialização: cifra senhas/URLs que ainda estejam em texto puro
// no banco (registros criados antes da criptografia em repouso existir).
export function migrateCameraSecrets(): void {
  const rows = getDb()
    .prepare('SELECT id, password, streamUrl, subStreamUrl FROM cameras')
    .all() as Pick<CameraRow, 'id' | 'password' | 'streamUrl' | 'subStreamUrl'>[];
  const update = getDb().prepare(
    'UPDATE cameras SET password=@password, streamUrl=@streamUrl, subStreamUrl=@subStreamUrl WHERE id=@id',
  );
  for (const row of rows) {
    const needs =
      (row.password && !isEncrypted(row.password)) ||
      (row.streamUrl && !isEncrypted(row.streamUrl)) ||
      (row.subStreamUrl && !isEncrypted(row.subStreamUrl));
    if (!needs) continue;
    update.run({
      id: row.id,
      password: encryptSecret(row.password),
      streamUrl: encryptSecret(row.streamUrl) ?? row.streamUrl,
      subStreamUrl: encryptSecret(row.subStreamUrl),
    });
  }
}
