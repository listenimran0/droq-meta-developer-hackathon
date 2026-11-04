import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import brandMark from '../assets/droq-brand-mark-transparent.png';
import { colors, layout } from '../theme';
import { Display } from './ui';

/**
 * The app's `AmbientBackground` (hero variant) rebuilt for the web.
 *
 * Same geometry as `components/ui/AmbientBackground.tsx`: ink wash top and
 * bottom, one brass orb drifting up-right, one cold mist orb down-left, and
 * the hairline horizon that only the hero screens draw.
 */
export const Ambient: React.FC<{
  /** 0 → 1 ramp so the atmosphere can swell with the story */
  intensity?: number;
  horizon?: boolean;
}> = ({ intensity = 1, horizon = true }) => {
  const frame = useCurrentFrame();

  // The app drifts on an 18s cycle and breathes on an 8.4s cycle.
  const driftT = (frame % 540) / 540;
  const drift = 0.5 - 0.5 * Math.cos(driftT * Math.PI * 2);
  const breatheT = (frame % 252) / 252;
  const breathe = 0.91 + 0.09 * Math.cos(breatheT * Math.PI * 2);

  const brassX = drift * 18;
  const brassY = drift * -12;
  const brassScale = breathe * 1.0;
  const brassOpacity = (0.55 + breathe * 0.25) * intensity;

  const mistX = drift * -22;
  const mistY = drift * 16;
  const mistOpacity = 0.4 + (1 - drift) * 0.25;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          top: 0,
          left: 0,
          right: 0,
          height: '42%',
          backgroundColor: colors.bgWash,
          opacity: 0.9,
        }}
      />
      <AbsoluteFill
        style={{
          bottom: 0,
          left: 0,
          right: 0,
          height: '38%',
          backgroundColor: colors.ink,
          opacity: 0.85,
        }}
      />

      <div
        style={{
          position: 'absolute',
          width: 340,
          height: 340,
          top: -80,
          right: -60,
          borderRadius: 999,
          backgroundColor: colors.accentSoft,
          transform: `translate(${brassX}px, ${brassY}px) scale(${brassScale})`,
          opacity: brassOpacity,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 320,
          height: 320,
          bottom: -100,
          left: -90,
          borderRadius: 999,
          backgroundColor: colors.mist,
          transform: `translate(${mistX}px, ${mistY}px)`,
          opacity: mistOpacity,
        }}
      />

      {horizon ? (
        <div
          style={{
            position: 'absolute',
            left: layout.gutter,
            right: layout.gutter,
            bottom: '30%',
            height: 1,
            backgroundColor: colors.accentLine,
            opacity: 0.35,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/** The app's `BrandMark` — place+radius glyph plus the wordmark. */
export const Brand: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}> = ({ size = 'md', color = colors.text }) => {
  const SIZES = {
    sm: { word: 22, tracking: 4, mark: 22 },
    md: { word: 28, tracking: 6, mark: 28 },
    lg: { word: 42, tracking: 10, mark: 40 },
  } as const;
  const s = SIZES[size];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Img
        src={brandMark}
        style={{ width: s.mark, height: s.mark, borderRadius: 5, objectFit: 'contain' }}
      />
      <Display size={s.word} tracking={s.tracking} color={color}>
        DROQ
      </Display>
    </div>
  );
};
