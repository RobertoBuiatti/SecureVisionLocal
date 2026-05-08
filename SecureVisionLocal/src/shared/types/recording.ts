export type RecordingType = 'continuous' | 'motion' | 'event' | 'manual';

export type RecordingStatus = 'recording' | 'paused' | 'stopped' | 'error';

export interface Recording {
  id: string;
  cameraId: string;
  type: RecordingType;
  status: RecordingStatus;
  startTime: number;
  endTime?: number;
  duration: number;
  fileSize: number;
  filePath: string;
  thumbnailPath?: string;
  hasMotion: boolean;
  motionZones?: MotionZone[];
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