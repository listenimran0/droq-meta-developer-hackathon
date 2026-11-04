import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * "Verified visits" for the caller's own Drops. Aggregates only — the RPC
 * never returns finder identities, and neither does anything derived here.
 */
export type TopDrop = {
  dropId: string;
  title: string | null;
  type: string;
  isBusiness: boolean;
  businessName: string | null;
  unlockCount: number;
  uniqueVisitors: number;
  lastUnlockAt: string | null;
};

export type DailyPoint = { day: string; visits: number };

export type Audience = {
  peakHour: number | null;
  /** Visits per weekday, index 0 = Monday … 6 = Sunday (Asia/Dhaka local time). */
  weekday: number[];
  newVisitors: number;
  returningVisitors: number;
  /** What these visitors also find (drop types, top 5) — aggregates only. */
  interests: { type: string; visits: number }[];
};

export type Funnel = { shown: number; opened: number; verified: number };

export type BusinessInsights = {
  days: number;
  totalVisits: number;
  uniqueVisitors: number;
  topDrops: TopDrop[];
  daily: DailyPoint[];
  /** null until there are at least 3 distinct visitors (small-group privacy). */
  audience: Audience | null;
  funnel: Funnel;
};

export type BusinessBrief = { summary: string; tips: string[]; bestTime?: string };

const n = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;

/** Defensive parse of the RPC jsonb. Returns null when the shape is unusable. */
export function parseInsights(raw: unknown): BusinessInsights | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const topRaw = Array.isArray(o.top_drops) ? o.top_drops : [];
  const dailyRaw = Array.isArray(o.daily) ? o.daily : [];
  const topDrops: TopDrop[] = [];
  for (const t of topRaw) {
    const r = t as Record<string, unknown>;
    if (typeof r?.drop_id !== 'string') continue;
    topDrops.push({
      dropId: r.drop_id,
      title: typeof r.title === 'string' ? r.title : null,
      type: typeof r.type === 'string' ? r.type : 'memory',
      isBusiness: r.is_business === true,
      businessName: typeof r.business_name === 'string' ? r.business_name : null,
      unlockCount: n(r.unlock_count),
      uniqueVisitors: n(r.unique_visitors),
      lastUnlockAt: typeof r.last_unlock_at === 'string' ? r.last_unlock_at : null,
    });
  }
  const daily: DailyPoint[] = [];
  for (const d of dailyRaw) {
    const r = d as Record<string, unknown>;
    if (typeof r?.day === 'string') daily.push({ day: r.day, visits: n(r.visits) });
  }
  const a = o.audience && typeof o.audience === 'object' ? (o.audience as Record<string, unknown>) : null;
  const audience: Audience | null = a
    ? {
        peakHour: typeof a.peak_hour === 'number' && a.peak_hour >= 0 && a.peak_hour <= 23 ? Math.round(a.peak_hour) : null,
        weekday: (Array.isArray(a.weekday) ? a.weekday : []).slice(0, 7).map(n),
        newVisitors: n(a.new_visitors),
        returningVisitors: n(a.returning_visitors),
        interests: (Array.isArray(a.top_visitor_types) ? a.top_visitor_types : [])
          .map((t) => t as Record<string, unknown>)
          .filter((t) => typeof t?.type === 'string')
          .map((t) => ({ type: t.type as string, visits: n(t.visits) }))
          .slice(0, 5),
      }
    : null;
  const f = o.funnel && typeof o.funnel === 'object' ? (o.funnel as Record<string, unknown>) : {};
  return {
    days: Math.max(1, n(o.days) || 7),
    totalVisits: n(o.total_visits),
    uniqueVisitors: n(o.unique_visitors),
    topDrops,
    daily,
    audience,
    funnel: { shown: n(f.shown), opened: n(f.opened), verified: n(f.verified) },
  };
}

/** Verified visits as a share of suggestions, 0–100 (0 when nothing was shown). */
export function conversionPct(f: Funnel): number {
  return f.shown > 0 ? Math.min(100, Math.round((f.verified / f.shown) * 100)) : 0;
}

/** Share of visitors who came back to a second drop of yours, 0–100. */
export function returningPct(a: Audience): number {
  const t = a.newVisitors + a.returningVisitors;
  return t > 0 ? Math.round((a.returningVisitors / t) * 100) : 0;
}

const WEEKDAYS = {
  en: ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'],
  bn: ['সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার', 'রবিবার'],
};

