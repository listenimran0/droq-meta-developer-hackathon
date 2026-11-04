import { useEffect, useState } from 'react';

/**
 * True only once `loading` has stayed true for `delay` ms.
 *
 * A skeleton that flashes for 120ms reads as jank, not as feedback. Waiting a
 * beat before revealing it means quick responses render straight away, and
 * only genuinely slow loads show a placeholder.
 *
 * @param loading  the raw loading flag
 * @param delay    how long the load has to run before the skeleton appears
 */
export function useDelayedLoading(loading: boolean, delay = 260): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!loading) {
      setDelayed(false);
      return;
    }
    const timer = setTimeout(() => setDelayed(true), delay);
    return () => clearTimeout(timer);
  }, [loading, delay]);

  return delayed;
}
