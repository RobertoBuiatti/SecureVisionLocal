export interface MotionZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
  sensitivity: number;
}

export interface MotionEvent {
  cameraId: string;
  zoneId?: string;
  timestamp: number;
  intensity: number;
  triggeredZones: string[];
}

export interface MotionConfig {
  enabled: boolean;
  globalSensitivity: number;
  minContourArea: number;
  debounceMs: number;
  requireMultipleFrames: boolean;
  frameThreshold: number;
  zones: MotionZone[];
}

const DEFAULT_MOTION_CONFIG: MotionConfig = {
  enabled: true,
  globalSensitivity: 50,
  minContourArea: 100,
  debounceMs: 2000,
  requireMultipleFrames: true,
  frameThreshold: 3,
  zones: [],
};

class MotionDetectionService {
  private static instance: MotionDetectionService;
  private configs: Map<string, MotionConfig> = new Map();
  private listeners: Map<string, (event: MotionEvent) => void> = new Map();
  private lastMotionTime: Map<string, number> = new Map();
  private frameCounts: Map<string, number> = new Map();
  private isEnabled: Map<string, boolean> = new Map();

  private constructor() {}

  public static getInstance(): MotionDetectionService {
    if (!MotionDetectionService.instance) {
      MotionDetectionService.instance = new MotionDetectionService();
    }
    return MotionDetectionService.instance;
  }

  public setConfig(cameraId: string, config: Partial<MotionConfig>): void {
    const currentConfig = this.configs.get(cameraId) || DEFAULT_MOTION_CONFIG;
    this.configs.set(cameraId, { ...currentConfig, ...config });
  }

  public getConfig(cameraId: string): MotionConfig {
    return this.configs.get(cameraId) || DEFAULT_MOTION_CONFIG;
  }

  public addListener(cameraId: string, callback: (event: MotionEvent) => void): void {
    this.listeners.set(cameraId, callback);
  }

  public removeListener(cameraId: string): void {
    this.listeners.delete(cameraId);
  }

  public enableMotionDetection(cameraId: string, enabled: boolean): void {
    this.isEnabled.set(cameraId, enabled);
    console.log(`[Motion] ${enabled ? 'Enabled' : 'Disabled'} for camera ${cameraId}`);
  }

  public isMotionEnabled(cameraId: string): boolean {
    return this.isEnabled.get(cameraId) ?? true;
  }

  public addZone(cameraId: string, zone: MotionZone): void {
    const config = this.getConfig(cameraId);
    config.zones.push(zone);
    this.configs.set(cameraId, config);
  }

  public removeZone(cameraId: string, zoneId: string): void {
    const config = this.getConfig(cameraId);
    config.zones = config.zones.filter(z => z.id !== zoneId);
    this.configs.set(cameraId, config);
  }

  public updateZone(cameraId: string, zoneId: string, updates: Partial<MotionZone>): void {
    const config = this.getConfig(cameraId);
    const zoneIndex = config.zones.findIndex(z => z.id === zoneId);
    if (zoneIndex >= 0) {
      config.zones[zoneIndex] = { ...config.zones[zoneIndex], ...updates };
      this.configs.set(cameraId, config);
    }
  }

  public getZones(cameraId: string): MotionZone[] {
    return this.getConfig(cameraId).zones;
  }

  public analyzeFrame(cameraId: string, frameData: Uint8Array, width: number, height: number): boolean {
    const config = this.getConfig(cameraId);
    
    if (!config.enabled || !this.isEnabled.get(cameraId)) {
      return false;
    }

    const sensitivity = config.globalSensitivity / 100;
    const threshold = Math.floor(255 * (1 - sensitivity));

    let motionDetected = false;
    const triggeredZones: string[] = [];

    for (let i = 0; i < frameData.length; i += 4) {
      const r = frameData[i];
      const g = frameData[i + 1];
      const b = frameData[i + 2];
      const brightness = (r + g + b) / 3;

      if (brightness > threshold) {
        motionDetected = true;

        if (config.zones.length > 0) {
          const pixelX = (i / 4) % width;
          const pixelY = Math.floor((i / 4) / width);

          for (const zone of config.zones) {
            if (!zone.enabled) continue;
            
            if (
              pixelX >= zone.x &&
              pixelX <= zone.x + zone.width &&
              pixelY >= zone.y &&
              pixelY <= zone.y + zone.height
            ) {
              if (!triggeredZones.includes(zone.id)) {
                triggeredZones.push(zone.id);
              }
            }
          }
        }
      }
    }

    if (motionDetected) {
      const now = Date.now();
      const lastTime = this.lastMotionTime.get(cameraId) || 0;
      
      if (now - lastTime > config.debounceMs) {
        const currentCount = this.frameCounts.get(cameraId) || 0;
        const newCount = currentCount + 1;
        this.frameCounts.set(cameraId, newCount);

        const meetsThreshold = !config.requireMultipleFrames || 
          newCount >= config.frameThreshold;

        if (meetsThreshold && config.zones.length > 0 && triggeredZones.length > 0) {
          const callback = this.listeners.get(cameraId);
          if (callback) {
            callback({
              cameraId,
              timestamp: now,
              intensity: config.globalSensitivity,
              triggeredZones,
            });
          }
        } else if (meetsThreshold && config.zones.length === 0) {
          const callback = this.listeners.get(cameraId);
          if (callback) {
            callback({
              cameraId,
              timestamp: now,
              intensity: config.globalSensitivity,
              triggeredZones: [],
            });
          }
        }

        this.frameCounts.set(cameraId, 0);
        this.lastMotionTime.set(cameraId, now);

        return true;
      }
    } else {
      this.frameCounts.set(cameraId, 0);
    }

    return false;
  }

  public detectMotionSimple(currentFrame: Uint8Array, previousFrame: Uint8Array, width: number, height: number, threshold: number = 25): { detected: boolean; changedPixels: number } {
    let changedPixels = 0;
    const totalPixels = width * height;

    for (let i = 0; i < totalPixels; i++) {
      const currentIdx = i * 4;
      const prevIdx = i * 4;

      const diffR = Math.abs(currentFrame[currentIdx] - previousFrame[prevIdx]);
      const diffG = Math.abs(currentFrame[currentIdx + 1] - previousFrame[prevIdx + 1]);
      const diffB = Math.abs(currentFrame[currentIdx + 2] - previousFrame[prevIdx + 2]);

      if (diffR > threshold || diffG > threshold || diffB > threshold) {
        changedPixels++;
      }
    }

    const percentage = (changedPixels / totalPixels) * 100;
    const detected = percentage > 0.5;

    return { detected, changedPixels };
  }
}

export const motionDetectionService = MotionDetectionService.getInstance();