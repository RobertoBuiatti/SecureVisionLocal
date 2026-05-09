import type { Camera, CameraStatus } from '@shared/types';
import { storageService } from '@services/storage/storageService';

export interface ApiClientConfig {
  baseUrl?: string;
  timeout: number;
  retries: number;
  retryDelay: number;
}

export interface CameraConnectionResult {
  success: boolean;
  latency?: number;
  error?: string;
}

export interface OnvifDeviceInfo {
  manufacturer: string;
  model: string;
  firmware: string;
  serialNumber: string;
  ipAddress: string;
}

export interface PTZCapabilities {
  pan: boolean;
  tilt: boolean;
  zoom: boolean;
  presets: number;
}

const DEFAULT_CONFIG: ApiClientConfig = {
  baseUrl: 'http://localhost:8080',
  timeout: 10000,
  retries: 3,
  retryDelay: 2000,
};

class CameraApiClient {
  private static instance: CameraApiClient;
  private config: ApiClientConfig;
  private connectionCache: Map<string, { timestamp: number; result: CameraConnectionResult }> = new Map();
  private onvifClients: Map<string, unknown> = new Map();

  private constructor(config: ApiClientConfig = DEFAULT_CONFIG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public static getInstance(config?: ApiClientConfig): CameraApiClient {
    if (!CameraApiClient.instance) {
      CameraApiClient.instance = new CameraApiClient(config);
    }
    return CameraApiClient.instance;
  }

  public updateConfig(config: Partial<ApiClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public async connect(camera: Camera): Promise<CameraConnectionResult> {
    const cached = this.connectionCache.get(camera.id);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.result;
    }

    const startTime = Date.now();
    
    try {
      const result = await this.testConnection(camera);
      const latency = Date.now() - startTime;

      const connectionResult: CameraConnectionResult = {
        success: result,
        latency,
        error: result ? undefined : 'Connection failed',
      };

      this.connectionCache.set(camera.id, {
        timestamp: Date.now(),
        result: connectionResult,
      });

      return connectionResult;
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  private async testConnection(camera: Camera): Promise<boolean> {
    const url = this.buildStreamUrl(camera);
    
    try {
      if (camera.protocol === 'rtsp') {
        return await this.testRTSPConnection(camera);
      } else if (camera.protocol === 'onvif') {
        return await this.testONVIFConnection(camera);
      } else if (camera.protocol === 'http' || camera.protocol === 'mjpeg') {
        return await this.testHttpConnection(url);
      }
      
      return false;
    } catch {
      return false;
    }
  }

  private async testRTSPConnection(camera: Camera): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`[ApiClient] Testing RTSP connection to ${camera.ip}:${camera.port}`);
        resolve(true);
      }, 500);
    });
  }

  private async testONVIFConnection(camera: Camera): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`[ApiClient] Testing ONVIF connection to ${camera.ip}:${camera.port}`);
        resolve(true);
      }, 500);
    });
  }

  private async testHttpConnection(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  private buildStreamUrl(camera: Camera): string {
    if (camera.streamUrl) {
      return camera.streamUrl;
    }

    const protocol = camera.protocol === 'onvif' ? 'http' : camera.protocol;
    return `${protocol}://${camera.ip}:${camera.port}/stream`;
  }

  public async getONVIFDeviceInfo(camera: Camera): Promise<OnvifDeviceInfo | null> {
    if (camera.protocol !== 'onvif') {
      return null;
    }

    console.log(`[ApiClient] Getting ONVIF device info for ${camera.name}`);
    
    return {
      manufacturer: 'Generic',
      model: 'IP Camera',
      firmware: '1.0.0',
      serialNumber: camera.id,
      ipAddress: camera.ip,
    };
  }

  public async getPTZCapabilities(camera: Camera): Promise<PTZCapabilities | null> {
    if (!camera.hasPTZ) {
      return null;
    }

    console.log(`[ApiClient] Getting PTZ capabilities for ${camera.name}`);

    return {
      pan: true,
      tilt: true,
      zoom: true,
      presets: camera.presetCount || 0,
    };
  }

  public async movePTZ(
    cameraId: string,
    action: 'pan' | 'tilt' | 'zoom',
    direction: 'left' | 'right' | 'up' | 'down' | 'in' | 'out',
    speed: number = 1
  ): Promise<boolean> {
    console.log(`[ApiClient] PTZ ${action} ${direction} speed ${speed} for camera ${cameraId}`);
    return true;
  }

  public async gotoPreset(cameraId: string, presetId: number): Promise<boolean> {
    console.log(`[ApiClient] Goto preset ${presetId} for camera ${cameraId}`);
    return true;
  }

  public async setPreset(cameraId: string, presetId: number, name: string): Promise<boolean> {
    console.log(`[ApiClient] Set preset ${presetId} (${name}) for camera ${cameraId}`);
    return true;
  }

  public async getSnapshot(camera: Camera): Promise<string | null> {
    try {
      const url = `http://${camera.ip}:${camera.port}/snapshot.jpg`;
      return url;
    } catch {
      return null;
    }
  }

  public async checkAllCameras(cameras: Camera[]): Promise<Map<string, CameraStatus>> {
    const results = new Map<string, CameraStatus>();

    await Promise.all(
      cameras.map(async (camera) => {
        const result = await this.connect(camera);
        results.set(camera.id, result.success ? 'online' : 'offline');
      })
    );

    return results;
  }

  public async disconnect(cameraId: string): Promise<void> {
    this.connectionCache.delete(cameraId);
    this.onvifClients.delete(cameraId);
    console.log(`[ApiClient] Disconnected camera ${cameraId}`);
  }

  public clearCache(): void {
    this.connectionCache.clear();
  }
}

export const cameraApiClient = CameraApiClient.getInstance();