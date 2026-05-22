import RNFS from 'react-native-fs';
import { streamingService } from '../streaming/streamingService';
import type { Recording as RecordingMetadata } from '@shared/types';

export type { RecordingMetadata };

export type RecordingMode = 'continuous' | 'motion' | 'scheduled' | 'manual';

export interface RecordingConfig {
  mode: RecordingMode;
  quality: 'low' | 'medium' | 'high';
  maxDuration: number;
  retentionDays: number;
  motionThreshold: number;
  motionZones?: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface RecordingStats {
  totalRecordings: number;
  totalSize: number;
  totalDuration: number;
  oldestRecording: number | null;
  newestRecording: number | null;
}

const DEFAULT_CONFIG: RecordingConfig = {
  mode: 'motion',
  quality: 'medium',
  maxDuration: 3600,
  retentionDays: 30,
  motionThreshold: 25,
};

export interface RecordingEvent {
  type: 'START' | 'STOP' | 'MOTION_DETECTED' | 'STORAGE_FULL' | 'ERROR';
  cameraId: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export type RecordingEventCallback = (event: RecordingEvent) => void;

class RecordingService {
  private static instance: RecordingService;
  private recordings: Map<string, RecordingMetadata[]> = new Map();
  private activeRecordings: Map<string, ReturnType<typeof setInterval>> = new Map();
  private listeners: Set<RecordingEventCallback> = new Set();
  private configs: Map<string, RecordingConfig> = new Map();
  private storagePath: string;
  private currentRecordingId: string | null = null;

  private constructor() {
    this.storagePath = `${RNFS.DocumentDirectoryPath}/recordings`;
  }

  public static getInstance(): RecordingService {
    if (!RecordingService.instance) {
      RecordingService.instance = new RecordingService();
    }
    return RecordingService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      const exists = await RNFS.exists(this.storagePath);
      if (!exists) {
        await RNFS.mkdir(this.storagePath);
        console.log('[Recording] Storage directory created');
      }
    } catch (error) {
      console.error('[Recording] Failed to initialize storage:', error);
    }
  }

  public addListener(callback: RecordingEventCallback): void {
    this.listeners.add(callback);
  }

  public removeListener(callback: RecordingEventCallback): void {
    this.listeners.delete(callback);
  }

  private emitEvent(event: RecordingEvent): void {
    this.listeners.forEach(callback => callback(event));
  }

  public setConfig(cameraId: string, config: Partial<RecordingConfig>): void {
    const currentConfig = this.configs.get(cameraId) || DEFAULT_CONFIG;
    this.configs.set(cameraId, { ...currentConfig, ...config });
  }

  public getConfig(cameraId: string): RecordingConfig {
    return this.configs.get(cameraId) || DEFAULT_CONFIG;
  }

  public async startRecording(cameraId: string): Promise<string | null> {
    const config = this.getConfig(cameraId);
    
    if (this.activeRecordings.has(cameraId)) {
      console.log('[Recording] Already recording');
      return this.currentRecordingId;
    }

    try {
      const recordingId = `rec_${cameraId}_${Date.now()}`;
      const timestamp = Date.now();
      const filename = `${recordingId}.mp4`;
      const filepath = `${this.storagePath}/${filename}`;

      const metadata = {
        id: recordingId,
        cameraId,
        filepath,
        filename,
        startTime: timestamp,
        endTime: null,
        duration: 0,
        size: 0,
        quality: config.quality,
        mode: config.mode,
        hasMotion: false,
        motionClips: [],
      };

      const recordings = this.recordings.get(cameraId) || [];
      recordings.unshift({
        id: recordingId,
        cameraId,
        filepath,
        filename,
        cameraName: '',
        date: new Date(timestamp).toLocaleString('pt-BR'),
        duration: 0,
        size: '0 MB',
        hasMotion: false,
        startTime: timestamp,
        endTime: null,
        durationSeconds: 0,
        sizeBytes: 0,
        quality: config.quality,
        mode: config.mode,
        motionClips: [],
        status: 'recording',
        type: 'continuous',
        fileSize: 0,
      });

      this.recordings.set(cameraId, recordings);
      this.currentRecordingId = recordingId;

      const timer = setInterval(() => {
        this.updateRecordingProgress(cameraId, recordingId);
      }, 1000);

      this.activeRecordings.set(cameraId, timer);

      this.emitEvent({
        type: 'START',
        cameraId,
        data: { recordingId, mode: config.mode },
        timestamp,
      });

      console.log(`[Recording] Started recording ${recordingId} for camera ${cameraId}`);
      return recordingId;
    } catch (error) {
      this.emitEvent({
        type: 'ERROR',
        cameraId,
        data: { error: String(error) },
        timestamp: Date.now(),
      });
      console.error('[Recording] Failed to start recording:', error);
      return null;
    }
  }

  public async stopRecording(cameraId: string): Promise<void> {
    const timer = this.activeRecordings.get(cameraId);
    if (timer) {
      clearInterval(timer);
      this.activeRecordings.delete(cameraId);
    }

    const recordings = this.recordings.get(cameraId);
    if (recordings && recordings.length > 0) {
      const currentRecording = recordings[0];
      if (currentRecording.endTime === null) {
        const endTime = Date.now();
        const durationSeconds = Math.floor((endTime - currentRecording.startTime) / 1000);
        
        currentRecording.endTime = endTime;
        currentRecording.durationSeconds = durationSeconds;
        currentRecording.duration = durationSeconds;
        currentRecording.sizeBytes = Math.floor(durationSeconds * 100000);
        currentRecording.size = this.formatSize(currentRecording.sizeBytes);
      }
    }

    this.emitEvent({
      type: 'STOP',
      cameraId,
      timestamp: Date.now(),
    });

    console.log(`[Recording] Stopped recording for camera ${cameraId}`);
    this.currentRecordingId = null;
  }

