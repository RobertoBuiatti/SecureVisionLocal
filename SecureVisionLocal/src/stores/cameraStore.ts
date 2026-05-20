import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Camera, CameraStatus } from '@shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectionService, type ConnectionResult } from '@services/connection';

type CameraInput = Omit<Camera, 'id' | 'status' | 'isRecording' | 'createdAt' | 'updatedAt' | 'presetCount' | 'type'>;

export interface CameraConnectionState {
  cameraId: string;
  status: 'online' | 'offline' | 'connecting' | 'testing';
  lastChecked: number;
  latency: number | null;
  error: string | null;
  retryCount: number;
  lastRetryAt: number | null;
  maxRetries: number;
}

const CONNECTION_CONFIG = {
  maxRetries: 5,
  baseRetryDelay: 5000,
  maxRetryDelay: 60000,
  backoffMultiplier: 2,
};

interface CameraState {
  cameras: Camera[];
  selectedCameraId: string | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  connectionStates: Map<string, CameraConnectionState>;
  isMonitoring: boolean;
  monitorInterval: number;
  connectionCheckInterval: number;
  monitorIntervalId: ReturnType<typeof setInterval> | undefined;

  setCameras: (cameras: Camera[]) => void;
  addCamera: (camera: CameraInput) => void;
  updateCamera: (id: string, updates: Partial<Camera>) => void;
  removeCamera: (id: string) => void;
  selectCamera: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  initialize: () => Promise<void>;
  testCameraConnection: (cameraId: string) => Promise<ConnectionResult>;
  startConnectionMonitor: () => void;
  stopConnectionMonitor: () => void;
  getConnectionState: (cameraId: string) => CameraConnectionState | undefined;
  checkAllCameras: () => Promise<void>;
  updateConnectionStatus: (cameraId: string, status: CameraConnectionState) => void;
  attemptReconnection: (cameraId: string) => Promise<void>;
  resetConnectionRetry: (cameraId: string) => void;
}

