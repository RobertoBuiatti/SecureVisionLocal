export { colors } from './colors';
export { spacing } from './spacing';
export { ThemeProvider, useTheme, useColors, getStatusColor } from './ThemeProvider';
export type { ThemeMode } from './ThemeProvider';

export const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  xxxl: 32,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const colorsDark = {
  background: '#0D1117',
  surface: '#161B22',
  border: '#30363D',
  text: '#F0F6FC',
  textMuted: '#8B949E',
  primary: '#58A6FF',
  secondary: '#3FB950',
};

export const theme = {
  colors: require('./colors').colors,
  spacing: require('./spacing').spacing,
};