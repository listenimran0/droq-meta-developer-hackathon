import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fontFamily, layout, radii } from '../theme';
import { Ambient, Brand } from '../components/Ambient';
import { Pulse } from '../components/Pulse';
import { Button, Display } from '../components/ui';

const REACTIONS = ['✨', '🔥', '💚', '😮', '🤝'];

/**
 * The moment a Drop opens — the app's `drop/found` + `drop/[id]` screen.
 * The memory is revealed only because the finder actually walked there.
 */
export const Found: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const local = frame;

  const open = spring({ frame: local, fps, config: { damping: 14, mass: 0.9, stiffness: 80 } });
  const copy = spring({
    frame: local - 14,
    fps,
    config: { damping: 200, mass: 0.8 },
  });
  const react = spring({
    frame: local - 30,
    fps,
    config: { damping: 200, mass: 0.8 },
  });

  return (
    <AbsoluteFill>
      <Ambient intensity={1.1} horizon={false} />

      <div
        style={{
          position: 'absolute',
          top: 90,
          left: layout.gutter,
          opacity: copy,
        }}
      >
        <Brand size="sm" />
      </div>

      {/* the pulse, now lit */}
      <div
        style={{
          position: 'absolute',
          top: 210,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          transform: `scale(${interpolate(open, [0, 1], [0.7, 1])})`,
        }}
      >
        <Pulse distanceMeters={4} urgency={1.5} found />
      </div>

      <div
        style={{
          position: 'absolute',
          top: 440,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: copy,
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
          Found
        </div>
        <div
          style={{
            fontFamily: fontFamily.body,
            fontSize: 21,

            color: colors.textMuted,
            marginTop: 8,
          }}
        >
          You found something.
        </div>
      </div>

      {/* the memory itself */}
      <div
        style={{
          position: 'absolute',
          left: layout.gutter,
          right: layout.gutter,
          top: 610,
          opacity: copy,
          transform: `translateY(${interpolate(copy, [0, 1], [18, 0])}px)`,
        }}
      >
        <div
          style={{
            borderRadius: radii.lg,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: colors.accentLine,
            backgroundColor: colors.accentSoft,
            padding: 32,
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
            Memory
          </div>
          <Display size={44} family={fontFamily.brand} weight={700} tracking={-1.6} color={colors.text} style={{ marginTop: 12, }}>
          I met my best friend here.
        </Display>
          <div
            style={{
              fontFamily: fontFamily.body,
              fontSize: 20,
              color: colors.textMuted,
              marginTop: 14,
            }}
          >
            A quiet thank-you to whoever planted this.
          </div>

          {/* reactions */}
          <div
            style={{
              display: 'flex',
              gap: 18,
              marginTop: 28,
              opacity: react,
              transform: `translateY(${interpolate(react, [0, 1], [10, 0])}px)`,
            }}
          >
            {REACTIONS.map((r, i) => (
              <div
                key={r}
                style={{
                  width: 58,
                  borderRadius: 29,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: colors.border,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  transform: `scale(${interpolate(react, [0, 1], [0.6, 1])})`,
                }}
              >
                {r}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: layout.gutter,
          right: layout.gutter,
          bottom: 120,
          opacity: copy,
        }}
      >
        <Button label="Leave something here" />
      </div>
    </AbsoluteFill>
  );
};
