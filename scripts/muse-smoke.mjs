// Quick check that the Muse API behaves the way ai-narrator expects.
// Run on a machine with internet:  node scripts/muse-smoke.mjs
// Reads MUSE_API_KEY from .env (never printed). Writes muse-card-test.png.
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY = process.env.MUSE_API_KEY || env.MUSE_API_KEY;
const BASE = 'https://api.meta.ai/v1';
if (!KEY) throw new Error('MUSE_API_KEY missing in .env');
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };

// 1) Tool calling (Quest Agent)
const t0 = Date.now();
const r1 = await fetch(`${BASE}/chat/completions`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    model: 'muse-spark-1.3', reasoning_effort: 'minimal', max_completion_tokens: 1200,
    tool_choice: 'auto',
    messages: [{ role: 'user', content: 'Call get_context, then tell me nothing else.' }],
    tools: [{ type: 'function', function: { name: 'get_context', description: 'Get walker context', parameters: { type: 'object', properties: {} } } }],
  }),
});
const j1 = await r1.json();
const calls = j1?.choices?.[0]?.message?.tool_calls;
console.log('TOOL CALLING:', r1.status, Array.isArray(calls) && calls.length ? `OK (${calls[0].function.name}) ${Date.now() - t0}ms` : 'NO tool_calls', calls ? '' : JSON.stringify(j1).slice(0, 300));

// 2) Muse Image (Found card)
const t1 = Date.now();
const r2 = await fetch(`${BASE}/images/generations`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ model: 'muse-image-1.0', prompt: 'Minimal navy and teal poster of a glowing keepsake orb hidden on a quiet street at dusk. No text.', n: 1, size: '1024x1024' }),
});
const j2 = await r2.json().catch(() => ({}));
const d = j2?.data?.[0];
console.log('IMAGE:', r2.status, d ? `keys=${Object.keys(d).join(',')} ${Date.now() - t1}ms` : JSON.stringify(j2).slice(0, 300));
if (d?.b64_json) { writeFileSync('muse-card-test.png', Buffer.from(d.b64_json, 'base64')); console.log('saved muse-card-test.png'); }
