import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fontFamily, layout, radii } from '../theme';
import { Ambient, Brand } from '../components/Ambient';
import { Button, Display } from '../components/ui';

/**
 * Planting — the app's create/review screen. The same "Plant here / At your
 * spot" card the real app shows, with the live GPS accuracy line, and then the
 * payoff: the Drop is out in the world.
 */
export const Plant: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const local = frame;

  const card = spring({ frame: local, fps, config: { damping: 200, mass: 0.8 } });
  const cta = spring({
    frame: local - 18,
    fps,
    config: { damping: 200, mass: 0.8 },
  });

  return (
    <AbsoluteFill>
      <Ambient intensity={1} horizon={false} />

      <div style={{ position: 'absolute', top: 90, left: layout.gutter, opacity: card }}>
        <Brand size="sm" />
      </div>

      <div
        style={{
          position: 'absolute',
          top: 190,
          left: layout.gutter,
          right: layout.gutter,
          opacity: card,
          transform: `translateY(${interpolate(card, [0, 1], [16, 0])}px)`,
        }}
      >
        <Display size={62} family={fontFamily.brand} weight={700} tracking={-2.4} color={colors.text}>
          Leave it
        </Display>
        <div
          style={{
            fontFamily: fontFamily.body,
            fontSize: 21,
            color: colors.textMuted,
            marginTop: 8,
          }}
        >
          A note for whoever stands here later
        </div>
      </div>

      {/* the place card — real copy from the app */}
      <div
        style={{
          position: 'absolute',
          left: layout.gutter,
          right: layout.gutter,
          top: 400,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: colors.accentLine,
          backgroundColor: colors.accentSoft,
          padding: 28,
          opacity: card,
          transform: `translateY(${interpolate(card, [0, 1], [20, 0])}px)`,
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
          Plant here
        </div>
        <Display size={34} family={fontFamily.display} weight={600} tracking={-1.2} color={colors.text} style={{ marginTop: 6, }}>
          At your spot
        </Display>
        <div
          style={{
            fontFamily: fontFamily.body,
            fontSize: 19,

            color: colors.textMuted,
            marginTop: 10,
          }}
        >
          Only leave Drops in safe, publicly accessible places — never on roads,
          tracks, or private homes.
        </div>
        <div
          style={{
            fontFamily: fontFamily.body,
            fontSize: 19,

            color: colors.textMuted,
            marginTop: 14,
          }}
        >
          GPS accuracy ±4m — clear enough to leave.
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: layout.gutter,
          right: layout.gutter,
          bottom: 120,
          opacity: cta,
          transform: `translateY(${interpolate(cta, [0, 1], [18, 0])}px)`,
        }}
      >
        <Button label="Leave it here" />
      </div>
    </AbsoluteFill>
  );
};

/** The payoff screen — `app/create/preview.tsx`. */
export const Planted: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const local = frame;
  const in1 = spring({ frame: local, fps, config: { damping: 200, mass: 0.8 } });
  const in2 = spring({
    frame: local - 12,
    fps,
    config: { damping: 200, mass: 0.8 },
  });
  const in3 = spring({
    frame: local - 24,
    fps,
    config: { damping: 200, mass: 0.8 },
  });

  return (
    <AbsoluteFill>
      <Ambient intensity={1.15} horizon={false} />

      <div
        style={{
          position: 'absolute',
          top: 620,
          left: layout.gutter,
          right: layout.gutter,
          opacity: in1,
          transform: `translateY(${interpolate(in1, [0, 1], [16, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: fontFamily.bodyMedium,
            fontSize: 15,
            letterSpacing: 4.2,
            textTransform: 'uppercase',
            color: colors.accent,
          }}
        >
          Planted
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 680,
          left: layout.gutter,
          right: layout.gutter,
          opacity: in2,
          transform: `translateY(${interpolate(in2, [0, 1], [20, 0])}px)`,
        }}
      >
        <Display size={72} family={fontFamily.brand} weight={700} tracking={-3} color={colors.text}>
          Your Drop is waiting outside.
        </Display>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 990,
          left: layout.gutter,
          right: layout.gutter,
          fontFamily: fontFamily.body,
          fontSize: 21,

          color: colors.textMuted,
          opacity: in3,
          transform: `translateY(${interpolate(in3, [0, 1], [14, 0])}px)`,
        }}
      >
        Someone will find it by walking — not by scrolling. Invite a race or
        share the hunt while you’re still on the street.
      </div>

      <div
        style={{
          position: 'absolute',
          left: layout.gutter,
          right: layout.gutter,
          bottom: 120,
          opacity: in3,
          transform: `translateY(${interpolate(in3, [0, 1], [18, 0])}px)`,
        }}
      >
        <Button label="Share hunt" variant="ghost" />
      </div>
    </AbsoluteFill>
  );
};
