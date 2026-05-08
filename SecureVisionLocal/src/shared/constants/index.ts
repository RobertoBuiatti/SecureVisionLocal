export const APP_NAME = 'SecureVision Local';
export const APP_VERSION = '0.0.1';

export const API_BASE_URL = 'http://localhost:8080/api';
export const API_TIMEOUT = 30000;
export const API_RETRY_ATTEMPTS = 3;

export const STORAGE_KEYS = {
  CAMERAS: '@securevision/cameras',
  RECORDINGS: '@securevision/recordings',
  SETTINGS: '@securevision/settings',
  AUTOMATIONS: '@securevision/automations',
  AUTH_TOKEN: '@securevision/auth_token',
  LAST_SYNC: '@securevision/last_sync',
} as const;

export const MAX_CAMERAS = 16;
export const MAX_PRESETS_PER_CAMERA = 16;
export const MAX_RECORDING_SIZE_MB = 2048;
export const DEFAULT_RECORDING_QUALITY = 'high';

export const RECORDING_QUALITY = {
  LOW: { bitrate: 512000, resolution: '480p' },
  MEDIUM: { bitrate: 1024000, resolution: '720p' },
  HIGH: { bitrate: 2048000, resolution: '1080p' },
  ULTRA: { bitrate: 4096000, resolution: '4K' },
} as const;

export const VIDEO_GRID_SIZES = [1, 2, 3, 4] as const;
export const DEFAULT_GRID_SIZE = 2;

export const PTZ_SPEED = {
  MIN: 1,
  MAX: 100,
  DEFAULT: 50,
} as const;

export const PTZ_LIMITS = {
  PAN_MIN: -180,
  PAN_MAX: 180,
  TILT_MIN: -90,
  TILT_MAX: 90,
  ZOOM_MIN: 1,
  ZOOM_MAX: 30,
} as const;

export const MOTION_DETECTION = {
  DEFAULT_SENSITIVITY: 50,
  MIN_SENSITIVITY: 1,
  MAX_SENSITIVITY: 100,
  DEFAULT_THRESHOLD: 25,
} as const;

export const NOTIFICATION_TYPES = {
  MOTION: 'motion',
  RECORDING: 'recording',
  ERROR: 'error',
  SYSTEM: 'system',
} as const;

export const CAMERA_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  ERROR: 'error',
  CONNECTING: 'connecting',
} as const;

export const CAMERA_PROTOCOLS = {
  RTSP: 'rtsp',
  ONVIF: 'onvif',
  HTTP: 'http',
  MJPEG: 'mjpeg',
} as const;

export const CAMERA_TYPES = {
  PTZ: 'ptz',
  DOME: 'dome',
  BULLET: 'bullet',
  CUBE: 'cube',
  FISHEYE: 'fisheye',
} as const;

export const RECORDING_TYPES = {
  CONTINUOUS: 'continuous',
  MOTION: 'motion',
  MANUAL: 'manual',
} as const;

export const AUTOMATION_TRIGGERS = {
  MOTION: 'motion',
  SCHEDULE: 'schedule',
  CAMERA_STATUS: 'camera_status',
  EXTERNAL: 'external',
} as const;

export const AUTOMATION_ACTIONS = {
  START_RECORDING: 'startRecording',
  STOP_RECORDING: 'stopRecording',
  SEND_NOTIFICATION: 'sendNotification',
  MOVE_CAMERA: 'moveCamera',
  TRIGGER_PRESET: 'triggerPreset',
  HTTP_REQUEST: 'httpRequest',
} as const;