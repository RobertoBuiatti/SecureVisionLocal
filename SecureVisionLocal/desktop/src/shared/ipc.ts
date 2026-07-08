// Contrato da API exposta pelo main process ao renderer via contextBridge.
// É a única superfície que a UI usa para falar com o núcleo (Node.js).
import type {
  Camera,
  CreateCameraDTO,
  DiscoveredCamera,
  OnvifProbeResult,
  DetectionConfig,
  DetectionEvent,
  DetectionSnapshot,
  ReferenceMark,
  AiStatus,
  Recording,
  StreamInfo,
  SystemStatus,
  StorageUsage,
  ServerInfo,
  AppSettings,
  PTZCommand,
  PTZPreset,
  PTZTour,
  PTZTourStep,
  PTZTourStatus,
  PositionCheckResult,
  ConnectionTestResult,
  RecordingSchedule,
  VideoEncoderInfo,
  VideoResolution,
} from './types';

// Nomes dos canais IPC (domínio:ação).
export const IPC = {
  camerasList: 'cameras:list',
  camerasAdd: 'cameras:add',
  camerasUpdate: 'cameras:update',
  camerasRemove: 'cameras:remove',
  camerasTest: 'cameras:test',
  camerasVideoOptions: 'cameras:video-options',
  camerasSetResolution: 'cameras:set-resolution',
  discoveryScan: 'discovery:scan',
  onvifProbe: 'onvif:probe',
  streamStart: 'stream:start',
  streamStop: 'stream:stop',
  recordingStart: 'recording:start',
  recordingStop: 'recording:stop',
  recordingList: 'recordings:list',
  recordingRemove: 'recordings:remove',
  recordingPlayStart: 'recordings:play-start',
  recordingPlayStop: 'recordings:play-stop',
  recordingExport: 'recordings:export',
  cameraSnapshot: 'camera:snapshot',
  scheduleList: 'schedule:list',
  scheduleSet: 'schedule:set',
  scheduleDelete: 'schedule:delete',
  ptzControl: 'ptz:control',
  ptzSavePreset: 'ptz:save-preset',
  ptzListPresets: 'ptz:list-presets',
  ptzDeletePreset: 'ptz:delete-preset',
  ptzGotoPreset: 'ptz:goto-preset',
  ptzCreateTour: 'ptz:create-tour',
  ptzListTours: 'ptz:list-tours',
  ptzDeleteTour: 'ptz:delete-tour',
  ptzUpdatePreset: 'ptz:update-preset',
  ptzUpdatePresetPosition: 'ptz:update-preset-position',
  ptzUpdateTour: 'ptz:update-tour',
  ptzStartTour: 'ptz:start-tour',
  ptzStopTour: 'ptz:stop-tour',
  ptzTourStatus: 'ptz:tour-status',
  ptzPresetSnapshot: 'ptz:preset-snapshot',
  ptzVerifyPositions: 'ptz:verify-positions',
  ptzSaveReferenceMarks: 'ptz:save-reference-marks',
  ptzGetReferenceMarks: 'ptz:get-reference-marks',
  ptzDetectFeatures: 'ptz:detect-features',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  detectionGetConfig: 'detection:get-config',
  detectionSetConfig: 'detection:set-config',
  detectionListEvents: 'detection:list-events',
  detectionAiStatus: 'detection:ai-status',
  detectionListSnapshots: 'detection:list-snapshots',
  detectionGetSnapshotFile: 'detection:get-snapshot-file',
  detectionDeleteSnapshot: 'detection:delete-snapshot',
  systemStatus: 'system:status',
  storageUsage: 'storage:usage',
  retentionRun: 'retention:run',
  serverInfo: 'server:info',
  // Eventos enviados do main → renderer
  evtCameraStatus: 'evt:camera-status',
  evtDiscovery: 'evt:discovery',
  evtRecording: 'evt:recording',
  evtStreamStatus: 'evt:stream-status',
  evtDetection: 'evt:detection',
} as const;