/** "7 PM" / "সন্ধ্যা ৭টা" style hour label. */
export function hourLabel(h: number, locale: 'en' | 'bn'): string {
  if (locale === 'bn') {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const part = h < 5 ? 'রাত' : h < 12 ? 'সকাল' : h < 16 ? 'দুপুর' : h < 18 ? 'বিকেল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
    return `${part} ${h12.toLocaleString('bn-BD')}টা`;
  }
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Index of the busiest weekday (ties → earliest), or -1 with no data. */
export function peakWeekday(a: Audience): number {
  let best = -1;
  let max = 0;
  a.weekday.forEach((v, i) => {
    if (v > max) {
      max = v;
      best = i;
    }
  });
  return best;
}

const EN_DAY_STEMS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * Model-written best-time lines are only trusted when they agree with the data:
 * Bangla must be free of stray Latin words; English must name the busiest weekday
 * (or the hour) and any number it uses must be the peak hour (12h or 24h clock).
 * Otherwise the app shows the deterministic line instead.
 */
export function acceptBestTime(text: string | undefined, a: Audience | null, locale: 'en' | 'bn'): string | undefined {
  if (!text || !a || a.peakHour === null) return undefined;
  if (locale === 'bn') return /[A-Za-z]/.test(text) ? undefined : text;
  const lower = text.toLowerCase();
  const nums = (lower.match(/\d{1,2}/g) ?? []).map(Number);
  const h12 = a.peakHour % 12 === 0 ? 12 : a.peakHour % 12;
  const hourOk = nums.length === 0 || nums.some((n) => n === h12 || n === a.peakHour);
  const wd = peakWeekday(a);
  const dayOk = wd < 0 || lower.includes(EN_DAY_STEMS[wd]);
  return hourOk && dayOk ? text : undefined;
}

/** Deterministic "best time to post an offer" from peak hour + busiest weekday. */
export function bestTimeLine(a: Audience | null, locale: 'en' | 'bn'): string | null {
  if (!a || a.peakHour === null) return null;
  const wd = peakWeekday(a);
  const day = wd >= 0 ? WEEKDAYS[locale][wd] : null;
  const earlier = hourLabel((a.peakHour + 23) % 24, locale);
  if (locale === 'bn') {
    return day ? `${day}, ${earlier}-এর আগে` : `${earlier}-এর আগে`;
  }
  return day ? `${day}, shortly before ${hourLabel(a.peakHour, locale)}` : `Shortly before ${hourLabel(a.peakHour, locale)}`;
}

export async function fetchBusinessInsights(days = 7): Promise<BusinessInsights | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('get_my_business_insights', { p_days: days });
  if (error) throw error;
  return parseInsights(data);
}

/** Bar heights in 0..maxPx; a non-zero day always gets at least `minPx`. */
export function barHeights(daily: DailyPoint[], maxPx = 80, minPx = 4): number[] {
  const max = Math.max(0, ...daily.map((d) => d.visits));
  if (max === 0) return daily.map(() => 0);
  return daily.map((d) => (d.visits === 0 ? 0 : Math.max(minPx, Math.round((d.visits / max) * maxPx))));
}

/** The only thing sent to the model: counts, no titles, names or ids. */
export function toAggregates(i: BusinessInsights): {
  days: number;
  total_visits: number;
  unique_visitors: number;
  daily: number[];
  top_types: { type: string; visits: number }[];
  audience?: {
    peak_hour: number | null;
    weekday: number[];
    new_visitors: number;
    returning_visitors: number;
    interests: { type: string; visits: number }[];
  };
  funnel?: { shown: number; opened: number; verified: number };
} {
  const byType = new Map<string, number>();
  for (const d of i.topDrops) byType.set(d.type, (byType.get(d.type) ?? 0) + d.unlockCount);
  return {
    days: i.days,
    total_visits: i.totalVisits,
    unique_visitors: i.uniqueVisitors,
    daily: i.daily.map((d) => d.visits),
    ...(i.audience
      ? {
          audience: {
            peak_hour: i.audience.peakHour,
            weekday: i.audience.weekday,
            new_visitors: i.audience.newVisitors,
            returning_visitors: i.audience.returningVisitors,
            interests: i.audience.interests,
          },
        }
      : {}),
    ...(i.funnel.shown + i.funnel.opened + i.funnel.verified > 0 ? { funnel: i.funnel } : {}),
    top_types: [...byType.entries()]
      .map(([type, visits]) => ({ type, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 5),
  };
}

const COORD_RE = /-?\d{1,3}\.\d{3,}/;
function cleanText(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const line = s.replace(/\s+/g, ' ').trim();
  if (!line || line.length > max || COORD_RE.test(line)) return null;
  return line;
}

/** Validate a model brief: a summary and exactly three tips, or null. */
export function sanitizeBrief(raw: unknown): BusinessBrief | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const summary = cleanText(o.summary, 320);
  const tips = (Array.isArray(o.tips) ? o.tips : [])
    .map((t) => cleanText(t, 180))
    .filter((t): t is string => t !== null)
    .slice(0, 3);
  if (!summary || tips.length < 3) return null;
  const bestTime = cleanText(o.best_time, 200) ?? undefined;
  return { summary, tips, ...(bestTime ? { bestTime } : {}) };
}

const bnNum = (n: number): string => n.toLocaleString('bn-BD');

/** Weekday name for an ISO date (YYYY-MM-DD). */
function dayName(iso: string, locale: 'en' | 'bn'): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'long' });
}

