import { apiClient, endpoints } from '@services/api';
import type { Camera } from '@shared/types';

interface CreateCameraDTO {
  name: string;
  ip: string;
  port: number;
  protocol: Camera['protocol'];
  type: Camera['type'];
  username?: string;
  password?: string;
  streamUrl: string;
}

interface UpdateCameraDTO {
  name?: string;
  ip?: string;
  port?: number;
  protocol?: Camera['protocol'];
  type?: Camera['type'];
  username?: string;
  password?: string;
  streamUrl?: string;
}

interface CameraStatusResponse {
  status: Camera['status'];
  latency: number;
  fps: number;
  bitrate: number;
  resolution: string;
}

class CameraService {
  async getAll(): Promise<Camera[]> {
    const response = await apiClient.get<{ cameras: Camera[] }>(endpoints.cameras.list);
    return response.data.cameras;
  }

  async getById(id: string): Promise<Camera> {
    const response = await apiClient.get<Camera>(endpoints.cameras.get(id));
    return response.data;
  }

  async create(camera: CreateCameraDTO): Promise<Camera> {
    const response = await apiClient.post<Camera>(endpoints.cameras.create, camera);
    return response.data;
  }

  async update(id: string, updates: UpdateCameraDTO): Promise<Camera> {
    const response = await apiClient.put<Camera>(endpoints.cameras.update(id), updates);
    return response.data;
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(endpoints.cameras.delete(id));
  }

  async getStatus(id: string): Promise<CameraStatusResponse> {
    const response = await apiClient.get<CameraStatusResponse>(endpoints.cameras.status(id));
    return response.data;
  }

  async testConnection(camera: CreateCameraDTO): Promise<{ success: boolean; latency?: number; error?: string }> {
    try {
      const startTime = Date.now();
      await this.getById('test');
      const latency = Date.now() - startTime;
      return { success: true, latency };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }
}

export const cameraService = new CameraService();