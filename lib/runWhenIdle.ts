/** Defer non-urgent work past the current frame (RN InteractionManager is deprecated). */
export function runWhenIdle(task: () => void): { cancel: () => void } {
  const ric = globalThis.requestIdleCallback as
    | ((cb: () => void, opts?: { timeout?: number }) => number)
    | undefined;
  const cic = globalThis.cancelIdleCallback as ((id: number) => void) | undefined;

  if (typeof ric === 'function') {
    const id = ric(() => task(), { timeout: 1200 });
    return {
      cancel: () => {
        if (typeof cic === 'function') cic(id);
      },
    };
  }

  const timer = setTimeout(task, 32);
  return { cancel: () => clearTimeout(timer) };
}
