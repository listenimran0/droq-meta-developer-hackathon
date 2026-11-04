import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Display } from '../components/ui';
import { colors, fontFamily } from '../theme';
import { Ambient, Brand } from '../components/Ambient';
import { Pulse } from '../components/Pulse';

/** Closing card — the promise of the product, then the name. */
export const Outro: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const local = frame;

  const mark = spring({ frame: local, fps, config: { damping: 200, mass: 0.9 } });
  const line = spring({
    frame: local - 12,
    fps,
    config: { damping: 200, mass: 0.9 },
  });
  const url = spring({
    frame: local - 26,
    fps,
    config: { damping: 200, mass: 0.9 },
  });

  return (
    <AbsoluteFill>
      <Ambient intensity={1.2} horizon />

      <div
        style={{
          position: 'absolute',
          top: 520,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: mark,
          transform: `scale(${interpolate(mark, [0, 1], [0.9, 1])})`,
        }}
      >
        <Pulse distanceMeters={null} opacity={0.5} />
      </div>

      <div
        style={{
          position: 'absolute',
          top: 760,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: mark,
          transform: `scale(${interpolate(mark, [0, 1], [0.92, 1])})`,
        }}
      >
        <Brand size="lg" />
      </div>

      <div
        style={{
          position: 'absolute',
          top: 880,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: line,
          transform: `translateY(${interpolate(line, [0, 1], [14, 0])}px)`,
        }}
      >
        <Display size={58} family={fontFamily.brand} weight={700} tracking={-2.2} color={colors.text} align="center">
          Leave. Walk. Unlock.
        </Display>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 1010,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: fontFamily.bodyMedium,
          fontSize: 20,
          letterSpacing: 4,
          color: colors.textDim,
          opacity: url,
        }}
      >
        droq.app
      </div>
    </AbsoluteFill>
  );
};
