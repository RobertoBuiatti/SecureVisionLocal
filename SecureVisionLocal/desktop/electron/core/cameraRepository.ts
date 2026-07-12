import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { encryptSecret, decryptSecret, decryptSecretLegacy, isEncrypted, PREFIX_V1 } from './secrets';
import { normalizeMac, rewriteRtspHost } from './ipResolver';
import { insertCameraLog } from './cameraLogger';
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
  mac: string | null;
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
    streamUrl: decryptSecret(r.streamUrl) ?? '',
    subStreamUrl: decryptSecret(r.subStreamUrl) ?? undefined,
    onvifProfile: r.onvifProfile ?? undefined,
    onvifPort: r.onvifPort ?? undefined,
    mac: r.mac ?? undefined,
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

// Identidade ESTÁVEL do dispositivo, independente do IP (que muda por DHCP no WiFi).
// Usa a URL de stream com o host normalizado (mantém credenciais/canal/porta, que são
// específicos do aparelho) + usuário + porta. Assim, o MESMO dispositivo em IPs
// diferentes (ex.: 192.168.1.9 e 192.168.1.10) produz a MESMA chave. Cai para o MAC se
// não houver URL. Câmeras diferentes (ou canais distintos de um NVR) têm chaves distintas.
function deviceKeyOf(
  streamUrl: string,
  subStreamUrl: string | undefined,
  username: string | undefined,
  port: number,
): string {
  const url = streamUrl || subStreamUrl || '';
  if (url) return `url:${rewriteRtspHost(url, '_').toLowerCase()}|${(username || '').toLowerCase()}|${port}`;
  return '';
}

export function cameraDeviceKey(c: Camera): string {
  return (
    deviceKeyOf(c.streamUrl, c.subStreamUrl, c.username, c.port) ||
    (c.mac ? `mac:${normalizeMac(c.mac)}` : `id:${c.id}`)
  );
}

// Escolhe o cadastro PRINCIPAL de um grupo do mesmo dispositivo. Prefere o que está
// funcionando de fato: ONLINE primeiro (o IP que responde), depois o atualizado mais
// recentemente (o app bumpa updatedAt ao curar/transmitir o cadastro ativo), e por fim
// o mais antigo (desempate estável). Assim não corremos o risco de manter um cadastro
// MORTO como principal e sombrear o que realmente transmite.
export function primaryOfGroup(group: Camera[]): Camera {
  return group.reduce((best, c) => {
    const bo = best.status === 'online' ? 1 : 0;
    const co = c.status === 'online' ? 1 : 0;
    if (co !== bo) return co > bo ? c : best;
    if (c.updatedAt !== best.updatedAt) return c.updatedAt > best.updatedAt ? c : best;
    return c.createdAt < best.createdAt ? c : best;
  });
}

// Verdadeiro se `camera` é uma DUPLICATA (mesmo dispositivo já cadastrado com outro id) e
// NÃO é o principal do grupo. Usado para NÃO abrir várias puxadas RTSP para o mesmo
// aparelho (causa de lag/"Sem sinal" em câmeras XM).
export function isDuplicateShadow(camera: Camera, all: Camera[] = listCameras()): boolean {
  const key = cameraDeviceKey(camera);
  if (key.startsWith('id:')) return false; // sem identidade estável → não agrupa
  const group = all.filter((c) => cameraDeviceKey(c) === key);
  if (group.length <= 1) return false;
  return camera.id !== primaryOfGroup(group).id;
}

