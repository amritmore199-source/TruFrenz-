import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  normalizeAppearancePreferences,
  parseAppearancePreferences,
  type AppearancePreferences,
} from "@/lib/appearance-preferences";

type AppAppearanceContextValue = AppearancePreferences & {
  appearanceLoaded: boolean;
  setGlassOpacity: (value: number) => void;
  setWallpaperVisible: (value: boolean) => void;
};

const noop = () => undefined;
const AppAppearanceContext = createContext<AppAppearanceContextValue>({
  ...DEFAULT_APPEARANCE_PREFERENCES,
  appearanceLoaded: false,
  setGlassOpacity: noop,
  setWallpaperVisible: noop,
});

export function AppAppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_APPEARANCE_PREFERENCES);
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const userChangedPreferences = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
      .then((serialized) => {
        if (active && !userChangedPreferences.current) setPreferences(parseAppearancePreferences(serialized));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setAppearanceLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!appearanceLoaded) return;
    AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preferences)).catch(() => undefined);
  }, [appearanceLoaded, preferences]);

  const setGlassOpacity = useCallback((value: number) => {
    userChangedPreferences.current = true;
    setPreferences((current) => normalizeAppearancePreferences({ ...current, glassOpacity: value }));
  }, []);
  const setWallpaperVisible = useCallback((value: boolean) => {
    userChangedPreferences.current = true;
    setPreferences((current) => ({ ...current, wallpaperVisible: value }));
  }, []);
  const value = useMemo(() => ({
    ...preferences,
    appearanceLoaded,
    setGlassOpacity,
    setWallpaperVisible,
  }), [preferences, appearanceLoaded, setGlassOpacity, setWallpaperVisible]);

  return <AppAppearanceContext.Provider value={value}>{children}</AppAppearanceContext.Provider>;
}

export function useAppAppearance() {
  return useContext(AppAppearanceContext);
}
