import React from 'react';
import {
  AbsoluteFill,
  Composition,
  interpolate,
  Sequence,
  useCurrentFrame,
} from 'remotion';
import { Onboarding } from './scenes/Onboarding';
import { Home } from './scenes/Home';
import { Found } from './scenes/Found';
import { Plant, Planted } from './scenes/Plant';
import { Outro } from './scenes/Outro';

const FPS = 30;

/** Frame marks for the journey. */
const T = {
  open: 0,
  openEnd: 200,
  feet: 200,
  feetEnd: 360,
  home: 360,
  homeEnd: 570,
  walk: 570,
  walkEnd: 900,
  range: 900,
  rangeEnd: 1000,
  found: 1000,
  foundEnd: 1210,
  plant: 1210,
  plantEnd: 1400,
  planted: 1400,
  plantedEnd: 1560,
  outro: 1560,
  outroEnd: 1800,
};

const WALK_FRAMES = T.range - T.walk;

/** Distance to the closest Drop, walked down over the journey. */
function distanceAt(local: number): number {
  if (local < 0) return 304;
  if (local < WALK_FRAMES) {
    // 304 → 88, easing out so it settles as you arrive
    const t = local / WALK_FRAMES;
    return 304 + (88 - 304) * (1 - Math.pow(1 - t, 2));
  }
  // 88 → 8, quickening as the radius closes
  const t = Math.min(1, (local - WALK_FRAMES) / (T.rangeEnd - T.range));
  return 88 + (8 - 88) * Math.pow(t, 0.7);
}

/** Urgency for the pulse — the app speeds it up when you are in range. */
function urgencyAt(local: number): number {
  if (local < 0) return 1;
  if (local < WALK_FRAMES) return 1 + (local / WALK_FRAMES) * 0.5;
  return 1.5;
}

/** A footstep bob while the finder is walking. */
const Walking: React.FC<{ children: React.ReactNode; frames: number }> = ({
  children,
  frames,
}) => {
  const frame = useCurrentFrame();
  const bob = Math.sin(frame / 4.4) * 5;
  const settle = interpolate(frame, [0, 6], [0, 1], {
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        // A transform makes this the containing block for the absolutely
        // positioned screen inside it, so it has to fill the frame itself.
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        transform: `translateY(${bob * settle}px)`,
      }}
    >
      {children}
    </div>
  );
};

export const DroqJourney: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* 1 — the promise */}
      <Sequence from={T.open} durationInFrames={T.openEnd - T.open} name="01-open">
        <Onboarding
          slide={{
            step: 1,
            title: 'The opposite of scrolling',
            body: 'Reels keep you on the couch. DROQ pulls you into the street — notes, photos, and secrets that only open when you stand there.',
            cta: 'Continue',
          }}
        />
      </Sequence>

      {/* 2 — the deal */}
      <Sequence from={T.feet} durationInFrames={T.feetEnd - T.feet} name="02-feet">
        <Onboarding
          slide={{
            step: 2,
            title: 'Your feet are the password',
            body: 'Allow location so DROQ can sense what’s nearby. Exact pins stay on your phone. We only listen for Drops around you.',
            cta: 'Step outside',
          }}
        />
      </Sequence>

      {/* 3 — the quiet city, then the signal */}
      <Sequence from={T.home} durationInFrames={T.homeEnd - T.home} name="03-home">
        <Home distance={304} nearby={40} urgency={1} />
      </Sequence>

      {/* 4 — the walk */}
      <Sequence from={T.walk} durationInFrames={T.walkEnd - T.walk} name="04-walk">
        <Walking frames={T.walkEnd - T.walk}>
          <Home
            distance={(local) => distanceAt(local)}
            nearby={41}
            urgency={(local) => urgencyAt(local)}
          />
        </Walking>
      </Sequence>

      {/* 5 — in range */}
      <Sequence from={T.range} durationInFrames={T.rangeEnd - T.range} name="05-range">
        <Home
          distance={(local) => distanceAt(WALK_FRAMES + local)}
          nearby={41}
          urgency={1.5}
          out={interpolate(0, [0, 1], [0, 0])}
        />
      </Sequence>

      {/* 6 — it opens */}
      <Sequence from={T.found} durationInFrames={T.foundEnd - T.found} name="06-found">
        <Found />
      </Sequence>

      {/* 7 — plant one */}
      <Sequence from={T.plant} durationInFrames={T.plantEnd - T.plant} name="07-plant">
        <Plant />
      </Sequence>

      {/* 8 — it is out there */}
      <Sequence
        from={T.planted}
        durationInFrames={T.plantedEnd - T.planted}
        name="08-planted"
      >
        <Planted />
      </Sequence>

      {/* 9 — close */}
      <Sequence from={T.outro} durationInFrames={T.outroEnd - T.outro} name="09-outro">
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DroqJourney"
        component={DroqJourney}
        durationInFrames={T.outroEnd}
        fps={FPS}
        width={1080}
        height={1920}
      />
    </>
  );
};
