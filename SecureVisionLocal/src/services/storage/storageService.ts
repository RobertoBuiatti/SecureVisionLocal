import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  CAMERAS: '@securevision/cameras',
  SETTINGS: '@securevision/settings',
  USER: '@securevision/user',
  AUTH_TOKEN: '@securevision/auth_token',
  RECORDING_SETTINGS: '@securevision/recording_settings',
  AUTOMATIONS: '@securevision/automations',
  PTZ_PRESETS: '@securevision/ptz_presets',
  PTZ_TOURS: '@securevision/ptz_tours',
  ALERTS: '@securevision/alerts',
  LAST_SYNC: '@securevision/last_sync',
  RECORDINGS: '@securevision/recordings',
} as const;

class StorageService {
  private static instance: StorageService;

  private constructor() {}

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  public async getItem<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error getting item ${key}:`, error);
      return null;
    }
  }

  public async setItem<T>(key: string, value: T): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error setting item ${key}:`, error);
      return false;
    }
  }

  public async removeItem(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing item ${key}:`, error);
      return false;
    }
  }

  public async clear(): Promise<boolean> {
    try {
      await AsyncStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing storage:', error);
      return false;
    }
  }

  public async getAllKeys(): Promise<string[]> {
    try {
      return await AsyncStorage.getAllKeys();
    } catch (error) {
      console.error('Error getting all keys:', error);
      return [];
    }
  }

  public getKey<K extends keyof typeof STORAGE_KEYS>(
    key: K
  ): (typeof STORAGE_KEYS)[K] {
    return STORAGE_KEYS[key];
  }
}

export const storage = StorageService.getInstance();
export { STORAGE_KEYS };