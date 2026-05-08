export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,

  screenPadding: 16,
  cardPadding: 12,
  buttonPadding: 12,

  borderRadius: 8,
  borderRadiusSmall: 4,
  borderRadiusLarge: 16,

  iconSmall: 16,
  iconMedium: 24,
  iconLarge: 32,
} as const;

export type Spacing = typeof spacing;