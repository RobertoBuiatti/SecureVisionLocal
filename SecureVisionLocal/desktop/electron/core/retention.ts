import { existsSync, unlinkSync } from 'node:fs';
import type { Recording, StorageUsage } from '../../src/shared/types';
import { getSettings } from './settings';
import {
  deleteRecording,
  listRetentionCandidates,
  listOlderThan,
  sumFileSize,
  getOldestStartTime,
  countRecordings,
} from './recordingRepository';

const DAY_MS = 24 * 60 * 60 * 1000;

// Remove o arquivo de vídeo do disco e o registro do banco.
function deleteFull(rec: Recording): void {
  if (rec.filePath && existsSync(rec.filePath)) {
    try {
      unlinkSync(rec.filePath);
    } catch {
      /* arquivo bloqueado/ausente — segue removendo o registro */
    }
  }
  deleteRecording(rec.id);
}

export function getStorageUsage(): StorageUsage {
  const { maxStorageGB } = getSettings();
  return {
    usedBytes: sumFileSize(),
    limitBytes: maxStorageGB > 0 ? maxStorageGB * 1e9 : 0,
    recordingCount: countRecordings(),
    oldestRecordingTime: getOldestStartTime(),
  };
}

// Aplica a política de retenção: por idade e por espaço (reciclagem FIFO).
// Retorna quantas gravações foram apagadas.
export function enforceRetention(): number {
  const settings = getSettings();
  let removed = 0;

  // 1) Retenção por idade — apaga gravações mais antigas que `retentionDays`.
  if (settings.retentionDays > 0) {
    const cutoff = Date.now() - settings.retentionDays * DAY_MS;
    for (const rec of listOlderThan(cutoff)) {
      deleteFull(rec);
      removed += 1;
    }
  }

  // 2) Reciclagem por espaço — enquanto exceder o limite, apaga a MAIS ANTIGA.
  if (settings.autoRecycle && settings.maxStorageGB > 0) {
    const limitBytes = settings.maxStorageGB * 1e9;
    let used = sumFileSize();
    // Trava de segurança contra laço infinito (no máx. N remoções por ciclo).
    let guard = 5000;
    while (used > limitBytes && guard-- > 0) {
      const [oldest] = listRetentionCandidates(1);
      if (!oldest) break; // só resta o segmento em gravação
      deleteFull(oldest);
      removed += 1;
      used -= oldest.fileSize;
    }
  }

  return removed;
}
