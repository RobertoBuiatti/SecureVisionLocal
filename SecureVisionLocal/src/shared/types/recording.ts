export type RecordingType = 'continuous' | 'motion' | 'event' | 'manual';

export type RecordingStatus = 'recording' | 'completed' | 'corrupted' | 'paused' | 'stopped' | 'error';

export interface Recording {
  id: string;
  cameraId: string;
  cameraName?: string;
  type: RecordingType;
  status: RecordingStatus;
  startTime: number;
  endTime: number | null;
  duration: number;
  fileSize: number;
  filePath?: string;
  filepath?: string;
  thumbnail?: string;
  thumbnailPath?: string;
  hasMotion: boolean;
  hasPerson?: boolean;
  hasVehicle?: boolean;
  motionZones?: MotionZone[];
  durationSeconds?: number;
  quality?: 'low' | 'medium' | 'high';
  mode?: string;
  filename?: string;
  date?: string;
  motionClips?: unknown[];
  size?: string | number;
  sizeBytes?: number;
}

export interface MotionZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sensitivity: number;
  enabled: boolean;
}

export interface RecordingSchedule {
  id: string;
  cameraId: string;
  type: RecordingType;
  enabled: boolean;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  motionSettings?: MotionSettings;
}

export interface MotionSettings {
  enabled: boolean;
  sensitivity: number;
  minDuration: number;
  preRecordSeconds: number;
  postRecordSeconds: number;
  detectionZones?: MotionZone[];
}

export interface RecordingRetention {
  id: string;
  name: string;
  maxDays: number;
  maxStorageGB: number;
  autoDelete: boolean;
  quality: 'low' | 'medium' | 'high';
}

export interface RecordingSearchParams {
  cameraId?: string;
  startDate?: number;
  endDate?: number;
  type?: RecordingType;
  hasMotion?: boolean;
  limit?: number;
  offset?: number;
}