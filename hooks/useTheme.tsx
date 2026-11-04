import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  darkColors,
  lightColors,
  type ThemeColors,
  type ThemePreference,
  type ThemeScheme,
} from '@/constants/theme';

const KEY = 'droq:themePreference';

type ThemeValue = {
  colors: ThemeColors;
  scheme: ThemeScheme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | undefined>(undefined);

function resolveScheme(
  preference: ThemePreference,
  system: string | null | undefined,
): ThemeScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'system' || v === 'light' || v === 'dark') {
        setPreferenceState(v);
      }
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(KEY, next).catch(() => undefined);
  }, []);

  const scheme = resolveScheme(preference, system);
  const colors = scheme === 'light' ? lightColors : darkColors;

  const value = useMemo(
    () => ({ colors, scheme, preference, setPreference }),
    [colors, scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
