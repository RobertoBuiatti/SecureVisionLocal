import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { IPC } from '../../src/shared/ipc';
import type {
  Camera,
  CreateCameraDTO,
  PTZCommand,
  AppSettings,
  RecordingSchedule,
} from '../../src/shared/types';
import {
  listCameras,
  addCamera,
  updateCamera,
  removeCamera,
  getCamera,
} from '../core/cameraRepository';
import { discover } from '../core/discovery';
import { probeOnvifDevice } from '../core/onvifInfo';
import { getVideoEncoderInfo, setVideoResolution } from '../core/videoEncoder';
import type { VideoResolution } from '../../src/shared/types';
import { streamingService } from '../core/streaming';
import { recordingService } from '../core/recording';
import { continuousRecordingService } from '../core/continuousRecording';
import { motionDetectionService } from '../core/motionDetection';
import { aiDetectionService, isAiRuntimeAvailable } from '../core/ai/aiDetection';
import { isModelReady, isDownloading, modelsDir } from '../core/ai/modelManager';
import type { AiStatus } from '../../src/shared/types';
import { listRecordings, getRecording, deleteRecording } from '../core/recordingRepository';
import { controlPtz, savePresetOnvif, gotoPresetOnvif, updatePresetOnvif, disconnectCamera } from '../core/ptz';
import {
  listPresets,
  addPreset,
  getPreset,
  deletePreset,
  updatePreset,
  setPresetSnapshot,
  listTours,
  getTour,
  addTour,
  updateTour,
  deleteTour,
} from '../core/ptzRepository';
import { tourRunner } from '../core/tourRunner';
import { positionVerifier } from '../core/positionVerifier';
import { captureJpeg, presetsSnapshotDir } from '../core/snapshotService';
import { computeAndSaveReferenceEmbedding } from '../core/ai/aiVerifier';
import type { PTZTourStep } from '../../src/shared/types';
import { join } from 'node:path';
import { readFile, copyFile } from 'node:fs/promises';
import { listSchedules, upsertSchedule, deleteSchedule } from '../core/scheduleRepository';
import { testConnection } from '../core/connection';
import { getSettings, updateSettings } from '../core/settings';
import { applyStartWithWindows } from '../core/autostart';
import { getSystemStatus } from '../core/system';
import { recordingManager } from '../core/recordingManager';
import { getStorageUsage, enforceRetention, purgeAll } from '../core/retention';
import { localServer } from '../server/localServer';
import { getDetectionConfig, setDetectionConfig, listDetectionEvents } from '../core/detectionRepository';
import { detectionManager } from '../core/detectionManager';
import type { DetectionConfig, ReferenceMark } from '../../src/shared/types';
import { unlink } from 'node:fs/promises';
import {
  saveReferenceMarks,
  getReferenceMarks,
} from '../core/referenceMarksRepository';
import { detectFeatures } from '../core/referenceVerifier';
import {
  listSnapshots,
  getSnapshotById,
  deleteSnapshot,
} from '../core/detectionSnapshotRepository';

