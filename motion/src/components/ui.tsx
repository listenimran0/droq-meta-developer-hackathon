import React from 'react';
import { colors, fontFamily, radii } from '../theme';

/**
 * Display type.
 *
 * The web engine gives a display face a very tall natural line box, which
 * throws the surrounding layout off. Pinning the box and centring the glyphs
 * inside it keeps every headline exactly where the app puts it.
 */
export const Display: React.FC<{
  children: React.ReactNode;
  size: number;
  family?: string;
  weight?: number;
  tracking?: number;
  color?: string;
  align?: 'left' | 'center';
  style?: React.CSSProperties;
}> = ({
  children,
  size,
  family = fontFamily.brand,
  weight = 700,
  tracking = 0,
  color = colors.text,
  align = 'left',
  style,
}) => {
  const h = Math.round(size * 1.3);
  return (
    <div
      style={{
        height: h,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: family,
          fontWeight: weight,
          fontSize: size,
          lineHeight: h,
          letterSpacing: tracking,
          color,
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** The app's primary button (`components/ui/Button.tsx`). */
export const Button: React.FC<{
  label: string;
  variant?: 'primary' | 'ghost';
  style?: React.CSSProperties;
}> = ({ label, variant = 'primary', style }) => (
  <div
    style={{
      minHeight: 52,
      borderRadius: radii.md,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 22px',
      backgroundColor: variant === 'primary' ? colors.accent : 'transparent',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: variant === 'primary' ? colors.accentBright : colors.borderStrong,
      ...style,
    }}
  >
    <span
      style={{
        fontFamily: fontFamily.bodyMedium,
        fontSize: 12,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: variant === 'primary' ? colors.ink : colors.text,
      }}
    >
      {label}
    </span>
  </div>
);

/** Small uppercase eyebrow — the app's `sectionLabel` / `eyebrow` style. */
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  size?: number;
  tracking?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, size = 10, tracking = 3.2, color = colors.accent, style }) => (
  <div
    style={{
      fontFamily: fontFamily.bodyMedium,
      fontSize: size,
      letterSpacing: tracking,
      color,
      textTransform: 'uppercase',
      ...style,
    }}
  >
    {children}
  </div>
);