export interface SvlApi {
  cameras: {
    list: () => Promise<Camera[]>;
    add: (data: CreateCameraDTO) => Promise<Camera>;
    update: (id: string, updates: Partial<Camera>) => Promise<Camera | null>;
    remove: (id: string) => Promise<boolean>;
    test: (id: string) => Promise<ConnectionTestResult>;
    videoOptions: (id: string) => Promise<VideoEncoderInfo>;
    setResolution: (id: string, resolution: VideoResolution) => Promise<boolean>;
  };
  discovery: {
    scan: (opts?: { timeoutMs?: number; subnet?: string }) => Promise<DiscoveredCamera[]>;
    onResult: (cb: (cam: DiscoveredCamera) => void) => () => void;
    probeOnvif: (
      ip: string,
      username: string,
      password: string,
    ) => Promise<OnvifProbeResult | null>;
  };
  streaming: {
    start: (cameraId: string, quality?: 'low' | 'high') => Promise<StreamInfo>;
    stop: (cameraId: string) => Promise<void>;
  };
  recording: {
    start: (cameraId: string) => Promise<Recording>;
    stop: (cameraId: string) => Promise<void>;
    list: (cameraId?: string) => Promise<Recording[]>;
    remove: (id: string) => Promise<boolean>;
    playStart: (recordingId: string) => Promise<StreamInfo>;
    playStop: (recordingId: string) => Promise<void>;
    export: (id: string) => Promise<{ saved: boolean; path?: string }>;
  };
  snapshot: {
    capture: (cameraId: string) => Promise<{ saved: boolean; path?: string }>;
  };
  schedules: {
    list: (cameraId?: string) => Promise<RecordingSchedule[]>;
    set: (schedule: RecordingSchedule) => Promise<RecordingSchedule>;
    delete: (id: string) => Promise<boolean>;
  };
  ptz: {
    control: (cameraId: string, cmd: PTZCommand) => Promise<boolean>;
    savePreset: (cameraId: string, name: string) => Promise<PTZPreset | null>;
    listPresets: (cameraId: string) => Promise<PTZPreset[]>;
    deletePreset: (id: string) => Promise<boolean>;
    gotoPreset: (cameraId: string, token: string) => Promise<boolean>;
    updatePreset: (presetId: string, name: string) => Promise<PTZPreset | null>;
    updatePresetPosition: (cameraId: string, presetId: string) => Promise<PTZPreset | null>;
    createTour: (cameraId: string, name: string, steps: PTZTourStep[]) => Promise<PTZTour>;
    updateTour: (tourId: string, name: string, steps: PTZTourStep[]) => Promise<PTZTour | null>;
    listTours: (cameraId: string) => Promise<PTZTour[]>;
    deleteTour: (id: string) => Promise<boolean>;
    startTour: (tourId: string) => Promise<boolean>;
    stopTour: (cameraId: string) => Promise<void>;
    tourStatus: (cameraId: string) => Promise<PTZTourStatus>;
    presetSnapshot: (presetId: string) => Promise<string | null>;
    verifyPositions: (cameraId: string) => Promise<PositionCheckResult[]>;
    saveReferenceMarks: (
      presetId: string,
      marks: Omit<ReferenceMark, 'id' | 'presetId' | 'createdAt'>[],
    ) => Promise<ReferenceMark[]>;
    getReferenceMarks: (presetId: string) => Promise<ReferenceMark[]>;
    detectFeatures: (presetId: string) => Promise<Array<Omit<ReferenceMark, 'id' | 'presetId' | 'createdAt'>>>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    update: (updates: Partial<AppSettings>) => Promise<AppSettings>;
  };
  detection: {
    getConfig: (cameraId: string) => Promise<DetectionConfig>;
    setConfig: (cameraId: string, config: DetectionConfig) => Promise<DetectionConfig>;
    listEvents: () => Promise<DetectionEvent[]>;
    onEvent: (cb: (ev: DetectionEvent) => void) => () => void;
    aiStatus: () => Promise<AiStatus>;
    listSnapshots: (cameraId?: string) => Promise<DetectionSnapshot[]>;
    getSnapshotFile: (id: string) => Promise<string | null>;
    deleteSnapshot: (id: string) => Promise<boolean>;
  };
  system: {
    status: () => Promise<SystemStatus>;
    storageUsage: () => Promise<StorageUsage>;
    runRetention: () => Promise<number>;
    serverInfo: () => Promise<ServerInfo>;
  };
  events: {
    onCameraStatus: (cb: (p: { cameraId: string; status: string }) => void) => () => void;
    onStreamStatus: (
      cb: (p: { cameraId: string; status: 'running' | 'error'; error?: string }) => void,
    ) => () => void;
  };
}

declare global {
  interface Window {
    svl: SvlApi;
  }
}
