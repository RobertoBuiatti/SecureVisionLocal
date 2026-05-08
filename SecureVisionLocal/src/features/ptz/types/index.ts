export type PTZCommand =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'UP_LEFT'
  | 'UP_RIGHT'
  | 'DOWN_LEFT'
  | 'DOWN_RIGHT'
  | 'ZOOM_IN'
  | 'ZOOM_OUT'
  | 'FOCUS_NEAR'
  | 'FOCUS_FAR'
  | 'IRIS_OPEN'
  | 'IRIS_CLOSE'
  | 'STOP'
  | 'GOTO_PRESET'
  | 'SET_PRESET'
  | 'CLEAR_PRESET';

export type PTZSpeed = 'slow' | 'medium' | 'fast';

export type PTZOperationMode =
  | 'IDLE'
  | 'MANUAL'
  | 'AUTO_TOUR'
  | 'EVENT_TRIGGERED'
  | 'SCHEDULED'
  | 'SEQUENTIAL';

export interface PTZPosition {
  pan: number;
  tilt: number;
  zoom: number;
}

export interface PTZPreset {
  id: string;
  cameraId: string;
  name: string;
  presetNumber: number;
  position: PTZPosition;
  createdAt: number;
  updatedAt: number;
}

export interface PTZPresetGroup {
  id: string;
  cameraId: string;
  name: string;
  presets: string[];
  color?: string;
}

export interface PTZTour {
  id: string;
  cameraId: string;
  name: string;
  description?: string;
  presets: PTZTourPreset[];
  speed: PTZSpeed;
  transitionTime: number;
  loop: boolean;
  enabled: boolean;
  schedule?: PTZTourSchedule;
  createdAt: number;
  updatedAt: number;
}

export interface PTZTourPreset {
  presetId: string;
  duration: number;
}

export interface PTZTourSchedule {
  enabled: boolean;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
}

export interface PTZTourRun {
  tourId: string;
  currentPresetIndex: number;
  startedAt: number;
  isPaused: boolean;
  isRunning: boolean;
}

export interface PTZControlState {
  cameraId: string;
  operationMode: PTZOperationMode;
  activeTourId?: string;
  currentPreset?: PTZPreset;
  tourRun?: PTZTourRun;
  isMoving: boolean;
  lastCommand?: PTZCommand;
  lastCommandTime: number;
}

export interface PTZLimits {
  panMin: number;
  panMax: number;
  tiltMin: number;
  tiltMax: number;
  zoomMin: number;
  zoomMax: number;
  hasFocus: boolean;
  hasIris: boolean;
}

export const DEFAULT_PTZ_LIMITS: PTZLimits = {
  panMin: -180,
  panMax: 180,
  tiltMin: -90,
  tiltMax: 90,
  zoomMin: 1,
  zoomMax: 30,
  hasFocus: true,
  hasIris: true,
};