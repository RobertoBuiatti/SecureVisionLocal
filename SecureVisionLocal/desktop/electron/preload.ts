import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../src/shared/ipc';
import type { SvlApi } from '../src/shared/ipc';

// Expõe uma API tipada e restrita ao renderer (contextIsolation ativo).
const api: SvlApi = {
  cameras: {
    list: () => ipcRenderer.invoke(IPC.camerasList),
    add: (data) => ipcRenderer.invoke(IPC.camerasAdd, data),
    update: (id, updates) => ipcRenderer.invoke(IPC.camerasUpdate, id, updates),
    remove: (id) => ipcRenderer.invoke(IPC.camerasRemove, id),
    test: (id) => ipcRenderer.invoke(IPC.camerasTest, id),
  },
  discovery: {
    scan: (opts) => ipcRenderer.invoke(IPC.discoveryScan, opts),
    onResult: (cb) => {
      const listener = (_e: unknown, cam: Parameters<typeof cb>[0]) => cb(cam);
      ipcRenderer.on(IPC.evtDiscovery, listener);
      return () => ipcRenderer.off(IPC.evtDiscovery, listener);
    },
    probeOnvif: (ip, username, password) =>
      ipcRenderer.invoke(IPC.onvifProbe, ip, username, password),
  },
  streaming: {
    start: (cameraId, quality) => ipcRenderer.invoke(IPC.streamStart, cameraId, quality),
    stop: (cameraId) => ipcRenderer.invoke(IPC.streamStop, cameraId),
  },
  recording: {
    start: (cameraId) => ipcRenderer.invoke(IPC.recordingStart, cameraId),
    stop: (cameraId) => ipcRenderer.invoke(IPC.recordingStop, cameraId),
    list: (cameraId) => ipcRenderer.invoke(IPC.recordingList, cameraId),
    remove: (id) => ipcRenderer.invoke(IPC.recordingRemove, id),
    playStart: (recordingId) => ipcRenderer.invoke(IPC.recordingPlayStart, recordingId),
    playStop: (recordingId) => ipcRenderer.invoke(IPC.recordingPlayStop, recordingId),
  },
  ptz: {
    control: (cameraId, cmd) => ipcRenderer.invoke(IPC.ptzControl, cameraId, cmd),
    savePreset: (cameraId, name) => ipcRenderer.invoke(IPC.ptzSavePreset, cameraId, name),
    listPresets: (cameraId) => ipcRenderer.invoke(IPC.ptzListPresets, cameraId),
    deletePreset: (id) => ipcRenderer.invoke(IPC.ptzDeletePreset, id),
    gotoPreset: (cameraId, token) => ipcRenderer.invoke(IPC.ptzGotoPreset, cameraId, token),
    createTour: (cameraId, name, steps) =>
      ipcRenderer.invoke(IPC.ptzCreateTour, cameraId, name, steps),
    updateTour: (tourId, name, steps) =>
      ipcRenderer.invoke(IPC.ptzUpdateTour, tourId, name, steps),
    listTours: (cameraId) => ipcRenderer.invoke(IPC.ptzListTours, cameraId),
    deleteTour: (id) => ipcRenderer.invoke(IPC.ptzDeleteTour, id),
    startTour: (tourId) => ipcRenderer.invoke(IPC.ptzStartTour, tourId),
    stopTour: (cameraId) => ipcRenderer.invoke(IPC.ptzStopTour, cameraId),
    tourStatus: (cameraId) => ipcRenderer.invoke(IPC.ptzTourStatus, cameraId),
    presetSnapshot: (presetId) => ipcRenderer.invoke(IPC.ptzPresetSnapshot, presetId),
    verifyPositions: (cameraId) => ipcRenderer.invoke(IPC.ptzVerifyPositions, cameraId),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (updates) => ipcRenderer.invoke(IPC.settingsUpdate, updates),
  },
  detection: {
    getConfig: (cameraId) => ipcRenderer.invoke(IPC.detectionGetConfig, cameraId),
    setConfig: (cameraId, config) => ipcRenderer.invoke(IPC.detectionSetConfig, cameraId, config),
    listEvents: () => ipcRenderer.invoke(IPC.detectionListEvents),
    onEvent: (cb) => {
      const listener = (_e: unknown, ev: Parameters<typeof cb>[0]) => cb(ev);
      ipcRenderer.on(IPC.evtDetection, listener);
      return () => ipcRenderer.off(IPC.evtDetection, listener);
    },
    aiStatus: () => ipcRenderer.invoke(IPC.detectionAiStatus),
  },
  system: {
    status: () => ipcRenderer.invoke(IPC.systemStatus),
    storageUsage: () => ipcRenderer.invoke(IPC.storageUsage),
    runRetention: () => ipcRenderer.invoke(IPC.retentionRun),
    serverInfo: () => ipcRenderer.invoke(IPC.serverInfo),
  },
  events: {
    onCameraStatus: (cb) => {
      const listener = (_e: unknown, p: Parameters<typeof cb>[0]) => cb(p);
      ipcRenderer.on(IPC.evtCameraStatus, listener);
      return () => ipcRenderer.off(IPC.evtCameraStatus, listener);
    },
    onStreamStatus: (cb) => {
      const listener = (_e: unknown, p: Parameters<typeof cb>[0]) => cb(p);
      ipcRenderer.on(IPC.evtStreamStatus, listener);
      return () => ipcRenderer.off(IPC.evtStreamStatus, listener);
    },
  },
};

contextBridge.exposeInMainWorld('svl', api);
