import { useState, useEffect, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface UseNetworkResult {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: string | null;
  refresh: () => Promise<void>;
}

export function useNetwork(): UseNetworkResult {
  const [state, setState] = useState<NetInfoState>({
    isConnected: null,
    isInternetReachable: null,
    type: 'unknown',
    isConnectionExpensive: false,
    details: null,
  });

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
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
    type: state.type,
    refresh,
  };
}

export function useOnline() {
  const { isConnected } = useNetwork();
  return isConnected ?? false;
}