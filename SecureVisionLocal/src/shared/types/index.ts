export * from './camera';
export * from './recording';
export * from './automation';
export * from './settings';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  avatar?: string;
  lastLogin?: number;
  createdAt: number;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  language: string;
  notifications: boolean;
  autoStartRecording: boolean;
  gridLayout: 1 | 4 | 9 | 16;
  defaultQuality: 'low' | 'medium' | 'high';
}

export interface SystemStatus {
  storageUsedGB: number;
  storageTotalGB: number;
  recordingCount: number;
  cameraOnline: number;
  cameraOffline: number;
  cpuUsage: number;
  memoryUsage: number;
  networkStatus: 'connected' | 'disconnected';
}

export interface Alert {
  id: string;
  type: 'motion' | 'person' | 'vehicle' | 'animal' | 'sound' | 'error' | 'system';
  cameraId?: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
}