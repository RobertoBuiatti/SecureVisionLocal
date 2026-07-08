import { existsSync, unlinkSync, statSync } from 'node:fs';
import type { Recording, StorageUsage } from '../../src/shared/types';
import { getSettings } from './settings';
import {
  deleteRecording,
  listRetentionCandidates,
  listOlderThan,
  sumFileSize,
  getOldestStartTime,
  countRecordings,
  listRecordings,
} from './recordingRepository';
import { listCameras } from './cameraRepository';
import { listSnapshots, deleteOldestSnapshot, deleteSnapshotsByCamera, countSnapshotsByCamera } from './detectionSnapshotRepository';

const DAY_MS = 24 * 60 * 60 * 1000;

// Remove o arquivo de vídeo do disco; retorna true se conseguiu ou o arquivo já não existe.
function deleteFile(filePath: string): boolean {
  if (!existsSync(filePath)) return true;
  try {
    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// Remove o arquivo do disco e o registro do banco.
// SÓ remove o registro se o arquivo foi deletado com sucesso (ou já não existia).
// Isto evita arquivos órfãos que acumulam espaço sem serem contabilizados.
// Retorna true se o registro foi removido.
function deleteFull(rec: Recording): boolean {
  if (rec.filePath && deleteFile(rec.filePath)) {
    deleteRecording(rec.id);
    return true;
  }
  return false;
}

// Soma o tamanho dos snapshots de detecção no disco.
function sumSnapshotSize(): number {
  const snaps = listSnapshots();
  let total = 0;
  for (const s of snaps) {
    if (s.filePath && existsSync(s.filePath)) {
      try {
        total += statSync(s.filePath).size;
      } catch { /* ignora arquivo removido entre a listagem e a leitura */ }
    }
  }
  return total;
}

export function getStorageUsage(): StorageUsage {
  const { maxStorageGB } = getSettings();
  const usedBytes = sumFileSize() + sumSnapshotSize();
  return {
    usedBytes,
    limitBytes: maxStorageGB > 0 ? maxStorageGB * 1e9 : 0,
    recordingCount: countRecordings(),
    oldestRecordingTime: getOldestStartTime(),
  };
}

// Aplica a política de retenção: por idade e por espaço (reciclagem FIFO).
// Também limpa snapshots de detecção antigos.
// Usado pelo ciclo automático (recordingManager tick).
// Retorna quantas gravações + snapshots foram apagados.
export function enforceRetention(): number {
  const settings = getSettings();
  let removed = 0;

  // 1) Retenção por idade — apaga gravações mais antigas que `retentionDays`.
  if (settings.retentionDays > 0) {
    const cutoff = Date.now() - settings.retentionDays * DAY_MS;
    for (const rec of listOlderThan(cutoff)) {
      if (deleteFull(rec)) removed += 1;
    }
  }

  // 2) Reciclagem por espaço — enquanto exceder o limite, apaga a MAIS ANTIGA.
  if (settings.autoRecycle && settings.maxStorageGB > 0) {
    const limitBytes = settings.maxStorageGB * 1e9;
    let used = sumFileSize();
    let guard = 5000;
    while (used > limitBytes && guard-- > 0) {
      const [oldest] = listRetentionCandidates(1);
      if (!oldest) break;
      if (deleteFull(oldest)) {
        removed += 1;
        used -= oldest.fileSize;
      }
    }
  }

  // 3) Limpeza de snapshots — respeita o limite por câmera.
  for (const cam of listCameras()) {
    const count = countSnapshotsByCamera(cam.id);
    const max = settings.snapshotsMaxCount;
    if (count > max) {
      for (let i = 0; i < count - max; i++) {
        deleteOldestSnapshot(cam.id);
        removed += 1;
      }
    }
  }

  return removed;
}

// Apaga TODOS os snapshots de detecção e TODAS as gravações completadas.
// Usado pelo botão "Liberar espaço" na UI para liberar o máximo de espaço possível.
export function purgeAll(): number {
  let removed = 0;

  // Apaga snapshots de todas as câmeras
  for (const cam of listCameras()) {
    const before = countSnapshotsByCamera(cam.id);
    deleteSnapshotsByCamera(cam.id);
    removed += before;
  }

  // Apaga todas as gravações completadas (exceto as em andamento)
  for (const rec of listRecordings()) {
    if (rec.status !== 'recording') {
      if (deleteFull(rec)) removed += 1;
    }
  }

  return removed;
}
