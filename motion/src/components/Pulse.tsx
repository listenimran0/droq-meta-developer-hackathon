import React from 'react';
import { useCurrentFrame } from 'remotion';
import { colors } from '../theme';

/**
 * The app's `ProximityPulse` rebuilt for the web.
 *
 * Geometry and timings are lifted straight from
 * `components/discover/ProximityPulse.tsx` (size "sm", rings only):
 * stage 168, wash 148, outer 148, ring 104, core 40 — with a 1.6s inner
 * breath and a 2.2s outer one.
 */

/** 0 → 1 → 0 with the same soft in-out shape as the app's easing. */
const triangle = (t: number) => 0.5 - 0.5 * Math.cos(t * Math.PI * 2);

export const Pulse: React.FC<{
  /** metres away — drives how open the core reads */
  distanceMeters?: number | null;
  /** >1 speeds the breath up (the app does this when you are in range) */
  urgency?: number;
  /** 0 → 1 fade-in */
  opacity?: number;
  /** show the little glow ring (only when found) */
  found?: boolean;
}> = ({ distanceMeters = null, urgency = 1, opacity = 1, found = false }) => {
  const frame = useCurrentFrame();

  const innerCycle = 320 / urgency;
  const outerCycle = 440 / urgency;
  const inner = 0.85 + 0.29 * triangle((frame % innerCycle) / innerCycle);
  const outer = 0.7 + 0.58 * triangle((frame % outerCycle) / outerCycle);

  const proximity =
    distanceMeters == null ? 0 : Math.max(0, Math.min(1, 1 - distanceMeters / 500));

  const ringColor = found ? colors.accentBright : colors.accentLine;

  return (
    <div
      style={{
        position: 'relative',
        width: 168,
        height: 168,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 148,
          height: 148,
          borderRadius: 74,
          backgroundColor: colors.glow,
          opacity: found ? 0.95 : 0.75,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 148,
          height: 148,
          borderRadius: 74,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: ringColor,
          transform: `scale(${outer})`,
          opacity:
            0.4 + (1 - (outer - 0.7) / 0.58) * 0 + (1 - triangle((frame % outerCycle) / outerCycle)) * 0.34,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 104,
          height: 104,
          borderRadius: 52,
          borderWidth: 3,
          borderStyle: 'solid',
          borderColor: ringColor,
          transform: `scale(${inner})`,
          opacity: 0.7 + (1 - triangle((frame % innerCycle) / innerCycle)) * -0.55,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 3,
          borderStyle: 'solid',
          borderColor: ringColor,
          backgroundColor: found ? colors.accent : colors.accentSoft,
          transform: `scale(${0.72 + proximity * 0.42})`,
        }}
      />
      {found ? (
        <div
          style={{
            position: 'absolute',
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: colors.accentBright,
            opacity: 0.45,
          }}
        />
      ) : null}
    </div>
  );
};
