import { useState, useEffect, useCallback } from 'react';
import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';

interface UseNetworkResult {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: string | null;
  refresh: () => Promise<void>;
}

export function useNetwork(): UseNetworkResult {
  const [state, setState] = useState<NetInfoState | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(setState);

    NetInfo.fetch().then(setState);

    return () => {
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    const newState = await NetInfo.fetch();
    setState(newState);
  }, []);

  return {
    isConnected: state?.isConnected ?? null,
    isInternetReachable: state?.isInternetReachable ?? null,
    type: state?.type ?? null,
    refresh,
  };
}

export function useOnline() {
  const { isConnected } = useNetwork();
  return isConnected ?? false;
}