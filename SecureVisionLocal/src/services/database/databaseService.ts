import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Camera, Recording, Automation, Settings } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';

interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

class DatabaseService {
  private async getItem<T>(key: string): Promise<DatabaseResult<T>> {
    try {
      const data = await AsyncStorage.getItem(key);
      return {
        success: true,
        data: data ? JSON.parse(data) : null,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private async setItem<T>(key: string, data: T): Promise<DatabaseResult<void>> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private async removeItem(key: string): Promise<DatabaseResult<void>> {
    try {
      await AsyncStorage.removeItem(key);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async getAllCameras(): Promise<DatabaseResult<Camera[]>> {
    return this.getItem<Camera[]>(STORAGE_KEYS.CAMERAS);
  }

  async saveCameras(cameras: Camera[]): Promise<DatabaseResult<void>> {
    return this.setItem(STORAGE_KEYS.CAMERAS, cameras);
  }

  async addCamera(camera: Camera): Promise<DatabaseResult<void>> {
    const result = await this.getAllCameras();
    const cameras = result.data || [];
    cameras.push(camera);
    return this.saveCameras(cameras);
  }

  async updateCamera(id: string, updates: Partial<Camera>): Promise<DatabaseResult<void>> {
    const result = await this.getAllCameras();
    const cameras = result.data || [];
    const index = cameras.findIndex(c => c.id === id);
    if (index !== -1) {
      cameras[index] = { ...cameras[index], ...updates };
    }
    return this.saveCameras(cameras);
  }

  async deleteCamera(id: string): Promise<DatabaseResult<void>> {
    const result = await this.getAllCameras();
    const cameras = (result.data || []).filter(c => c.id !== id);
    return this.saveCameras(cameras);
  }

  async getAllRecordings(): Promise<DatabaseResult<Recording[]>> {
    return this.getItem<Recording[]>(STORAGE_KEYS.RECORDINGS);
  }

  async saveRecordings(recordings: Recording[]): Promise<DatabaseResult<void>> {
    return this.setItem(STORAGE_KEYS.RECORDINGS, recordings);
  }

  async addRecording(recording: Recording): Promise<DatabaseResult<void>> {
    const result = await this.getAllRecordings();
    const recordings = result.data || [];
    recordings.push(recording);
    return this.saveRecordings(recordings);
  }

  async deleteRecording(id: string): Promise<DatabaseResult<void>> {
    const result = await this.getAllRecordings();
    const recordings = (result.data || []).filter(r => r.id !== id);
    return this.saveRecordings(recordings);
  }

  async getAllAutomations(): Promise<DatabaseResult<Automation[]>> {
    return this.getItem<Automation[]>(STORAGE_KEYS.AUTOMATIONS);
  }

  async saveAutomations(automations: Automation[]): Promise<DatabaseResult<void>> {
    return this.setItem(STORAGE_KEYS.AUTOMATIONS, automations);
  }

  async addAutomation(automation: Automation): Promise<DatabaseResult<void>> {
    const result = await this.getAllAutomations();
    const automations = result.data || [];
    automations.push(automation);
    return this.saveAutomations(automations);
  }

  async updateAutomation(id: string, updates: Partial<Automation>): Promise<DatabaseResult<void>> {
    const result = await this.getAllAutomations();
    const automations = result.data || [];
    const index = automations.findIndex(a => a.id === id);
    if (index !== -1) {
      automations[index] = { ...automations[index], ...updates };
    }
    return this.saveAutomations(automations);
  }

  async deleteAutomation(id: string): Promise<DatabaseResult<void>> {
    const result = await this.getAllAutomations();
    const automations = (result.data || []).filter(a => a.id !== id);
    return this.saveAutomations(automations);
  }

  async getSettings(): Promise<DatabaseResult<Settings>> {
    return this.getItem<Settings>(STORAGE_KEYS.SETTINGS);
  }

  async saveSettings(settings: Settings): Promise<DatabaseResult<void>> {
    return this.setItem(STORAGE_KEYS.SETTINGS, settings);
  }

  async clearAll(): Promise<DatabaseResult<void>> {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.CAMERAS,
        STORAGE_KEYS.RECORDINGS,
        STORAGE_KEYS.SETTINGS,
        STORAGE_KEYS.AUTOMATIONS,
      ]);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async exportData(): Promise<DatabaseResult<Record<string, unknown>>> {
    try {
      const [cameras, recordings, automations, settings] = await Promise.all([
        this.getAllCameras(),
        this.getAllRecordings(),
        this.getAllAutomations(),
        this.getSettings(),
      ]);

      return {
        success: true,
        data: {
          cameras: cameras.data || [],
          recordings: recordings.data || [],
          automations: automations.data || [],
          settings: settings.data || {},
          exportedAt: Date.now(),
          version: '1.0.0',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async importData(data: {
    cameras?: Camera[];
    recordings?: Recording[];
    automations?: Automation[];
    settings?: Settings;
  }): Promise<DatabaseResult<void>> {
    try {
      if (data.cameras) await this.saveCameras(data.cameras);
      if (data.recordings) await this.saveRecordings(data.recordings);
      if (data.automations) await this.saveAutomations(data.automations);
      if (data.settings) await this.saveSettings(data.settings);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

export const databaseService = new DatabaseService();