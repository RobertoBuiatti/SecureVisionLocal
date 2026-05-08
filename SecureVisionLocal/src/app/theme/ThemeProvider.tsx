import React, { createContext, useContext, useMemo } from 'react';
import type { CameraStatus } from '@shared/types';

export type ThemeMode = 'light' | 'dark';

interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryDark: string;
  secondaryLight: string;
  background: string;
  backgroundDark: string;
  backgroundLight: string;
  surface: string;
  surfaceDark: string;
  surfaceLight: string;
  error: string;
  errorDark: string;
  success: string;
  warning: string;
  info: string;
  text: string;
  textDark: string;
  textSecondary: string;
  textSecondaryDark: string;
  textMuted: string;
  textDisabled: string;
  border: string;
  borderLight: string;
  overlay: string;
  overlayLight: string;
  recording: string;
  live: string;
  offline: string;
  errorVideo: string;
  ptzJoystick: string;
  ptzActive: string;
}

interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
}

const lightColors: ThemeColors = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryLight: '#3B82F6',
  secondary: '#00BFA6',
  secondaryDark: '#00897B',
  secondaryLight: '#4DB6AC',
  background: '#FFFFFF',
  backgroundDark: '#F5F5F5',
  backgroundLight: '#F8FAFC',
  surface: '#F8FAFC',
  surfaceDark: '#E8E8E8',
  surfaceLight: '#FFFFFF',
  error: '#EF4444',
  errorDark: '#DC2626',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',
  text: '#1E293B',
  textDark: '#374151',
  textSecondary: '#64748B',
  textSecondaryDark: '#6B7280',
  textMuted: '#94A3B8',
  textDisabled: '#CBD5E1',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  recording: '#EF4444',
  live: '#10B981',
  offline: '#6B7280',
  errorVideo: '#EF4444',
  ptzJoystick: '#E2E8F0',
  ptzActive: '#2563EB',
};

const darkColors: ThemeColors = {
  primary: '#1E3A5F',
  primaryDark: '#0D1F33',
  primaryLight: '#3D5A80',
  secondary: '#00BFA6',
  secondaryDark: '#00897B',
  secondaryLight: '#4DB6AC',
  background: '#0A0F14',
  backgroundDark: '#050810',
  backgroundLight: '#1A2332',
  surface: '#151D28',
  surfaceDark: '#0D1520',
  surfaceLight: '#1F2937',
  error: '#FF5252',
  errorDark: '#D32F2F',
  success: '#4CAF50',
  warning: '#FFC107',
  info: '#2196F3',
  text: '#FFFFFF',
  textDark: '#E0E0E0',
  textSecondary: '#B0BEC5',
  textSecondaryDark: '#9E9E9E',
  textMuted: '#78909C',
  textDisabled: '#546E7A',
  border: '#2C3E50',
  borderLight: '#3D5A80',
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.5)',
  recording: '#FF3B30',
  live: '#34C759',
  offline: '#8E8E93',
  errorVideo: '#FF6B6B',
  ptzJoystick: '#1E3A5F',
  ptzActive: '#00BFA6',
};

const themes: Record<ThemeMode, Theme> = {
  light: {
    mode: 'light',
    colors: lightColors,
  },
  dark: {
    mode: 'dark',
    colors: darkColors,
  },
};

export function getStatusColor(status: CameraStatus, isDark: boolean): string {
  const colorMap: Record<CameraStatus, { light: string; dark: string }> = {
    online: { light: '#10B981', dark: '#34C759' },
    offline: { light: '#6B7280', dark: '#8E8E93' },
    error: { light: '#EF4444', dark: '#FF5252' },
    connecting: { light: '#F59E0B', dark: '#FFC107' },
  };
  return isDark ? colorMap[status].dark : colorMap[status].light;
}

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  initialMode?: ThemeMode;
}

export function ThemeProvider({
  children,
  initialMode = 'dark',
}: ThemeProviderProps): React.ReactElement {
  const [mode, setMode] = React.useState<ThemeMode>(initialMode);

  const theme = useMemo(() => themes[mode], [mode]);

  const toggleTheme = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  const value = useMemo(
    () => ({
      theme,
      isDark: mode === 'dark',
      toggleTheme,
      setTheme,
    }),
    [theme, mode]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useColors(): ThemeColors {
  const { theme } = useTheme();
  return theme.colors;
}