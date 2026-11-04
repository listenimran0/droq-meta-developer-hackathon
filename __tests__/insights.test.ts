import {
  acceptBestTime,
  barHeights,
  bestTimeLine,
  conversionPct,
  hourLabel,
  localBrief,
  returningPct,
  parseInsights,
  sanitizeBrief,
  toAggregates,
  type BusinessInsights,
} from '../services/insights';

jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));

const sample: BusinessInsights = {
  days: 7,
  totalVisits: 9,
  uniqueVisitors: 6,
  topDrops: [
    { dropId: 'a', title: 'Secret Chai Spot', type: 'memory', isBusiness: true, businessName: 'Chai Co', unlockCount: 5, uniqueVisitors: 4, lastUnlockAt: null },
    { dropId: 'b', title: null, type: 'memory', isBusiness: true, businessName: 'Chai Co', unlockCount: 2, uniqueVisitors: 2, lastUnlockAt: null },
    { dropId: 'c', title: null, type: 'photo', isBusiness: false, businessName: null, unlockCount: 2, uniqueVisitors: 2, lastUnlockAt: null },
  ],
  daily: [0, 1, 0, 4, 2, 0, 2].map((visits, i) => ({ day: `2026-11-0${i + 1}`, visits })),
  audience: {
    peakHour: 19,
    weekday: [1, 0, 2, 0, 3, 5, 1],
    newVisitors: 2,
    returningVisitors: 4,
    interests: [{ type: 'memory', visits: 7 }],
  },
  funnel: { shown: 20, opened: 12, verified: 9 },
};

describe('parseInsights', () => {
  it('parses the RPC shape and drops junk rows', () => {
    const r = parseInsights({
      days: 7,
      total_visits: 3,
      unique_visitors: 2,
      top_drops: [{ drop_id: 'x', unlock_count: 3, unique_visitors: 2, type: 'memory' }, { nope: 1 }],
      daily: [{ day: '2026-11-01', visits: 3 }, { visits: 9 }],
    });
    expect(r?.totalVisits).toBe(3);
    expect(r?.topDrops).toHaveLength(1);
    expect(r?.daily).toHaveLength(1);
  });
  it('rejects non-objects and clamps bad numbers', () => {
    expect(parseInsights(null)).toBeNull();
    expect(parseInsights('x')).toBeNull();
    expect(parseInsights({ total_visits: -5, unique_visitors: 'a' })?.totalVisits).toBe(0);
  });
});

describe('barHeights', () => {
  it('scales to the max and keeps non-zero days visible', () => {
    const h = barHeights(sample.daily, 80, 4);
    expect(h[3]).toBe(80);
    expect(h[0]).toBe(0);
    expect(h[1]).toBeGreaterThanOrEqual(4);
  });
  it('is all zero when there are no visits', () => {
    expect(barHeights([{ day: 'd', visits: 0 }])).toEqual([0]);
  });
});

describe('toAggregates', () => {
  it('sends counts only — no ids, titles or names', () => {
    const agg = toAggregates(sample);
    const text = JSON.stringify(agg);
    expect(text).not.toMatch(/Chai|Secret|"a"|"b"/);
    expect(agg.top_types).toEqual([
      { type: 'memory', visits: 7 },
      { type: 'photo', visits: 2 },
    ]);
    expect(agg.daily).toHaveLength(7);
  });
});

describe('sanitizeBrief', () => {
  it('accepts a summary with 3 tips', () => {
    expect(sanitizeBrief({ summary: 'Good week.', tips: ['a', 'b', 'c', 'd'] })?.tips).toEqual(['a', 'b', 'c']);
  });
  it('rejects too few tips, coordinates, and non-objects', () => {
    expect(sanitizeBrief({ summary: 'x', tips: ['a', 'b'] })).toBeNull();
    expect(sanitizeBrief({ summary: 'at 23.78072 north', tips: ['a', 'b', 'c'] })).toBeNull();
    expect(sanitizeBrief(null)).toBeNull();
  });
});

describe('localBrief', () => {
  it('has 3 tips in en and bn, with and without visits', () => {
    for (const locale of ['en', 'bn'] as const) {
      expect(localBrief(sample, locale).tips).toHaveLength(3);
      expect(localBrief({ ...sample, totalVisits: 0, uniqueVisitors: 0, topDrops: [], daily: [] }, locale).tips).toHaveLength(3);
    }
  });
  it('mentions the real counts', () => {
    expect(localBrief(sample, 'en').summary).toContain('9 verified visits');
  });
});

