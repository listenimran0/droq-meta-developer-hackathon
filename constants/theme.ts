export type ThemeColors = {
  bg: string;
  bgElevated: string;
  bgSoft: string;
  bgWash: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentBright: string;
  accentSoft: string;
  accentLine: string;
  ink: string;
  mist: string;
  danger: string;
  success: string;
  glow: string;
};

/**
 * Night ink + bright sand.
 * Premium craft: deep void, quiet borders, sand as the only loud signal.
 */
export const darkColors: ThemeColors = {
  bg: '#050608',
  bgElevated: '#0C0F14',
  bgSoft: '#141820',
  bgWash: '#080A0E',
  border: 'rgba(247,244,238,0.06)',
  borderStrong: 'rgba(247,244,238,0.12)',
  text: '#F7F4EE',
  textMuted: 'rgba(247,244,238,0.55)',
  textDim: 'rgba(247,244,238,0.32)',
  accent: '#F2E4BE',
  accentBright: '#FFF0C8',
  accentSoft: 'rgba(242,228,190,0.12)',
  accentLine: 'rgba(242,228,190,0.38)',
  ink: '#050608',
  mist: 'rgba(110,128,155,0.10)',
  danger: '#E07070',
  success: '#8FBF9F',
  glow: 'rgba(242,228,190,0.14)',
};

/** Day paper + deep sand — companion light theme */
export const lightColors: ThemeColors = {
  bg: '#F4F1EA',
  bgElevated: '#FFFDF8',
  bgSoft: '#E9E4D8',
  bgWash: '#EEE9DE',
  border: 'rgba(20,18,14,0.07)',
  borderStrong: 'rgba(20,18,14,0.12)',
  text: '#12100C',
  textMuted: 'rgba(18,16,12,0.55)',
  textDim: 'rgba(18,16,12,0.34)',
  accent: '#6F5A38',
  accentBright: '#8A7044',
  accentSoft: 'rgba(111,90,56,0.12)',
  accentLine: 'rgba(111,90,56,0.36)',
  ink: '#FFFDF8',
  mist: 'rgba(110,128,155,0.08)',
  danger: '#C04545',
  success: '#3D7A52',
  glow: 'rgba(111,90,56,0.12)',
};

/** @deprecated Prefer useTheme().colors — alias for dark during boot/splash */
export const colors = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

/** Polish scale — the only paddings/gaps/margins used on the Business, Quest, Sense, Found and Insights screens. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Minimum touch target (px). */
export const MIN_TOUCH = 44;

/** Line height for a font size. Bangla glyphs need more vertical room than Latin. */
export function leading(locale: 'en' | 'bn', size: number, en = 1.4, bn = 1.65): number {
  return Math.round(size * (locale === 'bn' ? bn : en));
}

export const layout = {
  /** Side inset — generous, Apple-like */
  gutter: 24,
};

/** Soft corners — machined, not bubbly */
export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
};

export const typography = {
  brand: 'Syne_700Bold',
  display: 'Syne_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
};

/** Premium motion — decisive, never bouncy */
export const motion = {
  fast: 160,
  base: 280,
  slow: 560,
};

export type ThemeScheme = 'light' | 'dark';
export type ThemePreference = 'system' | 'light' | 'dark';
