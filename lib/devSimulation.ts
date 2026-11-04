/**
 * Development-only location / proximity simulation.
 * Disabled in production builds (__DEV__ === false).
 *
 * Flow that works on emulator:
 *   1. DEV → "found" (or Settings → Pin / Found)
 *   2. Discover shows Unlock
 *   3. Unlock uses the same simulated coords (not device GPS)
 */
export type SimulationMode =
  | 'off'
  | 'pinned'
  | 'nearby'
  | 'approaching'
  | 'found'
  | 'time_locked';

export type SimulatedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

const TEST_LAT = Number(process.env.EXPO_PUBLIC_TEST_LOCATION_LAT ?? 23.7806);
const TEST_LNG = Number(process.env.EXPO_PUBLIC_TEST_LOCATION_LNG ?? 90.4070);

let mode: SimulationMode =
  __DEV__ && process.env.EXPO_PUBLIC_DEV_SIMULATION === 'true' ? 'found' : 'off';
let approachStep = 0;
/** Optional pin: when set, sim modes orbit this Drop instead of TEST coords */
let lockedTarget: { latitude: number; longitude: number } | null = null;
let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  listeners.forEach((l) => l());
}

export function isDevSimulationAvailable(): boolean {
  return __DEV__;
}

export function getSimulationMode(): SimulationMode {
  return mode;
}

export function getSimulationVersion(): number {
  return version;
}

export function subscribeSimulation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSimulationMode(next: SimulationMode) {
  if (!__DEV__) return;
  mode = next;
  approachStep = 0;
  if (next === 'off') lockedTarget = null;
  bump();
}

/** Lock simulation to a specific Drop (Discover should call this). */
export function setSimulationTarget(
  target: { latitude: number; longitude: number } | null,
) {
  if (!__DEV__) return;
  lockedTarget = target;
  bump();
}

export function getSimulationTarget() {
  return lockedTarget;
}

/** Offsets ~250m → ~5m */
const APPROACH_OFFSETS = [0.0022, 0.0011, 0.00045, 0.00018, 0.00004];

export function getSimulatedLocation(
  dropLat?: number,
  dropLng?: number,
): SimulatedLocation | null {
  if (!__DEV__ || mode === 'off') return null;

  const baseLat = lockedTarget?.latitude ?? dropLat ?? TEST_LAT;
  const baseLng = lockedTarget?.longitude ?? dropLng ?? TEST_LNG;

  switch (mode) {
    case 'pinned':
      return { latitude: TEST_LAT, longitude: TEST_LNG, accuracy: 5 };
    case 'nearby':
      return {
        latitude: baseLat + 0.0018,
        longitude: baseLng + 0.0012,
        accuracy: 8,
      };
    case 'approaching': {
      const idx = Math.min(approachStep, APPROACH_OFFSETS.length - 1);
      const offset = APPROACH_OFFSETS[idx] ?? 0.00004;
      return {
        latitude: baseLat + offset,
        longitude: baseLng + offset * 0.7,
        accuracy: 6,
      };
    }
    case 'found':
      // Exactly on the Drop — unlock must succeed
      return { latitude: baseLat, longitude: baseLng, accuracy: 4 };
    case 'time_locked':
      return {
        latitude: baseLat + 0.00005,
        longitude: baseLng + 0.00005,
        accuracy: 6,
      };
    default:
      return null;
  }
}

/**
 * Coords to send to unlock_drop / create.
 * ALWAYS prefer simulation when active — never mix with device GPS.
 */
export function resolveDevCoordinates(
  dropLat?: number,
  dropLng?: number,
): SimulatedLocation | null {
  return getSimulatedLocation(dropLat, dropLng);
}

export function advanceApproachSimulation() {
  if (!__DEV__ || mode !== 'approaching') return;
  approachStep = Math.min(approachStep + 1, APPROACH_OFFSETS.length - 1);
  bump();
}

export function getTestLocation() {
  return { latitude: TEST_LAT, longitude: TEST_LNG };
}

export function simulationModeLabel(m: SimulationMode = mode): string {
  switch (m) {
    case 'off':
      return 'Off (real GPS)';
    case 'pinned':
      return 'Pinned to demo area';
    case 'nearby':
      return 'Nearby (~200m)';
    case 'approaching':
      return 'Walking closer…';
    case 'found':
      return 'At the Drop (unlock OK)';
    case 'time_locked':
      return 'Ghost / time-locked';
    default:
      return m;
  }
}
