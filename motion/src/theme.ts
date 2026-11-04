/**
 * DROQ design tokens.
 *
 * Mirrors `constants/theme.ts` in the app (Expo SDK 57) so the motion piece
 * renders the real product — same ink, same brass, same type scale.
 */

export const colors = {
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

export const layout = {
  gutter: 24,
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
};

export const motion = {
  fast: 160,
  base: 280,
  slow: 560,
};

/** Font family names registered by `src/fonts.ts`. */
export { fontFamily } from './fonts';
