import type { Camera, CameraStream } from '@shared/types';

export type StreamQuality = 'low' | 'medium' | 'high';

export type StreamEventCallback = (event: StreamEvent) => void;

export interface StreamEvent {
  type: 'CONNECT' | 'DISCONNECT' | 'ERROR' | 'QUALITY_CHANGE' | 'FPS_UPDATE';
  cameraId: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface StreamConfig {
  quality: StreamQuality;
  enableAudio: boolean;
  bufferSize: number;
  reconnectInterval: number;
  maxRetries: number;
}

const DEFAULT_STREAM_CONFIG: StreamConfig = {
  quality: 'medium',
  enableAudio: false,
  bufferSize: 3000,
  reconnectInterval: 5000,
  maxRetries: 3,
};

class StreamingService {
  private static instance: StreamingService;
  private streams: Map<string, CameraStream> = new Map();
  private listeners: Set<StreamEventCallback> = new Set();
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private streamConfigs: Map<string, StreamConfig> = new Map();
  private activeConnections: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): StreamingService {
    if (!StreamingService.instance) {
      StreamingService.instance = new StreamingService();
    }
    return StreamingService.instance;
  }

  public addListener(callback: StreamEventCallback): void {
    this.listeners.add(callback);
  }

  public removeListener(callback: StreamEventCallback): void {
    this.listeners.delete(callback);
  }

  private emitEvent(event: StreamEvent): void {
    this.listeners.forEach(callback => callback(event));
  }

  public setConfig(cameraId: string, config: Partial<StreamConfig>): void {
    const currentConfig = this.streamConfigs.get(cameraId) || DEFAULT_STREAM_CONFIG;
    this.streamConfigs.set(cameraId, { ...currentConfig, ...config });
  }

  public getConfig(cameraId: string): StreamConfig {
    return this.streamConfigs.get(cameraId) || DEFAULT_STREAM_CONFIG;
  }

  public async connect(camera: Camera): Promise<boolean> {
    try {
      this.emitEvent({
        type: 'CONNECT',
        cameraId: camera.id,
        data: { 
          url: camera.streamUrl,
          protocol: camera.protocol,
          quality: this.getConfig(camera.id).quality 
        },
        timestamp: Date.now(),
      });

      this.streams.set(camera.id, {
        cameraId: camera.id,
        isPlaying: true,
        isRecording: false,
        quality: this.getConfig(camera.id).quality,
        currentFps: 30,
        bitrate: this.getBitrate(camera.protocol, this.getConfig(camera.id).quality),
        latency: 100,
      });

      this.activeConnections.add(camera.id);
      
      console.log(`[Stream] Connected to ${camera.name} (${camera.protocol.toUpperCase()})`);
      return true;
    } catch (error) {
      this.emitEvent({
        type: 'ERROR',
        cameraId: camera.id,
        data: { error: String(error) },
        timestamp: Date.now(),
      });
      console.error(`[Stream] Failed to connect to ${camera.name}:`, error);
      return false;
    }
  }

  public async disconnect(cameraId: string): Promise<void> {
    const timer = this.reconnectTimers.get(cameraId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(cameraId);
    }

    const stream = this.streams.get(cameraId);
    if (stream) {
      stream.isPlaying = false;
      stream.error = undefined;
    }

    this.activeConnections.delete(cameraId);
    this.streams.set(cameraId, {
      cameraId,
      isPlaying: false,
      isRecording: false,
      quality: 'medium',
      currentFps: 0,
      bitrate: 0,
      latency: 0,
    });

    this.emitEvent({
      type: 'DISCONNECT',
      cameraId,
      timestamp: Date.now(),
    });

    console.log(`[Stream] Disconnected from camera ${cameraId}`);
  }

  public getStream(cameraId: string): CameraStream | undefined {
    return this.streams.get(cameraId);
  }

  public isConnected(cameraId: string): boolean {
    return this.activeConnections.has(cameraId);
  }

  public async changeQuality(cameraId: string, quality: StreamQuality): Promise<void> {
    const stream = this.streams.get(cameraId);
    if (stream) {
      const config = this.getConfig(cameraId);
      config.quality = quality;
      this.streamConfigs.set(cameraId, config);
      
      stream.quality = quality;
      stream.bitrate = this.getBitrate('rtsp', quality);
      
      this.emitEvent({
        type: 'QUALITY_CHANGE',
        cameraId,
        data: { quality },
        timestamp: Date.now(),
      });

      console.log(`[Stream] Quality changed to ${quality} for camera ${cameraId}`);
    }
  }

  public updateStats(cameraId: string, stats: Partial<CameraStream>): void {
    const stream = this.streams.get(cameraId);
    if (stream) {
      this.streams.set(cameraId, { ...stream, ...stats });
    }
  }

  private getBitrate(protocol: string, quality: StreamQuality): number {
    const bitrates: Record<StreamQuality, Record<string, number>> = {
      low: { rtsp: 500000, onvif: 400000, http: 300000, mjpeg: 200000 },
      medium: { rtsp: 1500000, onvif: 1200000, http: 800000, mjpeg: 500000 },
      high: { rtsp: 4000000, onvif: 3500000, http: 2000000, mjpeg: 1000000 },
    };
    return bitrates[quality][protocol] || 1500000;
  }

  public getAllStreams(): CameraStream[] {
    return Array.from(this.streams.values());
  }

  public getActiveCount(): number {
    return this.activeConnections.size;
  }

  public async reconnect(cameraId: string, cameras: Camera[]): Promise<void> {
    const config = this.getConfig(cameraId);
    
    const existingTimer = this.reconnectTimers.get(cameraId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    let retries = 0;

    const attemptReconnect = async () => {
      const camera = cameras.find(c => c.id === cameraId);
      if (camera && retries < config.maxRetries) {
        retries++;
        console.log(`[Stream] Reconnect attempt ${retries}/${config.maxRetries} for ${camera.name}`);
        
        const success = await this.connect(camera);
        if (!success && retries < config.maxRetries) {
          const timer = setTimeout(attemptReconnect, config.reconnectInterval);
          this.reconnectTimers.set(cameraId, timer);
        }
      } else {
        this.reconnectTimers.delete(cameraId);
      }
    };

    attemptReconnect();
  }
}

export const streamingService = StreamingService.getInstance();