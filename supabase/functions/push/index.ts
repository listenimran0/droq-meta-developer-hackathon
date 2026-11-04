import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Database webhook / pg_net target: send Expo push when a notification row is inserted.
 * Skips nearby_drop (device already fires a local OS alert for those).
 *
 * Deployed with verify_jwt = true — callers must send a valid Supabase JWT
 * (anon or service_role). Payload is re-validated against the DB before send.
 */

type NotifKind =
  | "nearby_drop"
  | "drop_discovered"
  | "friend_request"
  | "friend_accepted"
  | "chain_progress"
  | "system"
  | "drop_reaction"
  | "squad_invite";

type NotificationRow = {
  id: string;
  user_id: string;
  kind: NotifKind;
  title: string;
  body: string | null;
  drop_id: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: NotificationRow;
};

const SKIP_KINDS = new Set<NotifKind>(["nearby_drop"]);

const CHANNEL_BY_KIND: Partial<Record<NotifKind, string>> = {
  friend_request: "social_v2",
  friend_accepted: "social_v2",
  drop_discovered: "social_v2",
  drop_reaction: "social_v2",
  squad_invite: "social_v2",
  chain_progress: "social_v2",
  system: "social_v2",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "missing_env" }, 500);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const recordId = payload.record?.id;
  if (!recordId) {
    return json({ ok: false, error: "missing_record" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: notif, error: notifError } = await admin
    .from("notifications")
    .select("id, user_id, kind, title, body, drop_id, data, created_at")
    .eq("id", recordId)
    .maybeSingle();

  if (notifError) {
    return json({ ok: false, error: notifError.message }, 500);
  }
  if (!notif) {
    return json({ ok: true, skipped: "not_found" });
  }

  const row = notif as NotificationRow;
  if (SKIP_KINDS.has(row.kind)) {
    return json({ ok: true, skipped: "local_only_kind" });
  }

  // Ignore stale replays
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (Number.isFinite(ageMs) && ageMs > 10 * 60 * 1000) {
    return json({ ok: true, skipped: "stale" });
  }

  const { data: tokens, error: tokenError } = await admin
    .from("user_push_tokens")
    .select("token")
    .eq("user_id", row.user_id);

  if (tokenError) {
    return json({ ok: false, error: tokenError.message }, 500);
  }

  const pushTokens = Array.from(
    new Set((tokens ?? []).map((t) => t.token).filter(Boolean)),
  );
  if (pushTokens.length === 0) {
    return json({ ok: true, skipped: "no_tokens" });
  }

  const channelId = CHANNEL_BY_KIND[row.kind] ?? "social_v2";
  const huntId =
    typeof row.data?.hunt_id === "string" ? row.data.hunt_id : undefined;

  const messages = pushTokens.map((to) => ({
    to,
    sound: "default",
    title: row.title,
    body: row.body ?? undefined,
    priority: "high",
    channelId,
    data: {
      kind: row.kind,
      drop_id: row.drop_id,
      hunt_id: huntId,
      notification_id: row.id,
    },
  }));

  const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  const expoJson = await expoRes.json().catch(() => null);

  // Drop dead tokens
  const tickets = Array.isArray(expoJson?.data)
    ? expoJson.data
    : expoJson?.data
      ? [expoJson.data]
      : [];
  const dead: string[] = [];
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    if (
      ticket?.status === "error" &&
      (ticket?.details?.error === "DeviceNotRegistered" ||
        ticket?.message?.includes?.("not a registered push"))
    ) {
      const t = pushTokens[i];
      if (t) dead.push(t);
    }
  }
  if (dead.length) {
    await admin.from("user_push_tokens").delete().in("token", dead);
  }

  return json({
    ok: true,
    sent: pushTokens.length,
    expo_status: expoRes.status,
    expo: expoJson,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
