export const colors = {
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
} as const;

export type Colors = typeof colors;