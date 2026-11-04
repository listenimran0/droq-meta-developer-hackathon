import {
  __clearNarratorCache,
  distanceBucket,
  fetchClueAssist,
  fetchFoundCard,
  fetchQuestPlan,
  fetchFoundLine,
  fetchHuntHint,
  fetchSenseReason,
  sanitizeNarratorText,
  wasLastNarratorDegraded,
} from '../services/aiNarrator';

const invokeMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

beforeEach(() => {
  invokeMock.mockReset();
  __clearNarratorCache();
});

describe('sanitizeNarratorText', () => {
  it('accepts clean copy', () => {
    expect(sanitizeNarratorText('A friend left this for the brave.')).toBe(
      'A friend left this for the brave.',
    );
  });

  it('rejects non-strings, empties, overlong text, and coordinates', () => {
    expect(sanitizeNarratorText(null)).toBeNull();
    expect(sanitizeNarratorText(42)).toBeNull();
    expect(sanitizeNarratorText('   ')).toBeNull();
    expect(sanitizeNarratorText('x'.repeat(141))).toBeNull();
    expect(sanitizeNarratorText('Meet at 23.7806, 90.4070 tonight')).toBeNull();
    expect(sanitizeNarratorText('Walk 150.500 meters north')).toBeNull();
  });
});

describe('distanceBucket', () => {
  it('buckets proximity without exposing exact meters', () => {
    expect(distanceBucket(20)).toBe('<100');
    expect(distanceBucket(400)).toBe('100-400');
    expect(distanceBucket(900)).toBe('400+');
    expect(distanceBucket(NaN)).toBe('400+');
  });
});

describe('fetchSenseReason', () => {
  const input = {
    dropId: 'd1',
    dropType: 'voice' as const,
    distanceM: 80,
    isSocial: false,
    themeMatch: true,
    locale: 'en' as const,
  };

  it('returns sanitized model text and caches per drop', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, fallback: false, text: 'Close — go listen.' },
      error: null,
    });
    await expect(fetchSenseReason(input)).resolves.toBe('Close — go listen.');
    await expect(fetchSenseReason(input)).resolves.toBe('Close — go listen.');
    expect(invokeMock).toHaveBeenCalledTimes(1);
    // Metadata only — never coordinates or content in the request
    const body = invokeMock.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(['action', 'drop_id', 'drop_type', 'locale', 'context']),
    );
    expect(JSON.stringify(body)).not.toMatch(/23\.78|90\.40/);
  });

  it('falls back to null on model failure or tainted text', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('down') });
    await expect(
      fetchSenseReason({ ...input, dropId: 'd2' }),
    ).resolves.toBeNull();

    invokeMock.mockResolvedValue({
      data: { ok: true, fallback: false, text: 'at 23.780600, come now' },
      error: null,
    });
    await expect(
      fetchSenseReason({ ...input, dropId: 'd3' }),
    ).resolves.toBeNull();
  });
});

describe('fetchHuntHint', () => {
  const input = {
    dropId: 'h1',
    dropType: 'memory' as const,
    level: 1,
    locale: 'en' as const,
  };

  it('caches per drop+level and sends hint_level metadata only', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, fallback: false, text: 'Warmer than your doubts.' },
      error: null,
    });
    await expect(fetchHuntHint(input)).resolves.toBe('Warmer than your doubts.');
    await expect(fetchHuntHint(input)).resolves.toBe('Warmer than your doubts.');
    await expect(fetchHuntHint({ ...input, level: 2 })).resolves.toBe(
      'Warmer than your doubts.',
    );
    expect(invokeMock).toHaveBeenCalledTimes(2);
    const body = invokeMock.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body.action).toBe('hunt_hint');
    expect(body.context).toEqual({ hint_level: 1 });
    expect(JSON.stringify(body)).not.toMatch(/23\.78|90\.40/);
  });

  it('clamps levels to 1-4 and returns null on failure', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, fallback: false, text: 'Level one.' },
      error: null,
    });
    await expect(fetchHuntHint({ ...input, level: 99 })).resolves.toBe('Level one.');
    const body = invokeMock.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body.context).toEqual({ hint_level: 4 });

    invokeMock.mockResolvedValue({ data: { ok: true, fallback: true }, error: null });
    await expect(fetchHuntHint({ ...input, dropId: 'h2' })).resolves.toBeNull();
  });
});
describe('fetchFoundLine', () => {
  it('requests the epilogue action and caches per drop', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, fallback: false, text: 'You showed up. That counts.' },
      error: null,
    });
    const input = { dropId: 'f1', dropType: 'memory' as const, locale: 'en' as const };
    await expect(fetchFoundLine(input)).resolves.toBe('You showed up. That counts.');
    await expect(fetchFoundLine(input)).resolves.toBe('You showed up. That counts.');
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const body = invokeMock.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body.action).toBe('found_epilogue');
    expect(JSON.stringify(body)).not.toMatch(/23\.78|90\.40/);
  });

  it('returns null when the model falls back', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, fallback: true }, error: null });
    await expect(
      fetchFoundLine({ dropId: 'f2', dropType: 'memory', locale: 'bn' }),
    ).resolves.toBeNull();
  });
});

