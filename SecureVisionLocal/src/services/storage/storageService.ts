import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Camera } from '@shared/types';

export const STORAGE_KEYS = {
  CAMERAS: '@securevision/cameras',
  SETTINGS: '@securevision/settings',
  RECORDINGS: '@securevision/recordings',
  PTZ_PRESETS: '@securevision/ptz_presets',
  PTZ_TOURS: '@securevision/ptz_tours',
  AUTOMATIONS: '@securevision/automations',
};

export interface StorageInfo {
  used: number;
  total: number;
  recordings: number;
}

export const storageService = {
  async saveCameras(cameras: Camera[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CAMERAS, JSON.stringify(cameras));
    } catch (error) {
      console.error('[Storage] Error saving cameras:', error);
      throw error;
    }
  },

  async getCameras(): Promise<Camera[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.CAMERAS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[Storage] Error getting cameras:', error);
      return [];
    }
  },

  async saveSettings(settings: Record<string, unknown>): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('[Storage] Error saving settings:', error);
      throw error;
    }
  },

  async getSettings(): Promise<Record<string, unknown>> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('[Storage] Error getting settings:', error);
      return {};
    }
  },

  async savePTZPresets(cameraId: string, presets: unknown[]): Promise<void> {
    try {
      const allPresets = await this.getAllPTZPresets();
      allPresets[cameraId] = presets;
      await AsyncStorage.setItem(STORAGE_KEYS.PTZ_PRESETS, JSON.stringify(allPresets));
    } catch (error) {
      console.error('[Storage] Error saving PTZ presets:', error);
      throw error;
    }
  },

  async getAllPTZPresets(): Promise<Record<string, unknown[]>> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PTZ_PRESETS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('[Storage] Error getting PTZ presets:', error);
      return {};
    }
  },

  async savePTZTours(cameraId: string, tours: unknown[]): Promise<void> {
    try {
      const allTours = await this.getAllPTZTours();
      allTours[cameraId] = tours;
      await AsyncStorage.setItem(STORAGE_KEYS.PTZ_TOURS, JSON.stringify(allTours));
    } catch (error) {
      console.error('[Storage] Error saving PTZ tours:', error);
      throw error;
    }
  },

  async getAllPTZTours(): Promise<Record<string, unknown[]>> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PTZ_TOURS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('[Storage] Error getting PTZ tours:', error);
      return {};
    }
  },

  async saveAutomations(automations: unknown[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTOMATIONS, JSON.stringify(automations));
    } catch (error) {
      console.error('[Storage] Error saving automations:', error);
      throw error;
    }
  },

  async getAutomations(): Promise<unknown[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.AUTOMATIONS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[Storage] Error getting automations:', error);
      return [];
    }
  },

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    } catch (error) {
      console.error('[Storage] Error clearing all:', error);
      throw error;
    }
  },

  async getStorageInfo(): Promise<StorageInfo> {
    const cameras = await this.getCameras();
    const settings = await this.getSettings();
    const recordings: unknown[] = [];
    
    let usedBytes = 0;
    cameras.forEach(() => {
      usedBytes += 1024 * 1024 * 10; 
    });
    recordings.forEach(() => {
      usedBytes += 1024 * 1024 * 50;
    });

    const totalBytes = 1024 * 1024 * 1024 * 64;

    return {
      used: usedBytes,
      total: totalBytes,
      recordings: recordings.length,
    };
  },
};