// Registra todos os handlers IPC (ponte UI ↔ núcleo).
export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // ---- Câmeras ----
  ipcMain.handle(IPC.camerasList, () => listCameras());
  ipcMain.handle(IPC.camerasAdd, (_e, data: CreateCameraDTO) => {
    const camera = addCamera(data);
    recordingManager.applyCamera(camera); // inicia 24/7 se marcado
    return camera;
  });
  ipcMain.handle(IPC.camerasUpdate, (_e, id: string, updates: Partial<Camera>) => {
    const camera = updateCamera(id, updates);
    if (camera) recordingManager.applyCamera(camera); // liga/desliga 24/7
    disconnectCamera(id); // invalida sessão ONVIF (IP/credenciais podem ter mudado)
    return camera;
  });
  ipcMain.handle(IPC.camerasRemove, (_e, id: string) => {
    streamingService.stop(id);
    recordingService.stop(id);
    continuousRecordingService.stop(id);
    tourRunner.stop(id);
    motionDetectionService.stop(id);
    aiDetectionService.stop(id);
    disconnectCamera(id); // encerra sessão ONVIF e watchdog pendente
    return removeCamera(id);
  });
  ipcMain.handle(IPC.camerasTest, async (_e, id: string) => {
    const camera = getCamera(id);
    if (!camera) {
      return { success: false, latency: null, error: 'Câmera não encontrada', timestamp: Date.now() };
    }
    const result = await testConnection(camera);
    updateCamera(id, { status: result.success ? 'online' : 'offline' });
    const win = getWindow();
    win?.webContents.send(IPC.evtCameraStatus, {
      cameraId: id,
      status: result.success ? 'online' : 'offline',
    });
    return result;
  });

  // ---- Resolução do encoder (ONVIF) ----
  ipcMain.handle(IPC.camerasVideoOptions, async (_e, id: string) => {
    const camera = getCamera(id);
    if (!camera) return { supported: false, current: null, resolutions: [] };
    return getVideoEncoderInfo(camera);
  });
  ipcMain.handle(IPC.camerasSetResolution, async (_e, id: string, resolution: VideoResolution) => {
    const camera = getCamera(id);
    if (!camera) return false;
    const ok = await setVideoResolution(camera, resolution);
    if (ok) {
      // A câmera reinicia o stream ao aplicar; derruba o pipeline atual para
      // reconectar já na nova resolução.
      streamingService.stop(id);
    }
    return ok;
  });

  // ---- Descoberta ----
  ipcMain.handle(IPC.discoveryScan, (_e, opts) => discover(opts ?? {}));
  ipcMain.handle(IPC.onvifProbe, (_e, ip: string, username: string, password: string) =>
    probeOnvifDevice(ip, username, password),
  );

  // ---- Streaming ----
  ipcMain.handle(IPC.streamStart, (_e, cameraId: string, quality?: 'low' | 'high') => {
    const camera = getCamera(cameraId);
    if (!camera) throw new Error('Câmera não encontrada');
    return streamingService.start(camera, quality);
  });
  ipcMain.handle(IPC.streamStop, (_e, cameraId: string) => streamingService.stop(cameraId));

  // ---- Gravação ----
  ipcMain.handle(IPC.recordingStart, (_e, cameraId: string) => {
    const camera = getCamera(cameraId);
    if (!camera) throw new Error('Câmera não encontrada');
    const rec = recordingService.start(camera, 'manual');
    updateCamera(cameraId, { status: 'online' });
    return rec;
  });
  ipcMain.handle(IPC.recordingStop, (_e, cameraId: string) => recordingService.stop(cameraId));
  ipcMain.handle(IPC.recordingList, (_e, cameraId?: string) => listRecordings(cameraId));
  ipcMain.handle(IPC.recordingPlayStart, (_e, recordingId: string) => {
    const rec = getRecording(recordingId);
    if (!rec) throw new Error('Gravação não encontrada');
    return streamingService.startFile(recordingId, rec.filePath);
  });
  ipcMain.handle(IPC.recordingPlayStop, (_e, recordingId: string) =>
    streamingService.stop(recordingId),
  );
  ipcMain.handle(IPC.recordingRemove, async (_e, id: string) => {
    const rec = getRecording(id);
    if (rec?.filePath) {
      try {
        await unlink(rec.filePath);
      } catch {
        /* arquivo já removido */
      }
    }
    return deleteRecording(id);
  });

  // Abre o diálogo "Salvar como" usando a janela principal quando disponível.
  async function askSavePath(opts: Electron.SaveDialogOptions): Promise<string | null> {
    const win = getWindow();
    const result = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts);
    return result.canceled || !result.filePath ? null : result.filePath;
  }

  // Exportar/baixar um clipe de gravação para a pasta escolhida pelo usuário.
  ipcMain.handle(IPC.recordingExport, async (_e, id: string) => {
    const rec = getRecording(id);
    if (!rec?.filePath) return { saved: false };
    const ts = new Date(rec.startTime).toISOString().replace(/[:.]/g, '-');
    const dest = await askSavePath({
      title: 'Exportar gravação',
      defaultPath: `${rec.cameraName ?? rec.cameraId}_${ts}.mp4`,
      filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
    });
    if (!dest) return { saved: false };
    await copyFile(rec.filePath, dest);
    return { saved: true, path: dest };
  });

  // ---- Snapshot ao vivo ----
  ipcMain.handle(IPC.cameraSnapshot, async (_e, cameraId: string) => {
    const camera = getCamera(cameraId);
    if (!camera) return { saved: false };
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = await askSavePath({
      title: 'Salvar snapshot',
      defaultPath: `${camera.name}_${ts}.jpg`,
      filters: [{ name: 'Imagem JPEG', extensions: ['jpg'] }],
    });
    if (!dest) return { saved: false };
    const ok = await captureJpeg(camera, dest);
    return ok ? { saved: true, path: dest } : { saved: false };
  });

  // ---- Agendamento de gravação ----
  ipcMain.handle(IPC.scheduleList, (_e, cameraId?: string) => listSchedules(cameraId));
  ipcMain.handle(IPC.scheduleSet, (_e, schedule: RecordingSchedule) => {
    const saved = upsertSchedule(schedule);
    const camera = getCamera(saved.cameraId);
    if (camera) recordingManager.applyCamera(camera); // aplica a janela imediatamente
    return saved;
  });
  ipcMain.handle(IPC.scheduleDelete, (_e, id: string) => deleteSchedule(id));

  // ---- PTZ ----
  ipcMain.handle(IPC.ptzControl, (_e, cameraId: string, cmd: PTZCommand) => {
    const camera = getCamera(cameraId);
    if (!camera) return false;
    return controlPtz(camera, cmd);
  });

  // Presets PTZ
  ipcMain.handle(IPC.ptzSavePreset, async (_e, cameraId: string, name: string) => {
    const camera = getCamera(cameraId);
    if (!camera) return null;
    const token = await savePresetOnvif(camera, name);
    if (!token) return null;
    const preset = addPreset(cameraId, name, token);
    // Captura a imagem de referência da posição (a câmera já está nela).
    const snapPath = join(presetsSnapshotDir(), `${preset.id}.jpg`);
    const ok = await captureJpeg(camera, snapPath);
    if (ok) {
      setPresetSnapshot(preset.id, snapPath);
      preset.snapshotPath = snapPath;
      // Embedding AI de referência (best-effort)
      const aiUrl = camera.subStreamUrl || camera.streamUrl;
      computeAndSaveReferenceEmbedding(aiUrl, preset.id).catch(() => {});
    }
    return preset;
  });
  ipcMain.handle(IPC.ptzListPresets, (_e, cameraId: string) => listPresets(cameraId));
  ipcMain.handle(IPC.ptzDeletePreset, (_e, id: string) => deletePreset(id));
  ipcMain.handle(IPC.ptzUpdatePreset, async (_e, presetId: string, name: string) => {
    const updated = updatePreset(presetId, name);
    return updated;
  });
  ipcMain.handle(IPC.ptzUpdatePresetPosition, async (_e, cameraId: string, presetId: string) => {
    const preset = getPreset(presetId);
    if (!preset) return null;
    const camera = getCamera(cameraId);
    if (!camera) return null;
    const ok = await updatePresetOnvif(camera, preset.token);
    if (!ok) return null;
    // Re-captura o snapshot de referência da posição atual.
    const snapPath = join(presetsSnapshotDir(), `${preset.id}.jpg`);
    const captured = await captureJpeg(camera, snapPath);
    if (captured) {
      setPresetSnapshot(preset.id, snapPath);
      preset.snapshotPath = snapPath;
      // Re-computa embedding AI para a nova referência
      const aiUrl = camera.subStreamUrl || camera.streamUrl;
      computeAndSaveReferenceEmbedding(aiUrl, preset.id).catch(() => {});
    }
    return getPreset(presetId); // retorna dados atualizados do DB
  });
  ipcMain.handle(IPC.ptzGotoPreset, (_e, cameraId: string, token: string) => {
    const camera = getCamera(cameraId);
    if (!camera) return false;
    return gotoPresetOnvif(camera, token);
  });

  // Rotas (tours) PTZ — ciclo automático
  ipcMain.handle(IPC.ptzCreateTour, (_e, cameraId: string, name: string, steps: PTZTourStep[]) =>
    addTour(cameraId, name, steps),
  );
  ipcMain.handle(IPC.ptzUpdateTour, (_e, tourId: string, name: string, steps: PTZTourStep[]) =>
    updateTour(tourId, name, steps),
  );
  ipcMain.handle(IPC.ptzListTours, (_e, cameraId: string) => listTours(cameraId));
  ipcMain.handle(IPC.ptzDeleteTour, (_e, id: string) => {
    const tour = getTour(id);
    if (tour) tourRunner.stop(tour.cameraId);
    return deleteTour(id);
  });
  ipcMain.handle(IPC.ptzStartTour, (_e, tourId: string) => {
    const tour = getTour(tourId);
    if (!tour) return false;
    const camera = getCamera(tour.cameraId);
    if (!camera) return false;
    return tourRunner.start(camera, tour);
  });
  ipcMain.handle(IPC.ptzStopTour, (_e, cameraId: string) => tourRunner.stop(cameraId));
  ipcMain.handle(IPC.ptzTourStatus, (_e, cameraId: string) => tourRunner.status(cameraId));
  ipcMain.handle(IPC.ptzPresetSnapshot, async (_e, presetId: string) => {
    const preset = getPreset(presetId);
    if (!preset?.snapshotPath) return null;
    try {
      const buf = await readFile(preset.snapshotPath);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  });
  ipcMain.handle(IPC.ptzVerifyPositions, (_e, cameraId: string) =>
    positionVerifier.verifyCameraById(cameraId),
  );

  // ---- Reference Marks ----
  ipcMain.handle(
    IPC.ptzSaveReferenceMarks,
    (
      _e,
      presetId: string,
      marks: Omit<ReferenceMark, 'id' | 'presetId' | 'createdAt'>[],
    ) => saveReferenceMarks(presetId, marks),
  );
  ipcMain.handle(IPC.ptzGetReferenceMarks, (_e, presetId: string) =>
    getReferenceMarks(presetId),
  );
  ipcMain.handle(IPC.ptzDetectFeatures, async (_e, presetId: string) => {
    const preset = getPreset(presetId);
    if (!preset) return [];
    return detectFeatures(presetId);
  });

  // ---- Detection Snapshots ----
  ipcMain.handle(IPC.detectionListSnapshots, (_e, cameraId: string) =>
    listSnapshots(cameraId),
  );
  ipcMain.handle(IPC.detectionGetSnapshotFile, async (_e, id: string) => {
    const snap = getSnapshotById(id);
    if (!snap) return null;
    try {
      const buf = await readFile(snap.filePath);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  });
  ipcMain.handle(IPC.detectionDeleteSnapshot, (_e, id: string) => {
    deleteSnapshot(id);
    return true;
  });

  // ---- Configurações ----
  ipcMain.handle(IPC.settingsGet, () => getSettings());
  ipcMain.handle(IPC.settingsUpdate, (_e, updates: Partial<AppSettings>) => {
    const updated = updateSettings(updates);
    // Reinicia o servidor se a ativação/porta mudou.
    if ('serverEnabled' in updates || 'serverPort' in updates) {
      localServer.applySettings();
    }
    // Sincroniza o registro de inicialização do Windows.
    if ('startWithWindows' in updates) {
      applyStartWithWindows();
    }
    return updated;
  });

  // ---- Detecção ----
  ipcMain.handle(IPC.detectionGetConfig, (_e, cameraId: string) => getDetectionConfig(cameraId));
  ipcMain.handle(IPC.detectionSetConfig, (_e, cameraId: string, config: DetectionConfig) => {
    const saved = setDetectionConfig(cameraId, config);
    detectionManager.applyCamera(cameraId);
    return saved;
  });
  ipcMain.handle(IPC.detectionListEvents, () => listDetectionEvents());
  ipcMain.handle(IPC.detectionAiStatus, (): AiStatus => {
    const available = isAiRuntimeAvailable();
    const objectModel = isModelReady('object');
    return {
      available,
      objectModel,
      downloading: isDownloading(),
      modelsDir: modelsDir(),
      message: !available
        ? 'Runtime de IA indisponível.'
        : objectModel
          ? undefined
          : 'O modelo de IA (pessoa/animal/veículo) é baixado automaticamente ao ativar a IA.',
    };
  });

  // ---- Sistema / Armazenamento / Servidor ----
  ipcMain.handle(IPC.systemStatus, () => getSystemStatus());
  ipcMain.handle(IPC.storageUsage, () => getStorageUsage());
  ipcMain.handle(IPC.retentionRun, () => purgeAll());
  ipcMain.handle(IPC.serverInfo, () => localServer.getInfo());
}
