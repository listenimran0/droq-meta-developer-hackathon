// Shared helpers for scripts/load-test.mjs and scripts/muse-eval.mjs.
// Reads the PUBLIC Supabase URL + anon key from .env / env. Never prints keys.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* .env optional */ }
  return env;
}
const env = loadEnv();
export const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
if (!URL_BASE || !ANON) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (public values) in .env');

/** Create throwaway users via public signup. Emails end in @loadtest.invalid (enables the isolated breaker test hook). */
export async function makeUsers(n) {
  const tag = Date.now().toString(36);
  const users = [];
  for (let i = 0; i < n; i++) {
    const email = `lt-${tag}-${i}@loadtest.invalid`;
    const password = `Lt-${randomBytes(8).toString('hex')}-x9`;
    const r = await fetch(`${URL_BASE}/auth/v1/signup`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (!d.access_token) throw new Error(`signup failed (${r.status}): ${d.msg || d.error_description || d.error_code || 'no token'}`);
    users.push({ email, id: d.user?.id, jwt: d.access_token });
    await new Promise((res) => setTimeout(res, 150));
  }
  return users;
}

/** POST ai-narrator; returns timing + the telemetry headers + parsed body. */
export async function call(user, body) {
  const t0 = performance.now();
  let status = 0, d = {}, h = {};
  try {
    const r = await fetch(`${URL_BASE}/functions/v1/ai-narrator`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${user.jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    status = r.status;
    h = { cache: r.headers.get('x-ai-cache'), tokens: Number(r.headers.get('x-ai-tok') || 0), degraded: r.headers.get('x-ai-deg') === '1', err: r.headers.get('x-ai-err') };
    d = await r.json().catch(() => ({}));
  } catch (e) {
    status = -1; d = { error: String(e.message || e) };
  }
  return { ms: performance.now() - t0, status, body: d, ...h, fallback: d.fallback === true };
}

/** Bounded-concurrency runner. */
export async function pool(tasks, concurrency) {
  const out = new Array(tasks.length); let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); }
  }));
  return out;
}

export function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
}

export function summarize(rs) {
  const ok = rs.filter((r) => r.status === 200);
  const ms = ok.map((r) => r.ms);
  return {
    n: rs.length,
    ok200: ok.length,
    rate429: rs.filter((r) => r.status === 429).length,
    errors: rs.filter((r) => r.status !== 200 && r.status !== 429).length,
    fallback: ok.filter((r) => r.fallback).length,
    degraded: ok.filter((r) => r.degraded).length,
    p50: pct(ms, 50), p95: pct(ms, 95), max: ms.length ? Math.round(Math.max(...ms)) : null,
    tokens: rs.reduce((a, r) => a + (r.tokens || 0), 0),
  };
}

export const COORD_RE = /-?\d{1,3}\.\d{3,}/;
export const DEMO_DROPS = {
  cafe: '07f20c55-966c-4ff9-bc00-b8f20d8af5a2',
  books: '62c6bd19-00ba-4e8c-a1c7-ef7ad6d77682',
  food: '567935a1-355e-4f5a-ae67-26102351b83f',
  plain: '212f0df8-b6ba-421a-8bcd-d2ceba2b3877',
};
/** Real content strings of the demo drops: must never appear in any model output. */
export const LOCKED_CONTENT = ['second cup of tea', '10% off', 'tamarind', 'Demo content', 'I met my best friend'];
