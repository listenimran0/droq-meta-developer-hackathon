// Load / resilience test for the ai-narrator edge function.
//   node scripts/load-test.mjs            (default: 12 users, ~200 mixed text requests, concurrency 30)
// Creates throwaway users via public signup (emails @loadtest.invalid) and PRINTS their ids at the end.
// Clean up afterwards (the script cannot, it has no service key):
//   delete from analytics_events where user_id in (<ids>);
//   delete from ai_calls where user_id in (<ids>) or (user_id='00000000-0000-0000-0000-000000000000' and at >= '<start>');
//   delete from auth.users where id in (<ids>);
// Text actions only, plus at most 5 image calls. Breaker failures are simulated with the
// `_sim` test hook (isolated breaker "meta-sim", only for @loadtest.invalid users) - Meta is never hit with garbage.
import { writeFileSync } from 'node:fs';
import { DEMO_DROPS as D, call, makeUsers, pool, summarize } from './lib-ai.mjs';

const N_USERS = 12, CONC = 30, TOTAL = 200;
const startedAt = new Date().toISOString();
const results = { startedAt };
const log = (...a) => console.log(...a);

log('creating', N_USERS + 6, 'throwaway users…');
const users = await makeUsers(N_USERS + 6);
const mix = users.slice(0, N_USERS);
const [sf1, sf2, sf3, sf4, sf5, atomic] = users.slice(N_USERS); // special-purpose users

const drops = [D.plain, D.cafe, D.books, D.food];
const hint = (u, drop, level) => () => call(u, { action: 'hunt_hint', drop_id: drop, drop_type: 'memory', locale: 'en', context: { hint_level: level, distance_bucket: '100-400' } });
const sense = (u, drop) => () => call(u, { action: 'sense_reason', drop_id: drop, drop_type: 'memory', locale: 'en', context: { distance_bucket: '100-400' } });
const epi = (u, drop) => () => call(u, { action: 'found_epilogue', drop_id: drop, drop_type: 'memory', locale: 'en' });
const clue = (u, i) => () => call(u, { action: 'clue_options', draft: `old tea stall number ${i % 9}`, drop_type: 'memory', locale: 'en' });
const quest = (u, k) => () => call(u, { action: 'quest_plan', minutes: 30, locale: 'en', mood: 'chill', local_hour: 9, intent: 'calm', candidates: [
  { id: D.cafe, type: 'memory', distance_m: 90 + (k % 2) * 0 }, { id: D.books, type: 'message', distance_m: 250 }, { id: D.plain, type: 'memory', distance_m: 300 }] });
const brief = (u) => () => call(u, { action: 'business_brief', locale: 'en', aggregates: { days: 14, total_visits: 32, unique_visitors: 16, daily: [5,4,2,1,2,2,1,3,5,0,1,2,4,0], top_types: [{ type: 'memory', visits: 11 }], audience: { peak_hour: 19, weekday: [2,4,6,1,8,9,2], new_visitors: 5, returning_visitors: 11, interests: [{ type: 'memory', visits: 11 }] }, funnel: { shown: 56, opened: 32, verified: 25 } } });

// ── 1. mixed load ───────────────────────────────────────────────────────────
log('\n[1] mixed text load:', TOTAL, 'requests, concurrency', CONC);
const tasks = [];
for (let i = 0; i < TOTAL; i++) {
  const u = mix[i % N_USERS];
  const r = i % 20;
  if (r < 8) tasks.push({ a: 'hunt_hint', f: hint(u, drops[i % 4], 1 + (i % 3)) });
  else if (r < 12) tasks.push({ a: 'sense_reason', f: sense(u, drops[i % 4]) });
  else if (r < 15) tasks.push({ a: 'found_epilogue', f: epi(u, drops[i % 4]) });
  else if (r < 19) tasks.push({ a: 'clue_options', f: clue(u, i) });
  else if (i % 40 === 19) tasks.push({ a: 'business_brief', f: brief(u) });
  else tasks.push({ a: 'quest_plan', f: quest(u, i) });
}
const t0 = performance.now();
const mixed = await pool(tasks.map((t) => t.f), CONC);
const wall = (performance.now() - t0) / 1000;
const byAction = {};
tasks.forEach((t, i) => (byAction[t.a] ||= []).push(mixed[i]));
results.mixed = { wallSeconds: Math.round(wall), throughputRps: +(TOTAL / wall).toFixed(2), overall: summarize(mixed), byAction: Object.fromEntries(Object.entries(byAction).map(([k, v]) => [k, summarize(v)])) };
const cacheable = mixed.filter((r, i) => ['hunt_hint', 'clue_options', 'quest_plan', 'business_brief'].includes(tasks[i].a) && r.status === 200);
results.mixed.cache = { cacheable: cacheable.length, hit: cacheable.filter((r) => r.cache === 'hit').length, wait: cacheable.filter((r) => r.cache === 'wait').length, miss: cacheable.filter((r) => r.cache === 'miss').length };
log(JSON.stringify(results.mixed, null, 1));

