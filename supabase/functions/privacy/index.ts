import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Public Privacy Policy page for Play Console / store listings.
 * Deployed with verify_jwt = false.
 * URL: https://ughruhvqqarlerxwzjoz.supabase.co/functions/v1/privacy
 *
 * Keep in sync with docs/privacy/index.html when editing.
 */

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Privacy Policy — DROQ</title>
  <meta name="description" content="Privacy Policy for the DROQ mobile app." />
  <style>
    :root {
      --bg: #0a0b0d;
      --text: #f4f1ea;
      --muted: #a8a29a;
      --accent: #f2e4be;
      --line: rgba(201, 180, 138, 0.22);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(1200px 600px at 80% -10%, rgba(242,228,190,0.12), transparent),
                  radial-gradient(900px 500px at -10% 100%, rgba(90,110,140,0.12), transparent),
                  var(--bg);
      color: var(--text);
      font-family: "DM Sans", "Segoe UI", system-ui, sans-serif;
      line-height: 1.65;
    }
    main {
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 24px 80px;
    }
    .brand {
      letter-spacing: 0.35em;
      text-transform: uppercase;
      color: var(--accent);
      font-size: 13px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: clamp(2rem, 5vw, 2.75rem);
      line-height: 1.15;
      margin: 0 0 8px;
      letter-spacing: -0.02em;
    }
    .updated {
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 36px;
    }
    h2 {
      font-size: 1.05rem;
      margin: 28px 0 10px;
      color: var(--accent);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    p, li { color: #ddd6cb; }
    ul { padding-left: 1.2rem; }
    li { margin: 6px 0; }
    a { color: var(--accent); }
    hr {
      border: 0;
      border-top: 1px solid var(--line);
      margin: 36px 0;
    }
  </style>
</head>
<body>
  <main>
    <div class="brand">DROQ</div>
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: 6 September 2026</p>
    <p>DROQ (“we”, “the app”) is a location-based discovery app. By using DROQ you agree to this policy.</p>
    <h2>What we collect</h2>
    <ul>
      <li><strong>Account:</strong> email, username, display name, optional profile photo; if you use Google sign-in, name and photo from Google.</li>
      <li><strong>Location:</strong> precise location while you use Discover / Leave / nearby alerts (and background location only if you enable nearby alerts). Location is required for the core experience.</li>
      <li><strong>Content you create:</strong> Drop text, photos, voice notes, and related metadata (place, unlock radius, visibility).</li>
      <li><strong>Device / push:</strong> push notification token if you allow notifications.</li>
      <li><strong>Usage (minimal):</strong> basic app events to keep the service working (for example session start).</li>
    </ul>
    <h2>How we use data</h2>
    <ul>
      <li>To show nearby Drops, unlock content when you are close, and notify you when something is waiting.</li>
      <li>To run accounts, friends, squad hunts, reactions, and moderation/reporting.</li>
      <li>To show ads (via Google AdMob) if ads are enabled in your build.</li>
    </ul>
    <p>We do <strong>not</strong> sell your personal data. We do <strong>not</strong> show exact Drop coordinates to other users in the normal discovery UI.</p>
    <h2>Sharing</h2>
    <ul>
      <li>Data is stored on <strong>Supabase</strong> (auth, database, storage).</li>
      <li><strong>Google</strong> for optional Google sign-in and AdMob ads.</li>
      <li>We may share limited data if required by law or to handle abuse reports.</li>
    </ul>
    <h2>Retention &amp; deletion</h2>
    <p>You can request account deletion by contacting us (see below). We remove or anonymize personal data when no longer needed, except where law requires retention.</p>
    <h2>Your choices</h2>
    <ul>
      <li>Deny or revoke location / notification / camera / mic permissions in system settings (some features will stop working).</li>
      <li>Turn off nearby alerts in DROQ Settings.</li>
      <li>Use email or Google to sign in.</li>
    </ul>
    <h2>Children</h2>
    <p>DROQ is not directed at children under 13. Do not use the app if you are under the minimum age in your country.</p>
    <h2>Contact</h2>
    <p>Email: <a href="mailto:developerimrankhan9@gmail.com">developerimrankhan9@gmail.com</a></p>
    <hr />
    <p>We may update this policy. Continued use after updates means you accept the revised policy.</p>
  </main>
</body>
</html>`;

Deno.serve((_req: Request) => {
  return new Response(HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
