import type { Camera, CameraProtocol } from '@shared/types';

export interface ConnectionResult {
  success: boolean;
  latency: number | null;
  error: string | null;
  timestamp: number;
}

export interface ConnectionConfig {
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

const DEFAULT_CONFIG: ConnectionConfig = {
  timeout: 5000,
  maxRetries: 3,
  retryDelay: 2000,
};

class ConnectionService {
  private static instance: ConnectionService;
  private config: ConnectionConfig = DEFAULT_CONFIG;
  private testResults: Map<string, ConnectionResult> = new Map();
  private activeTests: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): ConnectionService {
    if (!ConnectionService.instance) {
      ConnectionService.instance = new ConnectionService();
    }
    return ConnectionService.instance;
  }

  public setConfig(config: Partial<ConnectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): ConnectionConfig {
    return { ...this.config };
  }

  public async ping(camera: Camera): Promise<ConnectionResult> {
    if (this.activeTests.has(camera.id)) {
      const existingResult = this.testResults.get(camera.id);
      if (existingResult) {
        return existingResult;
      }
    }

    this.activeTests.add(camera.id);

    const result = await this.executePing(camera);

    this.testResults.set(camera.id, result);
    this.activeTests.delete(camera.id);

    return result;
  }

  private async executePing(camera: Camera): Promise<ConnectionResult> {
    const startTime = Date.now();

    try {
      const isReachable = await this.checkReachability(camera);
      const latency = Date.now() - startTime;

      if (isReachable) {
        return {
          success: true,
          latency,
          error: null,
          timestamp: Date.now(),
        };
      } else {
        return {
          success: false,
          latency: null,
          error: 'Câmera não respondendo',
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        latency: null,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        timestamp: Date.now(),
      };
    }
  }

  private async checkReachability(camera: Camera): Promise<boolean> {
    const testUrl = this.buildTestUrl(camera);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(testUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok || response.status === 401 || response.status === 404;
    } catch {
      if (camera.protocol === 'rtsp' || camera.protocol === 'onvif') {
        return this.simulateRtspCheck(camera);
      }
      return false;
    }
  }

  private buildTestUrl(camera: Camera): string {
    switch (camera.protocol) {
      case 'rtsp':
        return `rtsp://${camera.ip}:${camera.port}`;
      case 'onvif':
        return `http://${camera.ip}:${camera.port}/onvif/device_service`;
      case 'http':
        return camera.streamUrl;
      case 'mjpeg':
        return camera.streamUrl;
      default:
        return `http://${camera.ip}:${camera.port}`;
    }
  }

  private async simulateRtspCheck(camera: Camera): Promise<boolean> {
    const portCheck = await this.checkPort(camera.ip, camera.port);
    return portCheck;
  }

  private async checkPort(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(false), this.config.timeout);

      try {
        const testUrl = `http://${host}:${port}`;
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 3000);

        fetch(testUrl, { method: 'HEAD', signal: controller.signal })
          .then(() => {
            clearTimeout(timeoutId);
            clearTimeout(fetchTimeout);
            resolve(true);
          })
          .catch(() => {
            clearTimeout(timeoutId);
            clearTimeout(fetchTimeout);
            resolve(false);
          });
      } catch {
        clearTimeout(timeoutId);
        resolve(false);
      }
    });
  }

  private async checkPortWS(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(false), this.config.timeout);

      const WebSocketClass = typeof globalThis !== 'undefined' ? (globalThis as any).WebSocket : null;
      if (!WebSocketClass) {
        clearTimeout(timeoutId);
        resolve(false);
        return;
      }

      try {
        const socket = new WebSocketClass(`ws://${host}:${port}`);
        socket.onopen = () => {
          clearTimeout(timeoutId);
          socket.close();
          resolve(true);
        };
        socket.onerror = () => {
          clearTimeout(timeoutId);
          resolve(false);
        };
      } catch {
        clearTimeout(timeoutId);
        resolve(false);
      }
    });
  }

  public async testStream(camera: Camera): Promise<ConnectionResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(camera.streamUrl, {
        method: 'GET',
        mode: 'no-cors',
      });

      const latency = Date.now() - startTime;

      return {
        success: true,
        latency,
        error: null,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        latency: null,
        error: error instanceof Error ? error.message : 'Stream não disponível',
        timestamp: Date.now(),
      };
    }
  }

  public async testAllCameras(cameras: Camera[]): Promise<Map<string, ConnectionResult>> {
    const results = new Map<string, ConnectionResult>();

    const testPromises = cameras.map(async (camera) => {
      const result = await this.ping(camera);
      results.set(camera.id, result);
    });

    await Promise.all(testPromises);

    return results;
  }

  public getLastResult(cameraId: string): ConnectionResult | null {
    return this.testResults.get(cameraId) || null;
  }

  public getAllResults(): Map<string, ConnectionResult> {
    return new Map(this.testResults);
  }

  public clearResults(): void {
    this.testResults.clear();
  }

  public clearCameraResult(cameraId: string): void {
    this.testResults.delete(cameraId);
  }

  public isTesting(cameraId: string): boolean {
    return this.activeTests.has(cameraId);
  }
}

export const connectionService = ConnectionService.getInstance();