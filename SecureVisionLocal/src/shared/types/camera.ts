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
  isRecording: boolean;
  quality: 'low' | 'medium' | 'high';
  currentFps: number;
  bitrate: number;
  latency: number;
  error?: string;
}

export type PTZMode = 'manual' | 'auto' | 'event' | 'scheduled' | 'sequential';

export interface PTZState {
  cameraId: string;
  mode: PTZMode;
  currentTourId?: string;
  currentPresetIndex?: number;
  isMoving: boolean;
}