const generateCameraId = (): string => {
  return `cam_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const useCameraStore = create<CameraState>()(
  persist(
    (set, get) => ({
      cameras: [],
      selectedCameraId: null,
      isLoading: false,
      error: null,
      isInitialized: false,
      connectionStates: new Map(),
      isMonitoring: false,
      monitorInterval: 30000,
      connectionCheckInterval: 30000,
      monitorIntervalId: undefined,

      setCameras: (cameras) => set({ cameras }),

      addCamera: (cameraInput) =>
        set((state) => {
          const now = Date.now();
          const newCamera: Camera = {
            ...cameraInput,
            id: generateCameraId(),
            type: cameraInput.hasPTZ ? 'ptz' : 'bullet',
            status: 'offline' as CameraStatus,
            isRecording: false,
            presetCount: 0,
            createdAt: now,
            updatedAt: now,
          };
          return { cameras: [...state.cameras, newCamera] };
        }),

      updateCamera: (id, updates) =>
        set((state) => ({
          cameras: state.cameras.map((cam) =>
            cam.id === id ? { ...cam, ...updates, updatedAt: Date.now() } : cam
          ),
        })),

      removeCamera: (id) =>
        set((state) => ({
          cameras: state.cameras.filter((cam) => cam.id !== id),
          selectedCameraId: state.selectedCameraId === id ? null : state.selectedCameraId,
        })),

      selectCamera: (id) => set({ selectedCameraId: id }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      initialize: async () => {
        const state = get();
        if (state.isInitialized) return;
        if (state.isLoading) return;

        set({ isLoading: true, error: null });

        const existingCameras = state.cameras;

        if (existingCameras.length === 0) {
          const defaultCameras = getDefaultCameras();
          const initialConnectionStates = new Map<string, CameraConnectionState>();
          defaultCameras.forEach((camera) => {
            initialConnectionStates.set(camera.id, {
              cameraId: camera.id,
              status: 'offline',
              lastChecked: 0,
              latency: null,
              error: null,
              retryCount: 0,
              lastRetryAt: null,
              maxRetries: CONNECTION_CONFIG.maxRetries,
            });
          });
          set({
            cameras: defaultCameras,
            connectionStates: initialConnectionStates,
            isLoading: false,
            isInitialized: true
          });
          get().startConnectionMonitor();
        } else {
          const initialConnectionStates = new Map<string, CameraConnectionState>();
          existingCameras.forEach((camera) => {
            initialConnectionStates.set(camera.id, {
              cameraId: camera.id,
              status: 'offline',
              lastChecked: 0,
              latency: null,
              error: null,
              retryCount: 0,
              lastRetryAt: null,
              maxRetries: CONNECTION_CONFIG.maxRetries,
            });
          });
          set({ connectionStates: initialConnectionStates, isLoading: false, isInitialized: true });
          get().startConnectionMonitor();
        }
      },

      testCameraConnection: async (cameraId: string) => {
        const { cameras, connectionStates } = get();
        const camera = cameras.find((c) => c.id === cameraId);

        if (!camera) {
          return { success: false, latency: null, error: 'Câmera não encontrada', timestamp: Date.now() };
        }

        const defaultState: CameraConnectionState = {
          cameraId,
          status: 'testing',
          lastChecked: Date.now(),
          latency: null,
          error: null,
          retryCount: 0,
          lastRetryAt: null,
          maxRetries: CONNECTION_CONFIG.maxRetries,
        };
        const currentState = connectionStates.get(cameraId) || defaultState;

        set((state) => {
          const newStates = new Map(state.connectionStates);
          newStates.set(cameraId, { ...currentState, status: 'testing' });
          return { connectionStates: newStates };
        });

        const result = await connectionService.ping(camera);

        const newState: CameraConnectionState = {
          cameraId,
          status: result.success ? 'online' : 'offline',
          lastChecked: Date.now(),
          latency: result.latency,
          error: result.error,
          retryCount: result.success ? 0 : currentState.retryCount + 1,
          lastRetryAt: result.success ? null : currentState.lastRetryAt,
          maxRetries: currentState.maxRetries,
        };

        set((state) => {
          const newStates = new Map(state.connectionStates);
          newStates.set(cameraId, newState);
          return { connectionStates: newStates };
        });

        if (result.success) {
          get().updateCamera(cameraId, { status: 'online' });
        } else {
          get().updateCamera(cameraId, { status: 'offline' });
        }

        return result;
      },

      startConnectionMonitor: () => {
        const { isMonitoring, checkAllCameras } = get();
        if (isMonitoring) return;

        set({ isMonitoring: true });
        checkAllCameras();

        const intervalId = setInterval(() => {
          get().checkAllCameras();
        }, get().connectionCheckInterval);

        set({ monitorIntervalId: intervalId });
      },

      stopConnectionMonitor: () => {
        const { monitorIntervalId } = get();
        if (monitorIntervalId) {
          clearInterval(monitorIntervalId);
        }
        set({ monitorIntervalId: undefined, isMonitoring: false });
      },

      getConnectionState: (cameraId: string) => {
        return get().connectionStates.get(cameraId);
      },

      checkAllCameras: async () => {
        const { cameras, connectionStates, testCameraConnection } = get();

        const checkPromises = cameras.map(async (camera) => {
          const currentState = connectionStates.get(camera.id);
          if (currentState && currentState.status === 'testing') {
            return;
          }
          await testCameraConnection(camera.id);
        });

        await Promise.all(checkPromises);
      },

      updateConnectionStatus: (cameraId: string, status: CameraConnectionState) => {
        set((state) => {
          const newStates = new Map(state.connectionStates);
          newStates.set(cameraId, status);
          return { connectionStates: newStates };
        });
      },

      attemptReconnection: async (cameraId: string) => {
        const { cameras, connectionStates, testCameraConnection } = get();
        const camera = cameras.find((c) => c.id === cameraId);
        const currentState = connectionStates.get(cameraId);

        if (!camera || !currentState) return;
        if (currentState.status === 'online') return;

        if (currentState.retryCount >= CONNECTION_CONFIG.maxRetries) {
          return;
        }

        const now = Date.now();
        if (currentState.lastRetryAt) {
          const timeSinceLastRetry = now - currentState.lastRetryAt;
          const delay = Math.min(
            CONNECTION_CONFIG.baseRetryDelay * Math.pow(CONNECTION_CONFIG.backoffMultiplier, currentState.retryCount),
            CONNECTION_CONFIG.maxRetryDelay
          );
          if (timeSinceLastRetry < delay) {
            return;
          }
        }

        set((state) => {
          const newStates = new Map(state.connectionStates);
          newStates.set(cameraId, {
            ...currentState,
            status: 'connecting',
            lastRetryAt: now,
          });
          return { connectionStates: newStates };
        });

        await testCameraConnection(cameraId);

        const newState = get().connectionStates.get(cameraId);
        if (newState && newState.status === 'offline') {
          const updatedState = {
            ...newState,
            retryCount: newState.retryCount + 1,
          };
          set((state) => {
            const newStates = new Map(state.connectionStates);
            newStates.set(cameraId, updatedState);
            return { connectionStates: newStates };
          });
        }
      },

      resetConnectionRetry: (cameraId: string) => {
        set((state) => {
          const currentState = state.connectionStates.get(cameraId);
          if (!currentState) return state;
          const newStates = new Map(state.connectionStates);
          newStates.set(cameraId, {
            ...currentState,
            retryCount: 0,
            lastRetryAt: null,
          });
          return { connectionStates: newStates };
        });
      },
    }),
    {
      name: 'securevision-cameras',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ cameras: state.cameras }),
    }
  )
);

function getDefaultCameras(): Camera[] {
  return [
    {
      id: '1',
      name: 'Entrada Principal',
      ip: '192.168.1.100',
      port: 554,
      protocol: 'rtsp',
      type: 'bullet',
      streamUrl: 'rtsp://192.168.1.100:554/stream',
      status: 'offline',
      isRecording: true,
      hasPTZ: true,
      presetCount: 8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '2',
      name: 'Garagem',
      ip: '192.168.1.101',
      port: 554,
      protocol: 'rtsp',
      type: 'dome',
      streamUrl: 'rtsp://192.168.1.101:554/stream',
      status: 'offline',
      isRecording: false,
      hasPTZ: true,
      presetCount: 4,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '3',
      name: 'Fundos',
      ip: '192.168.1.102',
      port: 554,
      protocol: 'rtsp',
      type: 'bullet',
      streamUrl: 'rtsp://192.168.1.102:554/stream',
      status: 'offline',
      isRecording: false,
      hasPTZ: false,
      presetCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '4',
      name: 'Portão',
      ip: '192.168.1.103',
      port: 554,
      protocol: 'rtsp',
      type: 'ptz',
      streamUrl: 'rtsp://192.168.1.103:554/stream',
      status: 'offline',
      isRecording: true,
      hasPTZ: true,
      presetCount: 16,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
}