import React, { useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, withDelay, withTiming } from 'react-native-reanimated';
import { motion } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  delay?: number;
  /** Slight upward drift on enter — default on */
  slide?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Gentle entrance — presence without flash.
 *
 * Driven by Reanimated's *entering* animation rather than a hand-rolled
 * shared value. The runtime owns the animation and re-applies it whenever the
 * view is (re)created. A shared value animated from `useEffect` can be reset
 * together with the native surface and then never animate again, which leaves
 * the content permanently invisible — a blank screen with no error.
 */
export function FadeIn({ children, delay = 0, slide = true, style }: Props) {
  const entering = useMemo(() => {
    const easing = Easing.out(Easing.cubic);
    const build = () => {
      'worklet';
      return {
        initialValues: {
          opacity: 0,
          transform: [{ translateY: slide ? 12 : 0 }],
        },
        animations: {
          opacity: withDelay(delay, withTiming(1, { duration: motion.base, easing })),
          transform: [
            {
              translateY: withDelay(
                delay,
                withTiming(0, { duration: motion.base + 40, easing }),
              ),
            },
          ],
        },
      };
    };
    return build as unknown as NonNullable<
      React.ComponentProps<typeof Animated.View>['entering']
    >;
  }, [delay, slide]);

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

