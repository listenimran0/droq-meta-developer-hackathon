import { planQuestLocal, resolveRemoteQuest, walkMinutes } from '../services/quest';
import type { SenseSignal } from '../services/sense';

const sig = (id: string, type: SenseSignal['type'], distanceM: number): SenseSignal => ({
  id,
  type,
  visibility: 'public',
  distanceM,
  ageHours: 5,
  themeMatch: false,
  isSocial: false,
});

describe('walkMinutes', () => {
  it('rounds to whole minutes, min 1, tolerates bad input', () => {
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(400)).toBe(5);
    expect(walkMinutes(NaN)).toBe(1);
  });
});

describe('planQuestLocal', () => {
  const signals = [
    sig('a', 'memory', 100),
    sig('b', 'memory', 150),
    sig('c', 'photo', 600),
    sig('d', 'voice', 5000),
  ];
  it('prefers variety, nearest first, within the time budget', () => {
    const q = planQuestLocal(signals, 15)!;
    expect(q.ai).toBe(false);
    expect(q.steps.map((s) => s.dropId)).toEqual(['a', 'c', 'b']);
    expect(q.steps.length).toBeLessThanOrEqual(3);
    expect(q.minutes).toBe(8);
  });
  it('never exceeds the budget unless nothing fits, then offers the nearest one', () => {
    const q = planQuestLocal([sig('x', 'voice', 9000)], 15)!;
    expect(q.steps.map((s) => s.dropId)).toEqual(['x']);
  });
  it('returns null with no candidates', () => {
    expect(planQuestLocal([], 30)).toBeNull();
  });
});

describe('resolveRemoteQuest', () => {
  const signals = [sig('a', 'memory', 100), sig('b', 'photo', 400)];
  it('keeps only real candidate ids, dedupes, caps at 3', () => {
    const q = resolveRemoteQuest(
      {
        title: 'Dusk walk',
        steps: [
          { drop_id: 'a', teaser: 'one' },
          { drop_id: 'a', teaser: 'dup' },
          { drop_id: 'ghost', teaser: 'invented' },
          { drop_id: 'b', teaser: 'two' },
        ],
        trace: ['get_context', 'submit_quest'],
      },
      signals,
    )!;
    expect(q.ai).toBe(true);
    expect(q.steps.map((s) => s.dropId)).toEqual(['a', 'b']);
    expect(q.trace).toEqual(['get_context', 'submit_quest']);
  });
  it('rejects malformed or fully-invented plans', () => {
    expect(resolveRemoteQuest(null, signals)).toBeNull();
    expect(resolveRemoteQuest({ title: 't', steps: 'x' }, signals)).toBeNull();
    expect(
      resolveRemoteQuest({ title: 't', steps: [{ drop_id: 'zzz', teaser: 'x' }] }, signals),
    ).toBeNull();
  });
});

describe('resolveRemoteQuest sponsored stops', () => {
  const sigs = ['a', 'b', 'c'].map((id) => ({
    id, type: 'memory' as const, visibility: 'public' as const,
    distanceM: 200, ageHours: 1, themeMatch: false, isSocial: false,
  }));
  it('keeps at most one sponsored stop even if the wire has more', () => {
    const q = resolveRemoteQuest(
      {
        title: 't',
        minutes: 3,
        trace: ['get_context'],
        steps: [
          { drop_id: 'a', teaser: 'x', sponsored: true, business: 'Chai Co' },
          { drop_id: 'b', teaser: 'y', sponsored: true, business: 'Other' },
          { drop_id: 'c', teaser: 'z' },
        ],
      },
      sigs,
    );
    expect(q?.steps.filter((s) => s.sponsored)).toHaveLength(1);
    expect(q?.steps[0].business).toBe('Chai Co');
    expect(q?.steps[1].sponsored).toBeUndefined();
  });
  it('never invents a sponsored stop from an unknown id', () => {
    const q = resolveRemoteQuest(
      { title: 't', minutes: 1, trace: [], steps: [{ drop_id: 'zzz', teaser: 'x', sponsored: true }] },
      sigs,
    );
    expect(q).toBeNull();
  });
});
