import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fontFamily, layout, radii } from '../theme';
import { Ambient, Brand } from '../components/Ambient';
import { Pulse } from '../components/Pulse';
import { Button, Display } from '../components/ui';

/**
 * The app's home screen (`app/(tabs)/home.tsx`) rebuilt for the web.
 *
 * Layout is lifted from the real screen: quiet chrome up top, the proximity
 * stage in the middle, one primary action, then the editorial "Today’s drop"
 * and the place challenge card.
 */
export const Home: React.FC<{
  /** metres to the closest Drop - null = nothing nearby yet.
   *  A function is resolved per frame, so the odometer can roll. */
  distance: number | ((local: number) => number) | null;
  nearby: number;
  /** 1 = calm, >1 = in range (faster, tighter pulse). A function resolves per frame. */
  urgency?: number | ((local: number) => number);
  /** 0 -> 1 exit */
  out?: number;
}> = ({ distance, nearby, urgency = 1, out = 0 }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  // Inside a <Sequence> the current frame is already relative to the cut.
  const local = frame;

  const metres = typeof distance === 'function' ? distance(local) : distance;
  const urgencyValue = typeof urgency === 'function' ? urgency(local) : urgency;
  const near = metres != null && metres <= 120;
  const distanceText =
    metres == null
      ? '—'
      : metres < 1000
        ? `${Math.round(metres)}m`
        : `${(metres / 1000).toFixed(1)}km`;

  const enter = spring({ frame: local, fps, config: { damping: 200, mass: 0.8 } });
  const stageIn = spring({
    frame: local - 10,
    fps,
    config: { damping: 200, mass: 0.8 },
  });
  const statIn = spring({
    frame: local - 20,
    fps,
    config: { damping: 200, mass: 0.8 },
  });
  const ctaIn = spring({
    frame: local - 34,
    fps,
    config: { damping: 200, mass: 0.8 },
  });

  const shift = interpolate(out, [0, 1], [0, -70]);
  const fade = interpolate(out, [0, 1], [1, 0]);

  return (
    <AbsoluteFill style={{ opacity: fade, transform: `translateY(${shift}px)` }}>
      <Ambient intensity={1} horizon={false} />

      {/* 1) quiet chrome */}
      <div
        style={{
          position: 'absolute',
          top: 88,
          left: layout.gutter,
          right: layout.gutter,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: enter,
        }}
      >
        <Brand size="sm" />
        <div
          style={{
            fontFamily: fontFamily.bodyMedium,
            fontSize: 15,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: colors.textDim,
          }}
        >
          Alerts
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 158,
          left: layout.gutter,
          right: layout.gutter,
          fontFamily: fontFamily.body,
          fontSize: 19,
          lineHeight: 28,
          color: colors.textDim,
          opacity: enter,
        }}
      >
        Quiet city. Something may still be waiting out there.
      </div>

      {/* 2) proximity stage */}
      <div
        style={{
          position: 'absolute',
          top: 250,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: stageIn,
          transform: `scale(${interpolate(stageIn, [0, 1], [0.88, 1])})`,
        }}
      >
        <Pulse
          distanceMeters={metres}
          urgency={urgencyValue}
          opacity={interpolate(stageIn, [0, 1], [0, 1])}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          top: 470,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: statIn,
        }}
      >
        <div
          style={{
            fontFamily: fontFamily.bodyMedium,
            fontSize: 15,
            letterSpacing: 4.2,
            color: colors.accent,
            textTransform: 'uppercase',
          }}
        >
          {near ? 'Something is waiting outside.' : `${nearby} nearby`}
        </div>
        <div
          style={{
            height: 118,
            marginTop: 10,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontFamily: fontFamily.brand,
              fontWeight: 700,
              fontSize: 96,
              lineHeight: 118,
              letterSpacing: -4.6,
              color: colors.text,
            }}
          >
            {distanceText}
          </div>
        </div>

      </div>

      {/* 3) one primary action */}
      <div
        style={{
          position: 'absolute',
          left: layout.gutter,
          right: layout.gutter,
          top: 720,
          opacity: ctaIn,
          transform: `translateY(${interpolate(ctaIn, [0, 1], [16, 0])}px)`,
        }}
      >
        <Button label={near ? 'Unlock it' : 'Walk to it'} />
      </div>

      {/* 4) editorial today + challenge */}
      <div
        style={{
          position: 'absolute',
          left: layout.gutter,
          right: layout.gutter,
          top: 830,
          opacity: ctaIn,
        }}
      >
        <div
          style={{
            fontFamily: fontFamily.bodyMedium,
            fontSize: 14,
            letterSpacing: 3.4,
            textTransform: 'uppercase',
            color: colors.accent,
          }}
        >
          Today’s drop
        </div>
        <Display size={48} family={fontFamily.brand} weight={700} tracking={-1.8} color={colors.text} style={{ marginTop: 8, }}>
          Evolving places
        </Display>
        <div
          style={{
            fontFamily: fontFamily.body,
            fontSize: 20,
            color: colors.textMuted,
            marginTop: 8,
          }}
        >
          Start or add to an Evolving Drop. →
        </div>

        <div
          style={{
            marginTop: 40,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: colors.border,
            padding: 24,
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: fontFamily.bodyMedium,
                fontSize: 14,
                letterSpacing: 3.4,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              Place challenge
            </div>
            <Display size={36} family={fontFamily.brand} weight={700} tracking={-1.2} color={colors.text} style={{ marginTop: 6, }}>
          Dhanmondi Lake
        </Display>
            <div
              style={{
                fontFamily: fontFamily.body,
                fontSize: 19,
                color: colors.textDim,
                marginTop: 4,
              }}
            >
              Find 3 Drops around the water.
            </div>
          </div>
          <Display size={34} family={fontFamily.brand} weight={700} tracking={0} color={colors.text}>
          0/3
        </Display>
        </div>
      </div>
    </AbsoluteFill>
  );
};
