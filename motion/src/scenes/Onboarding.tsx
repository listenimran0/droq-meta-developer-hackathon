import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fontFamily, layout } from '../theme';
import { Ambient, Brand } from '../components/Ambient';
import { Button, Display } from '../components/ui';

export type OnboardingSlide = {
  /** Step number shown in the small badge */
  step: number;
  title: string;
  body: string;
  cta: string;
};

/**
 * The app's onboarding screen (`app/onboarding.tsx`) rebuilt frame by frame:
 * the same breathing circle, the same three progress dashes, the same
 * wordmark, headline, body copy and CONTINUE button.
 */
export const Onboarding: React.FC<{
  slide: OnboardingSlide;
  /** 0 → 1 exit progress (used to slide the whole screen away) */
  out?: number;
}> = ({ slide, out = 0 }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  // Inside a <Sequence> the current frame is already relative to the cut.
  const local = frame;

  const enter = spring({ frame: local, fps, config: { damping: 200, mass: 0.7 } });
  const titleIn = spring({
    frame: local - 8,
    fps,
    config: { damping: 200, mass: 0.7 },
  });
  const bodyIn = spring({
    frame: local - 18,
    fps,
    config: { damping: 200, mass: 0.7 },
  });

  const shift = interpolate(out, [0, 1], [0, -60]);
  const fade = interpolate(out, [0, 1], [1, 0]);

  // The slow breathing circle behind the copy.
  const breath = 0.94 + 0.06 * Math.sin((frame / 90) * Math.PI);

  return (
    <AbsoluteFill style={{ opacity: fade, transform: `translateY(${shift}px)` }}>
      <Ambient intensity={0.9} horizon={false} />

      {/* breathing circle */}
      <div
        style={{
          position: 'absolute',
          top: 90,
          left: '50%',
          marginLeft: -215,
          width: 430,
          borderRadius: 999,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: colors.border,
          transform: `scale(${breath})`,
        }}
      />

      {/* progress dashes */}
      <div
        style={{
          position: 'absolute',
          top: 168,
          left: layout.gutter,
          right: layout.gutter,
          display: 'flex',
          gap: 10,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: 2,
              backgroundColor: i === slide.step - 1 ? colors.accent : colors.borderStrong,
              transformOrigin: 'left',
              transform: `scaleX(${i < slide.step - 1 ? 1 : 0.999})`,
              opacity: i === slide.step - 1 ? 1 : 0.6,
            }}
          />
        ))}
      </div>

      {/* wordmark */}
      <div
        style={{
          position: 'absolute',
          top: 430,
          left: layout.gutter,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [14, 0])}px)`,
        }}
      >
        <Brand size="lg" />
      </div>

      {/* headline */}
      <div
        style={{
          position: 'absolute',
          top: 560,
          left: layout.gutter,
          right: layout.gutter,
          opacity: titleIn,
          transform: `translateY(${interpolate(titleIn, [0, 1], [16, 0])}px)`,
        }}
      >
        <Display size={62} family={fontFamily.brand} weight={700} tracking={-2.4} color={colors.text}>
          {slide.title}
        </Display>
      </div>

      {/* body */}
      <div
        style={{
          position: 'absolute',
          top: 820,
          left: layout.gutter,
          right: layout.gutter,
          opacity: bodyIn,
          transform: `translateY(${interpolate(bodyIn, [0, 1], [14, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: fontFamily.body,
            fontSize: 22,

            color: colors.textMuted,
            maxWidth: 640,
          }}
        >
          {slide.body}
        </div>
      </div>

      {/* cta */}
      <div
        style={{
          position: 'absolute',
          left: layout.gutter,
          right: layout.gutter,
          bottom: 150,
          opacity: bodyIn,
          transform: `translateY(${interpolate(bodyIn, [0, 1], [18, 0])}px)`,
        }}
      >
        <Button label={slide.cta} />
      </div>
    </AbsoluteFill>
  );
};