  public isRecording(cameraId: string): boolean {
    return this.activeRecordings.has(cameraId);
  }

  public getRecordings(cameraId: string): RecordingMetadata[] {
    return this.recordings.get(cameraId) || [];
  }

  public getAllRecordings(): RecordingMetadata[] {
    const all: RecordingMetadata[] = [];
    this.recordings.forEach(recordings => {
      all.push(...recordings);
    });
    return all.sort((a, b) => b.startTime - a.startTime);
  }

  public async deleteRecording(cameraId: string, recordingId: string): Promise<boolean> {
    try {
      const recordings = this.recordings.get(cameraId);
      if (!recordings) return false;

      const recording = recordings.find(r => r.id === recordingId);
      if (recording && recording.filepath) {
        const exists = await RNFS.exists(recording.filepath);
        if (exists) {
          await RNFS.unlink(recording.filepath);
        }
        recordings.splice(recordings.findIndex(r => r.id === recordingId), 1);
        console.log(`[Recording] Deleted ${recordingId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Recording] Failed to delete:', error);
      return false;
    }
  }

  public async deleteOldRecordings(cameraId: string, retentionDays: number): Promise<number> {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const recordings = this.recordings.get(cameraId) || [];
    let deletedCount = 0;

    for (let i = recordings.length - 1; i >= 0; i--) {
      if (recordings[i].startTime < cutoffTime) {
        await this.deleteRecording(cameraId, recordings[i].id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  public async getStats(cameraId?: string): Promise<RecordingStats> {
    const recordings = cameraId ? this.getRecordings(cameraId) : this.getAllRecordings();
    
    if (recordings.length === 0) {
      return {
        totalRecordings: 0,
        totalSize: 0,
        totalDuration: 0,
        oldestRecording: null,
        newestRecording: null,
      };
    }

    let totalSize = 0;
    let totalDuration = 0;
    let oldestTime = recordings[0].startTime;
    let newestTime = recordings[0].startTime;

    recordings.forEach(rec => {
      totalSize += rec.sizeBytes || 0;
      totalDuration += rec.durationSeconds || 0;
      if (rec.startTime < oldestTime) oldestTime = rec.startTime;
      if (rec.startTime > newestTime) newestTime = rec.startTime;
    });

    return {
      totalRecordings: recordings.length,
      totalSize,
      totalDuration,
      oldestRecording: oldestTime,
      newestRecording: newestTime,
    };
  }

  public async checkStorage(): Promise<{ used: number; available: number; percentage: number }> {
    try {
      const info = await RNFS.getFSInfo();
      const used = info.totalSpace - info.freeSpace;
      const percentage = (used / info.totalSpace) * 100;
      
      if (percentage > 90) {
        this.emitEvent({
          type: 'STORAGE_FULL',
          cameraId: 'system',
          data: { percentage },
          timestamp: Date.now(),
        });
      }

      return {
        used,
        available: info.totalSpace,
        percentage,
      };
    } catch {
      return { used: 0, available: 0, percentage: 0 };
    }
  }

  private updateRecordingProgress(cameraId: string, recordingId: string): void {
    const recordings = this.recordings.get(cameraId);
    if (!recordings) return;

    const recording = recordings.find(r => r.id === recordingId);
    if (!recording) return;

    const now = Date.now();
    const durationSeconds = Math.floor((now - recording.startTime) / 1000);
    const sizeBytes = Math.floor(durationSeconds * 100000);

    recording.durationSeconds = durationSeconds;
    recording.duration = durationSeconds;
    recording.sizeBytes = sizeBytes;
    recording.size = this.formatSize(sizeBytes);

    const config = this.getConfig(cameraId);
    if (config.maxDuration > 0 && durationSeconds >= config.maxDuration) {
      this.stopRecording(cameraId);
    }
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  public findByDateRange(cameraId: string, startDate: Date, endDate: Date): RecordingMetadata[] {
    const recordings = this.getRecordings(cameraId);
    return recordings.filter(r => {
      const recordTime = new Date(r.startTime);
      return recordTime >= startDate && recordTime <= endDate;
    });
  }

  public findByMotion(cameraId: string, hasMotion: boolean): RecordingMetadata[] {
    const recordings = this.getRecordings(cameraId);
    return recordings.filter(r => r.hasMotion === hasMotion);
  }

  public addMockRecording(cameraId: string, overrides: Partial<RecordingMetadata> & { hasMotion?: boolean }): void {
    const recordings = this.recordings.get(cameraId) || [];
    const entry: RecordingMetadata = {
      id: `rec_${cameraId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      cameraId,
      cameraName: '',
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      durationSeconds: 0,
      size: '0 MB',
      sizeBytes: 0,
      hasMotion: false,
      filepath: '',
      filename: '',
      date: new Date().toLocaleString('pt-BR'),
      quality: 'medium',
      mode: 'motion',
      motionClips: [],
      fileSize: 0,
      status: 'completed',
      type: 'motion',
      ...overrides,
    };
    recordings.unshift(entry);
    this.recordings.set(cameraId, recordings);
  }
}

export const recordingService = RecordingService.getInstance();