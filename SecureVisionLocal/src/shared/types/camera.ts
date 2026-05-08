export type CameraProtocol = 'rtsp' | 'onvif' | 'http' | 'mjpeg';

export type CameraStatus = 'online' | 'offline' | 'error' | 'connecting';

export type CameraType = 'ptz' | 'dome' | 'bullet' | 'cube' | 'fisheye';

export interface Camera {
  id: string;
  name: string;
  ip: string;
  port: number;
  protocol: CameraProtocol;
  type: CameraType;
  username?: string;
  password?: string;
  streamUrl: string;
  status: CameraStatus;
  thumbnail?: string;
  isRecording: boolean;
  hasPTZ: boolean;
  presetCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CameraStream {
  cameraId: string;
  isPlaying: boolean;
  quality: 'low' | 'medium' | 'high';
  currentFps: number;
  bitrate: number;
  latency: number;
  error?: string;
}

export interface PTZPreset {
  id: string;
  cameraId: string;
  name: string;
  position: number;
  x: number;
  y: number;
  zoom: number;
}

export interface PTZTour {
  id: string;
  cameraId: string;
  name: string;
  presets: PTZTourPreset[];
  speed: 'slow' | 'medium' | 'fast';
  isActive: boolean;
  schedule?: PTZTourSchedule;
}

export interface PTZTourPreset {
  presetId: string;
  duration: number;
  order: number;
}

export interface PTZTourSchedule {
  enabled: boolean;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
}

export type PTZMode = 'manual' | 'auto' | 'event' | 'scheduled' | 'sequential';

export interface PTZState {
  cameraId: string;
  mode: PTZMode;
  currentTourId?: string;
  currentPresetIndex?: number;
  isMoving: boolean;
}