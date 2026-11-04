/**
 * Meta 429 / outage paths. All covered by MOCKED tests (fake fetch, clock and
 * circuit store) — these paths are not live-tested against Meta.
 */
import {
  countsAsFailure,
  guardedCall,
  isDegraded,
  modelErrorCode,
  modelFetch,
  retryAfterMs,
  type CircuitStore,
} from '../supabase/functions/ai-narrator/resilience';

const res = (status: number, headers: Record<string, string> = {}) =>
  new Response('{}', { status, headers });

function harness(responses: Response[], start = 0) {
  let t = start;
  const sleeps: number[] = [];
  const fetchMock = jest.fn(async () => {
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    return r;
  });
  return {
    sleeps,
    fetchMock,
    deps: {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
      now: () => t,
      random: () => 0.5,
    },
    clock: () => t,
  };
}

describe('Retry-After', () => {
  it('parses seconds and HTTP dates', () => {
    expect(retryAfterMs(res(429, { 'retry-after': '2' }), () => 0)).toBe(2000);
    const at = new Date(10_000).toUTCString();
    expect(retryAfterMs(res(429, { 'retry-after': at }), () => 4000)).toBe(6000);
    expect(retryAfterMs(res(429), () => 0)).toBeNull();
  });

  it('is honored when it fits inside the deadline', async () => {
    const h = harness([res(429, { 'retry-after': '3' }), res(200)]);
    const out = await modelFetch('u', {}, { attemptMs: 5000, deadlineAt: 20_000, retries: 2, retry5xx: true }, h.deps);
    expect(out.ok).toBe(true);
    expect(h.sleeps).toEqual([3000]);
  });

  it('is bounded by the deadline: a long Retry-After fails fast instead of sleeping', async () => {
    const h = harness([res(429, { 'retry-after': '120' }), res(200)]);
    await expect(
      modelFetch('u', {}, { attemptMs: 5000, deadlineAt: 10_000, retries: 2, retry5xx: true }, h.deps),
    ).rejects.toThrow('model_http_429');
    expect(h.sleeps).toEqual([]);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('429 is retried even when retry5xx is off, but gives up after the retry budget', async () => {
    const h = harness([res(429), res(429), res(429)]);
    await expect(
      modelFetch('u', {}, { attemptMs: 5000, deadlineAt: 60_000, retries: 1, retry5xx: false }, h.deps),
    ).rejects.toThrow('model_http_429');
    expect(h.fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('5xx retry with backoff', () => {
  it('retries with growing, jittered delays then succeeds', async () => {
    const h = harness([res(503), res(502), res(200)]);
    const out = await modelFetch('u', {}, { attemptMs: 5000, deadlineAt: 60_000, retries: 3, retry5xx: true }, h.deps);
    expect(out.ok).toBe(true);
    expect(h.sleeps).toHaveLength(2);
    expect(h.sleeps[1]).toBeGreaterThan(h.sleeps[0]);
  });

  it('does not retry 5xx when disabled, and never retries 4xx', async () => {
    const a = harness([res(500), res(200)]);
    await expect(modelFetch('u', {}, { attemptMs: 1000, deadlineAt: 9e9, retries: 2, retry5xx: false }, a.deps)).rejects.toThrow('model_http_500');
    expect(a.fetchMock).toHaveBeenCalledTimes(1);
    const b = harness([res(400), res(200)]);
    await expect(modelFetch('u', {}, { attemptMs: 1000, deadlineAt: 9e9, retries: 2, retry5xx: true }, b.deps)).rejects.toThrow('model_http_400');
    expect(b.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops at the hard deadline', async () => {
    const h = harness([res(503), res(503), res(503), res(503)]);
    await expect(
      modelFetch('u', {}, { attemptMs: 1000, deadlineAt: 600, retries: 10, retry5xx: true }, h.deps),
    ).rejects.toBeDefined();
    expect(h.fetchMock.mock.calls.length).toBeLessThan(4);
  });
});

describe('circuit breaker', () => {
  // In-memory store mirroring the SQL: open after `threshold` consecutive failures.
  function store(threshold = 4): CircuitStore & { fails: number; opened: boolean } {
    const s = {
      fails: 0,
      opened: false,
      allow: async () => (s.opened ? ('open' as const) : ('closed' as const)),
      report: async (ok: boolean) => {
        if (ok) s.fails = 0;
        else if (++s.fails >= threshold) s.opened = true;
      },
    };
    return s;
  }
  const failing = () => Promise.reject(new Error('model_http_503'));

  it('opens after repeated failures and then short-circuits without calling the model', async () => {
    const st = store();
    const fn = jest.fn(failing);
    for (let i = 0; i < 4; i++) await expect(guardedCall(st, null, fn)).rejects.toThrow('model_http_503');
    expect(st.opened).toBe(true);
    await expect(guardedCall(st, null, fn)).rejects.toThrow('circuit_open');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('does not count caller errors (400) as failures', async () => {
    const st = store();
    for (let i = 0; i < 6; i++) {
      await expect(guardedCall(st, null, () => Promise.reject(new Error('model_http_400')))).rejects.toThrow();
    }
    expect(st.opened).toBe(false);
  });

  it('a success resets the failure streak', async () => {
    const st = store();
    for (let i = 0; i < 3; i++) await guardedCall(st, null, failing).catch(() => undefined);
    await guardedCall(st, null, async () => 'ok');
    await guardedCall(st, null, failing).catch(() => undefined);
    expect(st.opened).toBe(false);
  });

  it('sim=fail trips the breaker without touching the model', async () => {
    const st = store(2);
    const fn = jest.fn(async () => 'real');
    await guardedCall(st, 'fail', fn).catch(() => undefined);
    await guardedCall(st, 'fail', fn).catch(() => undefined);
    expect(st.opened).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('degraded classification', () => {
  it('flags outage-type errors, not caller errors', () => {
    expect(isDegraded('circuit_open')).toBe(true);
    expect(isDegraded('model_http_429')).toBe(true);
    expect(isDegraded('model_http_503')).toBe(true);
    expect(isDegraded('model_timeout')).toBe(true);
    expect(isDegraded('model_http_400')).toBe(false);
    expect(isDegraded('model_parse')).toBe(false);
    expect(countsAsFailure('model_shape')).toBe(false);
  });

  it('maps errors to codes', () => {
    const abort = new Error('x');
    abort.name = 'AbortError';
    expect(modelErrorCode(abort)).toBe('model_timeout');
    expect(modelErrorCode(new SyntaxError('bad'))).toBe('model_parse');
    expect(modelErrorCode(new Error('model_http_429'))).toBe('model_http_429');
    expect(modelErrorCode(new Error('boom'))).toBe('model_error');
  });
});