/** Deterministic template used when the model is unreachable. */
export function localBrief(i: BusinessInsights, locale: 'en' | 'bn'): BusinessBrief {
  const withTime = (b: BusinessBrief): BusinessBrief => {
    const bt = bestTimeLine(i.audience, locale);
    return bt ? { ...b, bestTime: bt } : b;
  };
  const bn = locale === 'bn';
  if (i.totalVisits === 0) {
    return withTime(bn
      ? {
          summary: `গত ${bnNum(i.days)} দিনে এখনো কোনো যাচাই করা ভিজিট নেই।`,
          tips: [
            'তোমার বিজনেস ড্রপটি দোকানের সামনে বা কাছের জায়গায় রাখো।',
            'দোকানে একটি ছোট চিহ্ন লাগাও, যেন মানুষ খুঁজতে আসে।',
            'একটি ছোট পুরস্কারের ইঙ্গিত দাও, যাতে কৌতূহল বাড়ে।',
          ],
        }
      : {
          summary: `No verified visits in the last ${i.days} days yet.`,
          tips: [
            'Place your Business drop right outside your shop or a nearby landmark.',
            'Put a small sign in the shop so people know to look for it.',
            'Hint at a small reward inside to spark curiosity.',
          ],
        });
  }
  const peak = i.daily.reduce<DailyPoint | null>((b, d) => (!b || d.visits > b.visits ? d : b), null);
  const repeat = i.totalVisits > i.uniqueVisitors;
  return withTime(bn
    ? {
        summary: `গত ${bnNum(i.days)} দিনে ${bnNum(i.totalVisits)}টি যাচাই করা ভিজিট এসেছে, ${bnNum(i.uniqueVisitors)} জন আলাদা ভিজিটর।`,
        tips: [
          peak && peak.visits > 0
            ? `সবচেয়ে ব্যস্ত দিন ছিল ${dayName(peak.day, 'bn')} (${bnNum(peak.visits)}টি ভিজিট)। সেদিন একটি বিশেষ ইঙ্গিত দিয়ে দেখো।`
            : 'ব্যস্ত দিনগুলোতে একটি বিশেষ ইঙ্গিত দিয়ে দেখো।',
          repeat
            ? 'কিছু ভিজিটর একাধিক ড্রপে এসেছে — একটি ট্রেইল বানিয়ে তাদের ধরে রাখো।'
            : 'নতুন ভিজিটর টানতে আরেকটি কাছের ড্রপ রাখো।',
          'সেরা ড্রপের পাশে আরেকটি ড্রপ রেখে ভিজিট বাড়াও।',
        ],
      }
    : {
        summary: `${i.totalVisits} verified visit${i.totalVisits === 1 ? '' : 's'} in the last ${i.days} days from ${i.uniqueVisitors} unique visitor${i.uniqueVisitors === 1 ? '' : 's'}.`,
        tips: [
          peak && peak.visits > 0
            ? `Your busiest day was ${dayName(peak.day, 'en')} (${peak.visits} visits) — try a special hint that day.`
            : 'Try a special hint on your busiest days.',
          repeat
            ? 'Some visitors came back — chain your Drops into a trail to keep them walking.'
            : 'Add another Drop nearby to bring in new visitors.',
          'Place a second Drop near your top performer to pull more footfall.',
        ],
      });
}
