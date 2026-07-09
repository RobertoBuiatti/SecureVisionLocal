import { join } from 'node:path';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import type { Camera, DetectionType } from '../../../src/shared/types';
import { captureJpeg } from '../snapshotService';
import { insertSnapshot, countSnapshotsByCamera, deleteOldestSnapshot, listSnapshots } from '../detectionSnapshotRepository';
import { insertCameraLog } from '../cameraLogger';

const MIN_INTERVAL_MS = 5000;
const lastCapture = new Map<string, number>();

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export async function captureDetectionSnapshot(
  camera: Camera,
  detectionType: DetectionType,
  score: number,
  snapshotsPath: string,
  maxCount: number,
): Promise<void> {
  const now = Date.now();
  const last = lastCapture.get(camera.id) ?? 0;
  if (now - last < MIN_INTERVAL_MS) return;
  lastCapture.set(camera.id, now);

  const cameraDir = join(snapshotsPath, camera.id);
  ensureDir(cameraDir);

  const fileName = `${now}_${detectionType}.jpg`;
  const filePath = join(cameraDir, fileName);

  const ok = await captureJpeg(camera, filePath);
  if (!ok) return;

  insertSnapshot({
    cameraId: camera.id,
    detectionType,
    timestamp: now,
    filePath,
    score: Math.round(score * 100),
  });
  let fileSize = 0;
  try { fileSize = statSync(filePath).size; } catch { /* noop */ }
  insertCameraLog(
    camera.id,
    camera.name,
    'info',
    `Snapshot por ${detectionType} de "${camera.name}" salvo (${Math.round(fileSize / 1024)}KB, score ${Math.round(score)})`,
    `Câmera: ${camera.name}\nArquivo: ${filePath}\nTamanho: ${Math.round(fileSize / 1024)}KB\nScore: ${Math.round(score)}\nTipo: ${detectionType}\n\nSnapshot capturado automaticamente após detecção de movimento.`,
    'snapshot',
  );

  const total = countSnapshotsByCamera(camera.id);
  if (total > maxCount) {
    const toDelete = total - maxCount;
    for (let i = 0; i < toDelete; i++) {
      deleteOldestSnapshot(camera.id);
    }
  }
}