describe('fetchClueAssist', () => {
  it('returns bounded options plus a normalized safety verdict', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        fallback: false,
        options: ['First clue', 'Second clue', 'x'.repeat(500)],
        safety: { verdict: 'risky', note: 'Near a road — be careful.' },
      },
      error: null,
    });
    const res = await fetchClueAssist({
      draft: 'something about the rain',
      dropType: 'memory',
      locale: 'en',
    });
    expect(res?.options).toEqual(['First clue', 'Second clue']);
    expect(res?.safety.verdict).toBe('risky');
  });

  it('rejects short drafts locally and normalizes unknown verdicts', async () => {
    await expect(
      fetchClueAssist({ draft: 'x', dropType: 'memory', locale: 'en' }),
    ).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();

    invokeMock.mockResolvedValue({
      data: { ok: true, fallback: false, options: [], safety: { verdict: 'weird' } },
      error: null,
    });
    const res = await fetchClueAssist({
      draft: 'a real draft here',
      dropType: 'memory',
      locale: 'en',
    });
    expect(res?.safety.verdict).toBe('ok');
  });
});

describe('fetchQuestPlan', () => {
  const signals = [
    { id: 'a', type: 'memory', visibility: 'public', distanceM: 123, ageHours: 1, themeMatch: false, isSocial: false },
  ] as never;
  it('sends metadata only (rounded distance, no coords) and validates the plan', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, fallback: false, quest: { title: 'Dusk', steps: [{ drop_id: 'a', teaser: 'Go.' }, { drop_id: 'fake', teaser: 'x' }], minutes: 2 }, trace: ['get_context'] },
      error: null,
    });
    const q = await fetchQuestPlan({ signals, intent: 'calm', minutes: 30, locale: 'en' });
    const body = invokeMock.mock.calls[0]![1].body;
    expect(body.candidates).toEqual([{ id: 'a', type: 'memory', distance_m: 120, is_social: false }]);
    expect(JSON.stringify(body)).not.toMatch(/latitude|longitude/);
    expect(q?.steps.map((s) => s.dropId)).toEqual(['a']);
    expect(q?.ai).toBe(true);
  });
  it('returns null on fallback', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, fallback: true, error: 'model_timeout' }, error: null });
    expect(await fetchQuestPlan({ signals, intent: '', minutes: 15, locale: 'bn' })).toBeNull();
  });
});

describe('fetchFoundCard', () => {
  it('builds a data URI from b64, caches per drop, rejects junk', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, fallback: false, image: { b64: 'aGVsbG8=' } }, error: null });
    const a = await fetchFoundCard({ dropId: 'd1', dropType: 'photo', locale: 'en' });
    expect(a).toBe('data:image/png;base64,aGVsbG8=');
    await fetchFoundCard({ dropId: 'd1', dropType: 'photo', locale: 'en' });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    invokeMock.mockResolvedValue({ data: { ok: true, fallback: false, image: { b64: '<script>' } }, error: null });
    expect(await fetchFoundCard({ dropId: 'd2', dropType: 'photo', locale: 'en' })).toBeNull();
  });
});

describe('degraded flag reaches the client', () => {
  it('is true when the server marks the response degraded, and resets after a healthy one', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, fallback: true, degraded: true, error: 'circuit_open' },
      error: null,
    });
    await fetchFoundLine({ dropId: 'd1', dropType: 'memory', locale: 'en' });
    expect(wasLastNarratorDegraded()).toBe(true);
    invokeMock.mockResolvedValueOnce({ data: { ok: true, fallback: false, text: 'Lovely find today.' }, error: null });
    await fetchFoundLine({ dropId: 'd2', dropType: 'memory', locale: 'en' });
    expect(wasLastNarratorDegraded()).toBe(false);
  });
});