describe('audience + funnel parsing', () => {
  const raw = {
    days: 14, total_visits: 32, unique_visitors: 16, top_drops: [], daily: [],
    audience: { peak_hour: 19, weekday: [2, 4, 6, 1, 8, 9, 2], new_visitors: 5, returning_visitors: 11, top_visitor_types: [{ type: 'memory', visits: 11 }] },
    funnel: { shown: 56, opened: 32, verified: 25 },
  };
  it('parses the new RPC fields', () => {
    const r = parseInsights(raw)!;
    expect(r.audience?.peakHour).toBe(19);
    expect(r.audience?.weekday).toHaveLength(7);
    expect(r.audience?.interests[0]).toEqual({ type: 'memory', visits: 11 });
    expect(r.funnel).toEqual({ shown: 56, opened: 32, verified: 25 });
  });
  it('audience is null when the server suppressed it, funnel defaults to zeros', () => {
    const r = parseInsights({ ...raw, audience: null, funnel: undefined })!;
    expect(r.audience).toBeNull();
    expect(r.funnel).toEqual({ shown: 0, opened: 0, verified: 0 });
  });
  it('rejects an out-of-range peak hour', () => {
    expect(parseInsights({ ...raw, audience: { ...raw.audience, peak_hour: 99 } })!.audience?.peakHour).toBeNull();
  });
});

describe('conversion, returning share, best time', () => {
  it('conversionPct = verified / shown, safe at zero and capped', () => {
    expect(conversionPct({ shown: 56, opened: 32, verified: 25 })).toBe(45);
    expect(conversionPct({ shown: 0, opened: 0, verified: 4 })).toBe(0);
    expect(conversionPct({ shown: 2, opened: 2, verified: 9 })).toBe(100);
  });
  it('returningPct', () => {
    expect(returningPct(sample.audience!)).toBe(67);
    expect(returningPct({ ...sample.audience!, newVisitors: 0, returningVisitors: 0 })).toBe(0);
  });
  it('hourLabel en and bn', () => {
    expect(hourLabel(19, 'en')).toBe('7 PM');
    expect(hourLabel(0, 'en')).toBe('12 AM');
    expect(hourLabel(12, 'en')).toBe('12 PM');
    expect(hourLabel(19, 'bn')).toContain('টা');
  });
  it('bestTimeLine names the busiest weekday and the peak hour', () => {
    expect(bestTimeLine(sample.audience!, 'en')).toBe('Saturdays, shortly before 7 PM');
    expect(bestTimeLine(sample.audience!, 'bn')).toContain('শনিবার');
    expect(bestTimeLine(null, 'en')).toBeNull();
    expect(bestTimeLine({ ...sample.audience!, peakHour: null }, 'en')).toBeNull();
  });
  it('localBrief carries the best time; aggregates carry audience and funnel, never identities', () => {
    expect(localBrief(sample, 'en').bestTime).toBe('Saturdays, shortly before 7 PM');
    const agg = toAggregates(sample);
    expect(agg.audience?.peak_hour).toBe(19);
    expect(agg.funnel).toEqual({ shown: 20, opened: 12, verified: 9 });
    expect(JSON.stringify(agg)).not.toMatch(/Chai|Secret|"a"|user/);
  });
  it('sanitizeBrief keeps a clean best_time and drops a coordinate-looking one', () => {
    const ok = sanitizeBrief({ summary: 'x', tips: ['a', 'b', 'c'], best_time: 'Fridays around 7 PM' });
    expect(ok?.bestTime).toBe('Fridays around 7 PM');
    expect(sanitizeBrief({ summary: 'x', tips: ['a', 'b', 'c'], best_time: 'at 23.78072' })?.bestTime).toBeUndefined();
  });
});

describe('acceptBestTime', () => {
  const a = sample.audience!; // peak 19h, busiest weekday = Saturday
  it('accepts a line that names the busiest weekday and the peak hour', () => {
    expect(acceptBestTime('Saturday around 7pm, when your audience wanders most.', a, 'en')).toBeDefined();
    expect(acceptBestTime('Saturdays near 19:00', a, 'en')).toBeDefined();
  });
  it('rejects a wrong weekday or a wrong hour', () => {
    expect(acceptBestTime('Monday around 7pm', a, 'en')).toBeUndefined();
    expect(acceptBestTime('Saturday around 3pm', a, 'en')).toBeUndefined();
  });
  it('rejects Bangla with stray Latin words, accepts clean Bangla', () => {
    expect(acceptBestTime('6 দিনের ছন্দে Saturday দিনে 19 ঘণ্টার around পোস্ট করুন।', a, 'bn')).toBeUndefined();
    expect(acceptBestTime('শনিবার সন্ধ্যা ৭টার আগে অফার পোস্ট করুন।', a, 'bn')).toBeDefined();
  });
  it('returns undefined without data', () => {
    expect(acceptBestTime('Saturday 7pm', null, 'en')).toBeUndefined();
    expect(acceptBestTime(undefined, a, 'en')).toBeUndefined();
  });
});
