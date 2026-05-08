export { colors } from './colors';
export { spacing } from './spacing';

export const theme = {
  colors: require('./colors').colors,
  spacing: require('./spacing').spacing,
} as const;

export type Theme = typeof theme;