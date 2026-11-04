import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { motion } from '@/constants/theme';
import { formatDistance } from '@/utils/location';

type Props = {
  meters: number | null;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

/**
 * Odometer for the proximity number — rolls from the last reading to the
 * new one instead of snapping. Walking feels like progress, not a glitch.
 * Honours the system reduce-motion setting (jumps straight to the value).
 */
export function AnimatedDistance({ meters, style, numberOfLines = 1 }: Props) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(meters ?? null);
  const displayRef = useRef(meters ?? null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const to = meters;
    const from = displayRef.current;

    if (to == null || from == null || from === to || reducedMotion) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }

    const start = Date.now();
    const duration = motion.slow;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // out-cubic — decisive, not bouncy
      const value = from + (to - from) * eased;
      displayRef.current = value;
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = to;
        setDisplay(to);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [meters, reducedMotion]);

  return (
    <Text
      style={style}
      numberOfLines={numberOfLines}
      accessibilityLabel={formatDistance(meters ?? NaN)}
    >
      {formatDistance(display ?? NaN)}
    </Text>
  );
}
