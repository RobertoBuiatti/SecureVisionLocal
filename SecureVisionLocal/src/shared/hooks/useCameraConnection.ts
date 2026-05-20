import { useCallback, useMemo } from 'react';
import { useCameraStore, type CameraConnectionState } from '../../stores';
import type { ConnectionResult } from '../../services/connection';

export interface UseCameraConnectionResult {
  connectionState: CameraConnectionState | undefined;
  isOnline: boolean;
  isOffline: boolean;
  isTesting: boolean;
  isConnecting: boolean;
  latency: number | null;
  lastChecked: number | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  canRetry: boolean;
  testConnection: () => Promise<ConnectionResult>;
  refreshStatus: () => Promise<void>;
  attemptReconnection: () => Promise<void>;
  resetRetry: () => void;
}

export function useCameraConnection(cameraId: string): UseCameraConnectionResult {
  const connectionState = useCameraStore((state) => state.getConnectionState(cameraId));
  const testCameraConnection = useCameraStore((state) => state.testCameraConnection);
  const attemptReconnection = useCameraStore((state) => state.attemptReconnection);
  const resetConnectionRetry = useCameraStore((state) => state.resetConnectionRetry);

  const testConnection = useCallback(async () => {
    return await testCameraConnection(cameraId);
  }, [cameraId, testCameraConnection]);

  const refreshStatus = useCallback(async () => {
    await testCameraConnection(cameraId);
  }, [cameraId, testCameraConnection]);

  const handleAttemptReconnection = useCallback(async () => {
    await attemptReconnection(cameraId);
  }, [cameraId, attemptReconnection]);

  const handleResetRetry = useCallback(() => {
    resetConnectionRetry(cameraId);
  }, [cameraId, resetConnectionRetry]);

  const isOnline = useMemo(() => {
    return connectionState?.status === 'online';
  }, [connectionState?.status]);

  const isOffline = useMemo(() => {
    return connectionState?.status === 'offline';
  }, [connectionState?.status]);

  const isTesting = useMemo(() => {
    return connectionState?.status === 'testing';
  }, [connectionState?.status]);

  const isConnecting = useMemo(() => {
    return connectionState?.status === 'connecting';
  }, [connectionState?.status]);

  const latency = useMemo(() => {
    return connectionState?.latency ?? null;
  }, [connectionState?.latency]);

  const lastChecked = useMemo(() => {
    return connectionState?.lastChecked ?? null;
  }, [connectionState?.lastChecked]);

  const error = useMemo(() => {
    return connectionState?.error ?? null;
  }, [connectionState?.error]);

  const retryCount = useMemo(() => {
    return connectionState?.retryCount ?? 0;
  }, [connectionState?.retryCount]);

  const maxRetries = useMemo(() => {
    return connectionState?.maxRetries ?? 5;
  }, [connectionState?.maxRetries]);

  const canRetry = useMemo(() => {
    return retryCount < maxRetries;
  }, [retryCount, maxRetries]);

  return {
    connectionState,
    isOnline,
    isOffline,
    isTesting,
    isConnecting,
    latency,
    lastChecked,
    error,
    retryCount,
    maxRetries,
    canRetry,
    testConnection,
    refreshStatus,
    attemptReconnection: handleAttemptReconnection,
    resetRetry: handleResetRetry,
  };
}

export interface UseAllCamerasConnectionResult {
  getConnectionState: (cameraId: string) => CameraConnectionState | undefined;
  onlineCount: number;
  offlineCount: number;
  testingCount: number;
  checkAllCameras: () => Promise<void>;
}

export function useAllCamerasConnection(): UseAllCamerasConnectionResult {
  const connectionStates = useCameraStore((state) => state.connectionStates);
  const getConnectionState = useCameraStore((state) => state.getConnectionState);
  const checkAllCameras = useCameraStore((state) => state.checkAllCameras);

  const onlineCount = useMemo(() => {
    let count = 0;
    connectionStates.forEach((state) => {
      if (state.status === 'online') count++;
    });
    return count;
  }, [connectionStates]);

  const offlineCount = useMemo(() => {
    let count = 0;
    connectionStates.forEach((state) => {
      if (state.status === 'offline') count++;
    });
    return count;
  }, [connectionStates]);

  const testingCount = useMemo(() => {
    let count = 0;
    connectionStates.forEach((state) => {
      if (state.status === 'testing' || state.status === 'connecting') count++;
    });
    return count;
  }, [connectionStates]);

  return {
    getConnectionState,
    onlineCount,
    offlineCount,
    testingCount,
    checkAllCameras,
  };
}