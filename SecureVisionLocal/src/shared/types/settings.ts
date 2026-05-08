import type { ThemeMode } from '@app/theme';

export type VideoQuality = 'low' | 'medium' | 'high' | 'ultra';

export type Language = 'pt-BR' | 'en-US' | 'es-ES';

export interface NotificationSettings {
  enabled: boolean;
  motion: boolean;
  recording: boolean;
  error: boolean;
  sound: boolean;
  vibration: boolean;
}

export interface StorageSettings {
  maxSizeMB: number;
  retentionDays: number;
  quality: VideoQuality;
  autoCleanup: boolean;
  recordOnMotion: boolean;
  preRecordSeconds: number;
  postRecordSeconds: number;
}

export interface NetworkSettings {
  timeout: number;
  retryAttempts: number;
  autoReconnect: boolean;
  bufferSize: number;
}

export interface DisplaySettings {
  gridSize: number;
  showFps: boolean;
  showTimestamp: boolean;
  showCameraName: boolean;
  autoCycle: boolean;
  cycleInterval: number;
}

export interface PTZSettings {
  speed: number;
  invertPan: boolean;
  invertTilt: boolean;
  enableJoystick: boolean;
  showPresetButtons: boolean;
}

export interface SecuritySettings {
  authEnabled: boolean;
  biometricUnlock: boolean;
  autoLockTimeout: number;
  encryptRecordings: boolean;
}

export interface Settings {
  theme: ThemeMode;
  language: Language;
  notifications: NotificationSettings;
  storage: StorageSettings;
  network: NetworkSettings;
  display: DisplaySettings;
  ptz: PTZSettings;
  security: SecuritySettings;
}

export const defaultSettings: Settings = {
  theme: 'dark',
  language: 'pt-BR',
  notifications: {
    enabled: true,
    motion: true,
    recording: true,
    error: true,
    sound: true,
    vibration: true,
  },
  storage: {
    maxSizeMB: 10240,
    retentionDays: 7,
    quality: 'high',
    autoCleanup: true,
    recordOnMotion: true,
    preRecordSeconds: 5,
    postRecordSeconds: 30,
  },
  network: {
    timeout: 30000,
    retryAttempts: 3,
    autoReconnect: true,
    bufferSize: 4096,
  },
  display: {
    gridSize: 4,
    showFps: true,
    showTimestamp: true,
    showCameraName: true,
    autoCycle: false,
    cycleInterval: 10,
  },
  ptz: {
    speed: 50,
    invertPan: false,
    invertTilt: false,
    enableJoystick: true,
    showPresetButtons: true,
  },
  security: {
    authEnabled: false,
    biometricUnlock: false,
    autoLockTimeout: 300,
    encryptRecordings: true,
  },
};