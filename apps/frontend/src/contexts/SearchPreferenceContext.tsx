'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { SearchMode, SearchPreference } from '@event-sharing/contracts';
import { searchClient } from '@/lib/api/SearchClient';
import { useAuth } from './AuthContext';

export type DevicePosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type GeoPermission = PermissionState | 'unknown' | 'unsupported';

type SearchPreferenceState = {
  mode: SearchPreference['mode'];
  ready: boolean;
  permission: GeoPermission;
  position: DevicePosition | null;
  chooseMode: (mode: SearchMode) => Promise<void>;
  requestPosition: () => Promise<DevicePosition>;
};

const SearchPreferenceContext = createContext<SearchPreferenceState | null>(
  null,
);

export function SearchPreferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<SearchPreference['mode']>('UNSET');
  const [ready, setReady] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [permission, setPermission] = useState<GeoPermission>('unknown');
  const [position, setPosition] = useState<DevicePosition | null>(null);
  const permissionStatus = useRef<PermissionStatus | null>(null);
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const loadVersion = useRef(0);
  const userId = useRef<string | null>(null);
  userId.current = user?.id ?? null;

  const checkPermission = useCallback(async () => {
    if (permissionStatus.current) permissionStatus.current.onchange = null;
    permissionStatus.current = null;
    if (!window.isSecureContext || !navigator.geolocation) {
      setPermission('unsupported');
      return;
    }
    if (!navigator.permissions?.query) {
      setPermission('unknown');
      return;
    }
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      permissionStatus.current = status;
      status.onchange = () => setPermission(status.state);
      setPermission(status.state);
    } catch {
      setPermission('unknown');
    }
  }, []);

  useEffect(() => {
    const requestedUserId = user?.id;
    const currentLoad = ++loadVersion.current;
    setMode('UNSET');
    setPosition(null);
    setReady(false);
    setOwnerId(null);
    if (!requestedUserId) return;
    void searchClient.preference().then(
      (preference) => {
        if (
          userId.current !== requestedUserId ||
          loadVersion.current !== currentLoad
        )
          return;
        setMode(preference.mode);
        setOwnerId(requestedUserId);
        setReady(true);
      },
      () => {
        if (
          userId.current === requestedUserId &&
          loadVersion.current === currentLoad
        )
          setReady(false);
      },
    );
  }, [user?.id]);

  useEffect(() => {
    void checkPermission();
    const check = () => void checkPermission();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      if (permissionStatus.current) permissionStatus.current.onchange = null;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [checkPermission]);

  const chooseMode = useCallback((next: SearchMode): Promise<void> => {
    const requestedUserId = userId.current;
    if (!requestedUserId)
      return Promise.reject(new Error('Sign in to change search settings.'));
    const save = pendingSave.current.then(async () => {
      if (userId.current !== requestedUserId) return;
      await searchClient.savePreference(next);
      if (userId.current !== requestedUserId) return;
      loadVersion.current++;
      setMode(next);
      setOwnerId(requestedUserId);
      setReady(true);
      if (next !== 'DEVICE') setPosition(null);
    });
    pendingSave.current = save.catch(() => {});
    return save;
  }, []);

  const requestPosition = useCallback(async (): Promise<DevicePosition> => {
    if (!window.isSecureContext || !navigator.geolocation) {
      throw new Error('Location requires HTTPS or localhost.');
    }
    const requestedUserId = userId.current;
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (result) => {
          const next = {
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
            accuracy: Math.round(result.coords.accuracy),
          };
          if (userId.current === requestedUserId) setPosition(next);
          void checkPermission();
          resolve(next);
        },
        (failure) => {
          void checkPermission();
          reject(
            new Error(
              failure.code === 1
                ? 'Location access was declined. Search by city instead.'
                : 'Your location is unavailable. Search by city instead.',
            ),
          );
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      );
    });
  }, [checkPermission]);

  return (
    <SearchPreferenceContext.Provider
      value={{
        mode: ownerId === user?.id ? mode : 'UNSET',
        ready: ready && ownerId === user?.id,
        permission,
        position: ownerId === user?.id ? position : null,
        chooseMode,
        requestPosition,
      }}
    >
      {children}
    </SearchPreferenceContext.Provider>
  );
}

export function useSearchPreference(): SearchPreferenceState {
  const value = useContext(SearchPreferenceContext);
  if (!value) throw new Error('SearchPreferenceProvider is missing.');
  return value;
}