export function addCamera(dto: CreateCameraDTO): Camera {
  // Bloqueia cadastro duplicado do MESMO dispositivo — inclusive quando ele aparece em
  // OUTRO IP (DHCP). Cadastrar a mesma câmera 2x faz o app abrir N puxadas RTSP nela, e
  // câmeras Xiongmai/8MP servem pouquíssimas sessões → o vídeo passa a dar "Sem sinal"
  // e o app fica reiniciando/lagando. Compara pela identidade estável do dispositivo.
  const dtoKey = deviceKeyOf(dto.streamUrl, dto.subStreamUrl, dto.username, dto.port);
  const duplicate = dtoKey ? listCameras().find((c) => cameraDeviceKey(c) === dtoKey) : null;
  if (duplicate) {
    throw new Error(
      `Câmera já cadastrada: "${duplicate.name}" (${duplicate.ip}:${duplicate.port}). ` +
        `É o MESMO dispositivo (mesma URL/credenciais), possivelmente em outro IP. ` +
        `Cadastro duplicado bloqueado — remova o existente antes de recadastrar.`,
    );
  }

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
         streamUrl, subStreamUrl, onvifProfile, onvifPort, mac, status, hasPTZ, hasAudio,
         hasOnboardTracking, presetCount, recordContinuous, createdAt, updatedAt)
       VALUES
        (@id, @name, @ip, @port, @protocol, @type, @manufacturer, @username, @password,
         @streamUrl, @subStreamUrl, @onvifProfile, @onvifPort, @mac, @status, @hasPTZ, @hasAudio,
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
      mac: camera.mac ?? null,
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
        onvifPort=@onvifPort, mac=@mac, status=@status, hasPTZ=@hasPTZ, hasAudio=@hasAudio,
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
      mac: merged.mac ?? null,
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

// Migração na inicialização: cifra campos que ainda estejam em texto puro e
// re-cifra registros no formato DPAPI antigo (enc:v1:) para o novo formato AES (enc:v2:).
export function migrateCameraSecrets(): void {
  const rows = getDb()
    .prepare('SELECT id, password, streamUrl, subStreamUrl FROM cameras')
    .all() as Pick<CameraRow, 'id' | 'password' | 'streamUrl' | 'subStreamUrl'>[];
  const update = getDb().prepare(
    'UPDATE cameras SET password=@password, streamUrl=@streamUrl, subStreamUrl=@subStreamUrl WHERE id=@id',
  );
  for (const row of rows) {
    const reEncrypt = (val: string | null): string | null => {
      if (val === null || val === undefined || val === '') return val;
      // enc:v1: é DPAPI antigo; re-cifra com AES se possível, ou limpa
      if (val.startsWith('enc:v1:')) {
        try {
          return encryptSecret(decryptSecretLegacy(val));
        } catch {
          return null; // DPAPI de outra máquina → limpa o campo
        }
      }
      if (isEncrypted(val)) return val;
      return encryptSecret(val);
    };
    const newPassword = reEncrypt(row.password);
    const newStreamUrl = reEncrypt(row.streamUrl);
    const newSubStream = reEncrypt(row.subStreamUrl);
    const changed =
      newPassword !== row.password ||
      newStreamUrl !== row.streamUrl ||
      newSubStream !== row.subStreamUrl;
    if (!changed) continue;
    update.run({
      id: row.id,
      password: newPassword,
      streamUrl: newStreamUrl ?? row.streamUrl,
      subStreamUrl: newSubStream,
    });
  }
}

// MERGE de duplicatas na inicialização: quando a mesma câmera física foi cadastrada mais
// de uma vez (ex.: readicionada após troca de IP por DHCP), consolida tudo num único
// cadastro (o principal) e REMOVE os extras. Reatribui gravações, presets, rotas,
// agendamentos, snapshots e logs ao principal antes de apagar — nada de footage é perdido.
// Idempotente: sem duplicatas, não faz nada. Roda dentro de uma transação.
export function mergeDuplicateCameras(): { removed: number } {
  const all = listCameras();
  const byKey = new Map<string, Camera[]>();
  for (const c of all) {
    const k = cameraDeviceKey(c);
    if (k.startsWith('id:')) continue; // sem identidade estável → não mescla
    const arr = byKey.get(k) ?? [];
    arr.push(c);
    byKey.set(k, arr);
  }

  const groups = Array.from(byKey.values()).filter((g) => g.length > 1);
  if (!groups.length) return { removed: 0 };

  const db = getDb();
  // Tabelas com coluna cameraId que devem MIGRAR para o principal (preserva os dados).
  const reassign = [
    'recordings',
    'events',
    'ptz_presets',
    'ptz_tours',
    'recording_schedules',
    'detection_snapshots',
    'camera_logs',
  ];
  // Tabelas onde cameraId é CHAVE PRIMÁRIA (1 linha por câmera): move só se o principal
  // ainda não tiver a sua; senão mantém a do principal (a da sombra some no cascade).
  const pkTables = ['detection_config', 'active_tours'];

  const mergeGroup = db.transaction((group: Camera[]): string[] => {
    const primary = primaryOfGroup(group);
    const shadows = group.filter((c) => c.id !== primary.id);
    for (const sh of shadows) {
      for (const t of reassign) {
        db.prepare(`UPDATE ${t} SET cameraId = ? WHERE cameraId = ?`).run(primary.id, sh.id);
      }
      for (const t of pkTables) {
        db.prepare(`UPDATE OR IGNORE ${t} SET cameraId = ? WHERE cameraId = ?`).run(primary.id, sh.id);
      }
      db.prepare('DELETE FROM cameras WHERE id = ?').run(sh.id); // cascade limpa o que sobrar
    }
    return shadows.map((s) => s.id);
  });

  let removed = 0;
  for (const group of groups) {
    const primary = primaryOfGroup(group);
    const removedIds = mergeGroup(group);
    removed += removedIds.length;
    insertCameraLog(
      primary.id,
      primary.name,
      'warn',
      `Cadastros duplicados mesclados: ${removedIds.length} removido(s)`,
      `A mesma câmera física estava cadastrada ${group.length}x (mesma URL/credenciais; IPs: ${group
        .map((c) => c.ip)
        .join(', ')}).\n\nNa inicialização, o app consolidou tudo no cadastro principal ("${primary.name}", ${primary.ip}) e removeu os ${removedIds.length} extra(s). Gravações, presets, rotas, agendamentos e logs foram reatribuídos ao principal — nada foi perdido.\n\nAgora há UM cadastro por câmera → UMA puxada RTSP → conexão estável, sem contenção/lag.`,
      'connectionMonitor',
    );
  }
  return { removed };
}