// ── 2. single-flight: 30 concurrent identical hints (fresh key) from 5 users ─
log('\n[2] single-flight: 30 concurrent identical hunt_hint');
const sfUsers = [sf1, sf2, sf3, sf4, sf5];
const sfRes = await pool(Array.from({ length: 30 }, (_, i) => hint(sfUsers[i % 5], D.food, 4)), 30);
results.singleFlight = { ...summarize(sfRes), miss: sfRes.filter((r) => r.cache === 'miss').length, wait: sfRes.filter((r) => r.cache === 'wait').length, hit: sfRes.filter((r) => r.cache === 'hit').length };
log(JSON.stringify(results.singleFlight));

// ── 3. rate-limit atomicity: 60 concurrent identical cacheable requests from ONE user ─
log('\n[3] rate-limit atomicity: 60 concurrent requests, one user (limit 40/min)');
const at = await pool(Array.from({ length: 60 }, () => hint(atomic, D.cafe, 3)), 60);
results.atomicLimit = { sent: 60, allowed: at.filter((r) => r.status === 200).length, rejected429: at.filter((r) => r.status === 429).length, limit: 40, heldLimit: at.filter((r) => r.status === 200).length <= 40 };
log(JSON.stringify(results.atomicLimit));

// ── 4. circuit breaker (isolated sim breaker) ──
log('\n[4] circuit breaker (simulated failures, isolated breaker)');
const bu = mix[0];
const sim = (mode) => call(bu, { action: 'hunt_hint', drop_id: D.plain, drop_type: 'memory', locale: 'en', context: { hint_level: 2 }, _sim: mode });
const seq = [];
for (let i = 0; i < 8; i++) { const r = await sim('fail'); seq.push({ i: i + 1, ms: Math.round(r.ms), error: r.body.error, degraded: !!r.body.degraded }); }
results.breaker = { failures: seq };
log(seq.map((s) => `${s.i}:${s.error}${s.degraded ? '*' : ''}(${s.ms}ms)`).join('  '));
log('waiting 28s for the open window to expire…');
await new Promise((r) => setTimeout(r, 28000));
const probeFail = await sim('fail');
const afterProbeFail = await sim('ok');
log('probe(fail) →', probeFail.body.error, '| next while re-opened →', afterProbeFail.body.error);
await new Promise((r) => setTimeout(r, 28000));
const probeOk = await sim('ok');
const closed = await sim('ok');
results.breaker.recovery = { failedProbe: probeFail.body.error, whileReopened: afterProbeFail.body.error, successfulProbe: { fallback: probeOk.fallback, error: probeOk.body.error }, afterClose: { fallback: closed.fallback, error: closed.body.error } };
results.breaker.opensAfter = seq.findIndex((s) => s.error === 'circuit_open') + 1;
results.breaker.openLatencyMs = seq.filter((s) => s.error === 'circuit_open').map((s) => s.ms);
log(JSON.stringify(results.breaker.recovery), 'opens after request #' + results.breaker.opensAfter);

// ── 5. per-user image cap: 6 concurrent found_card (limit 5/hour) ── (<= 5 real image calls)
log('\n[5] per-user image limit: 6 concurrent found_card (limit 5/hour; 5 real image calls)');
const img = await pool(Array.from({ length: 6 }, () => () => call(atomic, { action: 'found_card', drop_id: D.plain, drop_type: 'memory' })), 6);
results.imageLimit = { sent: 6, ok: img.filter((r) => r.status === 200 && !r.fallback).length, rejected429: img.filter((r) => r.status === 429).length, p50: summarize(img).p50, heldLimit: img.filter((r) => r.status === 200 && !r.fallback).length <= 5 };
log(JSON.stringify(results.imageLimit));

results.endedAt = new Date().toISOString();
results.users = users.map((u) => u.id);
writeFileSync(new URL('./load-test-results.json', import.meta.url), JSON.stringify(results, null, 1));
log('\nDONE. throwaway user ids (clean up!):');
log(users.map((u) => `'${u.id}'`).join(','));
log('window start:', startedAt);
