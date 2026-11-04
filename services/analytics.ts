import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export async function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from('analytics_events').insert({
      user_id: user?.id ?? null,
      event_name: eventName,
      properties,
    });
  } catch {
    // Analytics must never block the product path
  }
}
