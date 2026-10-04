import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  APPEARANCE_STORAGE_KEY,
  PREVIOUS_APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  migratePreviousAppearance,
  normalizeAppearancePreferences,
  parseAppearancePreferences,
  type AppearancePreferences,
  type GlassTint,
} from "@/lib/appearance-preferences";
import { setActiveGlassOpacity, setActiveGlassTint } from "@/lib/glass";

type AppAppearanceContextValue = AppearancePreferences & {
  appearanceLoaded: boolean;
  setGlassOpacity: (value: number) => void;
  setGlassTint: (value: GlassTint) => void;
  setWallpaperVisible: (value: boolean) => void;
};

const noop = () => undefined;
const AppAppearanceContext = createContext<AppAppearanceContextValue>({
  ...DEFAULT_APPEARANCE_PREFERENCES,
  appearanceLoaded: false,
  setGlassOpacity: noop,
  setGlassTint: noop,
  setWallpaperVisible: noop,
});

export function AppAppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_APPEARANCE_PREFERENCES);
  // Sync the token module before any child renders, so surfaces that resolve
  // their own glass colour never paint one frame with the previous tint.
  setActiveGlassTint(preferences.glassTint);
  setActiveGlassOpacity(preferences.glassOpacity);
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const userChangedPreferences = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
      .then(async (serialized) => {
        const restored = serialized !== null
          ? parseAppearancePreferences(serialized)
          : migratePreviousAppearance(await AsyncStorage.getItem(PREVIOUS_APPEARANCE_STORAGE_KEY));
        if (active && !userChangedPreferences.current) setPreferences(restored);
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
  const setGlassTint = useCallback((value: GlassTint) => {
    userChangedPreferences.current = true;
    setPreferences((current) => normalizeAppearancePreferences({ ...current, glassTint: value }));
  }, []);
  const setWallpaperVisible = useCallback((value: boolean) => {
    userChangedPreferences.current = true;
    setPreferences((current) => ({ ...current, wallpaperVisible: value }));
  }, []);
  const value = useMemo(() => ({
    ...preferences,
    appearanceLoaded,
    setGlassOpacity,
    setGlassTint,
    setWallpaperVisible,
  }), [preferences, appearanceLoaded, setGlassOpacity, setGlassTint, setWallpaperVisible]);

  return <AppAppearanceContext.Provider value={value}>{children}</AppAppearanceContext.Provider>;
}

export function useAppAppearance() {
  return useContext(AppAppearanceContext);
}
