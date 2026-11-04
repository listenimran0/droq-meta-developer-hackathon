import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { HEADING_MIN_DELTA_DEG, HEADING_MIN_INTERVAL_MS } from '@/constants/config';

function headingDelta(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Device compass heading in degrees (0 = north). Null if unavailable. Throttled. */
export function useHeading(enabled = true) {
  const [heading, setHeading] = useState<number | null>(null);
  const lastDeg = useRef<number | null>(null);
  const lastAt = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        sub = await Location.watchHeadingAsync((h) => {
          if (cancelled) return;
          const deg =
            typeof h.trueHeading === 'number' && h.trueHeading >= 0
              ? h.trueHeading
              : h.magHeading;
          if (!Number.isFinite(deg)) return;

          const now = Date.now();
          const prev = lastDeg.current;
          if (
            prev != null &&
            headingDelta(prev, deg) < HEADING_MIN_DELTA_DEG &&
            now - lastAt.current < HEADING_MIN_INTERVAL_MS
          ) {
            return;
          }
          // Also skip pure noise under min delta even after interval
          if (prev != null && headingDelta(prev, deg) < HEADING_MIN_DELTA_DEG) {
            return;
          }

          lastDeg.current = deg;
          lastAt.current = now;
          setHeading(deg);
        });
      } catch {
        // Heading unsupported on some emulators
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);

  return heading;
}
