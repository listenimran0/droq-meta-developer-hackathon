import { useCallback, useEffect, useRef, useState } from 'react';
import { getSimulatedLocation } from '@/lib/devSimulation';
import { getReliableCoordinatesForCreate } from '@/services/location';
import type { Coordinates } from '@/types/drop';
import { userErrorMessage } from '@/lib/userError';

/** A cached fix older than this is re-sampled before the Drop is planted. */
const FIX_MAX_AGE_MS = 30_000;

/**
 * The position a Drop gets planted at.
 *
 * `useUserLocation` watches at Balanced accuracy — ±30–50m in a city, which is
 * far too coarse to plant a Drop. The create screen used to show that coarse
 * reading and then, on submit, take a *separate* high-accuracy fix. Two
 * consequences, both of which read as "the location is wrong":
 *
 *  - the readout disagreed with the pin that actually got planted, and
 *  - a spot reported as "too rough to plant" was accepted by the submit,
 *    because the submit sampled with a better accuracy.
 *
 * This hook takes one high-accuracy fix up front and hands the *same*
 * coordinates to both the readout and the submit, so what you see is what
 * gets planted. Dev simulation wins over the radio for the same reason —
 * never mix simulated and real coordinates.
 */
export function usePlantLocation() {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fixedAt = useRef(0);
  const alive = useRef(true);

  /** Take a fresh high-accuracy fix (or the simulated one in dev). */
  const acquire = useCallback(async (): Promise<Coordinates | null> => {
    setLoading(true);
    setError(null);
    try {
      const sim = getSimulatedLocation();
      const next = sim ?? (await getReliableCoordinatesForCreate());
      if (!alive.current) return null;
      setCoords(next);
      fixedAt.current = Date.now();
      return next;
    } catch (e) {
      if (!alive.current) return null;
      setError(userErrorMessage(e, 'Location unavailable'));
      setCoords(null);
      return null;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void acquire();
    return () => {
      alive.current = false;
    };
  }, [acquire]);

  /**
   * The coordinates to plant with. Re-samples only when the cached fix has
   * gone stale, so a quick submit does not pay for a second GPS round-trip.
   */
  const resolveForPlant = useCallback(async (): Promise<Coordinates> => {
    if (coords && Date.now() - fixedAt.current < FIX_MAX_AGE_MS) return coords;
    const next = await acquire();
    if (!next) {
      throw new Error('Couldn’t get a clear location. Move outdoors and try again.');
    }
    return next;
  }, [acquire, coords]);

  return { coords, loading, error, refresh: acquire, resolveForPlant };
}
