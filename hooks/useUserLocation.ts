import { useCallback, useEffect, useRef, useState } from 'react';
import {
  advanceApproachSimulation,
  getSimulatedLocation,
  getSimulationMode,
  setSimulationTarget,
  subscribeSimulation,
} from '@/lib/devSimulation';
import { getCurrentCoordinates, watchCoordinates } from '@/services/location';
import type { Coordinates } from '@/types/drop';
import { userErrorMessage } from '@/lib/userError';
import { LOCATION_DEBOUNCE_MS } from '@/constants/config';
import { calculateDistance } from '@/utils/location';

type Options = {
  enabled?: boolean;
  /** When simulating approach toward a specific drop — does not restart the GPS watcher */
  targetDrop?: { latitude: number; longitude: number } | null;
};

/** Skip JS updates for tiny GPS jitter (saves Home/Discover re-renders). */
const MIN_MOVE_M = 5;
const MIN_ACCURACY_DELTA_M = 5;

export function useUserLocation({ enabled = true, targetDrop = null }: Options = {}) {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUpdate = useRef(0);
  const lastCoords = useRef<Coordinates | null>(null);
  const [simTick, setSimTick] = useState(0);
  const targetRef = useRef(targetDrop);
  targetRef.current = targetDrop;

  useEffect(() => subscribeSimulation(() => setSimTick((t) => t + 1)), []);

  useEffect(() => {
    if (targetDrop) setSimulationTarget(targetDrop);
  }, [targetDrop?.latitude, targetDrop?.longitude]);

  const applyCoords = useCallback((next: Coordinates, force = false) => {
    const now = Date.now();
    const prev = lastCoords.current;
    const sim = getSimulationMode() !== 'off';

    // An explicit refresh is what the user asked for — never drop it because
    // it looks like jitter. The old behaviour silently discarded a fresh
    // high-accuracy fix, so "Refresh location" appeared to do nothing.
    if (force) {
      lastUpdate.current = now;
      lastCoords.current = next;
      setCoords(next);
      setError(null);
      setLoading(false);
      return;
    }

    if (!sim && prev) {
      const moved = calculateDistance(
        prev.latitude,
        prev.longitude,
        next.latitude,
        next.longitude,
      );
      const accPrev = prev.accuracy ?? 999;
      const accNext = next.accuracy ?? 999;
      const accuracyImproved = accNext + MIN_ACCURACY_DELTA_M < accPrev;
      const accuracyNoise =
        Math.abs(accNext - accPrev) < MIN_ACCURACY_DELTA_M && moved < MIN_MOVE_M;

      if (
        now - lastUpdate.current < LOCATION_DEBOUNCE_MS &&
        moved < MIN_MOVE_M &&
        !accuracyImproved
      ) {
        return;
      }
      if (accuracyNoise && now - lastUpdate.current < LOCATION_DEBOUNCE_MS * 2) {
        return;
      }
    } else if (!sim && now - lastUpdate.current < LOCATION_DEBOUNCE_MS) {
      return;
    }

    lastUpdate.current = now;
    lastCoords.current = next;
    setCoords(next);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let removed = false;
    let watcher: { remove: () => void } | null = null;
    let approachTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const target = targetRef.current;
        const sim = getSimulatedLocation(target?.latitude, target?.longitude);
        if (sim) {
          applyCoords(sim);
          if (getSimulationMode() === 'approaching') {
            approachTimer = setInterval(() => {
              advanceApproachSimulation();
              const t = targetRef.current;
              const next = getSimulatedLocation(t?.latitude, t?.longitude);
              if (next) applyCoords(next);
            }, 2000);
          }
          return;
        }

        const current = await getCurrentCoordinates();
        if (!removed) applyCoords(current);

        watcher = watchCoordinates(
          (c) => {
            const t = targetRef.current;
            const override = getSimulatedLocation(t?.latitude, t?.longitude);
            applyCoords(override ?? c);
          },
          (e) => {
            setError(userErrorMessage(e));
            setLoading(false);
          },
        );
      } catch (e) {
        if (!removed) {
          setError(userErrorMessage(e, 'Location unavailable'));
          setLoading(false);
        }
      }
    })();

    return () => {
      removed = true;
      watcher?.remove();
      if (approachTimer) clearInterval(approachTimer);
    };
  }, [enabled, applyCoords, simTick]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const target = targetRef.current;
      const sim = getSimulatedLocation(target?.latitude, target?.longitude);
      if (sim) {
        applyCoords(sim, true);
        return sim;
      }
      const current = await getCurrentCoordinates();
      applyCoords(current, true);
      return current;
    } catch (e) {
      setError(userErrorMessage(e, 'Location unavailable'));
      setLoading(false);
      return null;
    }
  }, [applyCoords]);

  return { coords, error, loading, refresh };
}
