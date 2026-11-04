// Pure resilience helpers (no Deno / network imports) so they can be unit-tested with mocks.

export type FetchOpts = { attemptMs: number; deadlineAt: number; retries: number; retry5xx: boolean };

export type FetchDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
};

export const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function retryAfterMs(res: Response, now: () => number = Date.now): number | null {
  const v = res.headers.get("retry-after");
  if (!v) return null;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - now()) : null;
}

/**
 * fetch with a per-attempt timeout, exponential backoff with full jitter, Retry-After,
 * and a hard total deadline. 429 is always retryable (rejected, not processed); 5xx and
 * timeouts only when the call is safe to repeat (retry5xx).
 */
export async function modelFetch(url: string, init: RequestInit, o: FetchOpts, deps: FetchDeps = {}): Promise<Response> {
  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  let attempt = 0;
  for (;;) {
    const remaining = o.deadlineAt - now();
    if (remaining <= 250) {
      const e = new Error("deadline");
      e.name = "AbortError";
      throw e;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(o.attemptMs, remaining));
    let res: Response | null = null;
    let netErr: unknown = null;
    try {
      res = await f(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      netErr = e;
    } finally {
      clearTimeout(timer);
    }
    let wait: number | null = null;
    if (res) {
      if (res.ok) return res;
      const retryable = res.status === 429 || (o.retry5xx && res.status >= 500);
      if (!retryable || attempt >= o.retries) throw new Error(`model_http_${res.status}`);
      wait = retryAfterMs(res, now);
    } else if (!o.retry5xx || attempt >= o.retries) {
      throw netErr;
    }
    const backoff = Math.min(4000, 400 * 2 ** attempt);
    const delay = wait ?? random() * backoff + 100;
    if (now() + delay >= o.deadlineAt) {
      if (res) throw new Error(`model_http_${res.status}`);
      throw netErr;
    }
    await sleep(delay);
    attempt++;
  }
}

export function modelErrorCode(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "AbortError") return "model_timeout";
    if (/^(model_http_\d+|model_shape|circuit_open|agent_[a-z_]+)$/.test(e.message)) return e.message;
    if (e instanceof SyntaxError) return "model_parse";
  }
  return "model_error";
}

export const countsAsFailure = (code: string) =>
  code === "model_timeout" || code === "model_error" || /^model_http_(429|402|401|403|5\d\d)$/.test(code);
export const isDegraded = (code: string) => code === "circuit_open" || countsAsFailure(code);

export type CircuitStore = {
  allow(): Promise<"closed" | "open" | "probe">;
  report(ok: boolean): Promise<void>;
};

/** Run fn behind a circuit breaker. `sim` is the load-test hook (never set for real users). */
export async function guardedCall<T>(
  store: CircuitStore | null, sim: string | null, fn: () => Promise<T>, simOk?: T,
): Promise<T> {
  const state = store ? await store.allow() : "closed";
  if (state === "open") throw new Error("circuit_open");
  try {
    const out = sim === "fail" ? await Promise.reject(new Error("model_http_503")) : sim === "ok" ? (simOk as T) : await fn();
    if (store) await store.report(true);
    return out;
  } catch (e) {
    if (store && countsAsFailure(modelErrorCode(e))) await store.report(false);
    throw e;
  }
}
