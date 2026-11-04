import type { DropType } from '@/types/drop';
import type { SenseSignal, PartOfDay } from './sense';
import { scoreFit, type Mood, type WhyKey } from './matching';

/**
 * Quest — a short multi-stop walk planned from nearby candidates.
 * Remote plans come from the Muse tool-calling agent (ai-narrator `quest_plan`)
 * and are untrusted: `resolveRemoteQuest` keeps only ids that exist in the
 * live candidate set. `planQuestLocal` is the deterministic fallback so the
 * feature always works offline or when the model is down.
 */

export type QuestStep = {
  dropId: string;
  type: DropType;
  walkMinutes: number;
  teaser?: string;
  /** Paid placement: server-verified Business drop (at most one per quest). */
  sponsored?: boolean;
  business?: string;
  /** Short "why this fits you" — model text (remote) or an i18n key (local). */
  why?: string;
  whyKey?: WhyKey;
};

export type Quest = {
  title?: string;
  steps: QuestStep[];
  /** Walking minutes to the farthest stop (distances are from the walker). */
  minutes: number;
  ai: boolean;
  /** Tool names the agent called, in order (empty for the local plan). */
  trace: string[];
};

export const MAX_QUEST_STEPS = 3;

export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round((Number.isFinite(meters) ? meters : 0) / 80));
}

export type PlanOptions = { mood?: Mood; partOfDay?: PartOfDay; recentTypes?: SenseSignal['type'][] };

export function planQuestLocal(
  signals: SenseSignal[],
  minutes: number,
  opts: PlanOptions = {},
): Quest | null {
  const usable = (Array.isArray(signals) ? signals : [])
    .filter((s) => Number.isFinite(s.distanceM) && s.distanceM >= 0)
    .sort((a, b) => a.distanceM - b.distanceM);
  if (usable.length === 0) return null;
  const budget = Math.max(5, minutes);
  const inBudget = usable.filter((s) => walkMinutes(s.distanceM) <= budget);
  const pool = inBudget.length > 0 ? inBudget : usable.slice(0, 1);
  const steps: QuestStep[] = [];
  const types = new Set<DropType>();
  // Prefer variety first, then fill with the nearest remaining.
  for (const s of pool) {
    if (steps.length >= MAX_QUEST_STEPS) break;
    if (types.has(s.type)) continue;
    types.add(s.type);
    steps.push({ dropId: s.id, type: s.type, walkMinutes: walkMinutes(s.distanceM) });
  }
  for (const s of pool) {
    if (steps.length >= MAX_QUEST_STEPS) break;
    if (steps.some((x) => x.dropId === s.id)) continue;
    steps.push({ dropId: s.id, type: s.type, walkMinutes: walkMinutes(s.distanceM) });
  }
  if (opts.mood && opts.partOfDay) {
    // Mood/time aware: rank the in-budget pool by fit, keep variety, best first.
    const ranked = pool
      .map((s) => ({ s, fit: scoreFit({ type: s.type, walkMinutes: walkMinutes(s.distanceM), mood: opts.mood!, part: opts.partOfDay!, recentTypes: opts.recentTypes }) }))
      .sort((a, b) => b.fit.score - a.fit.score || a.s.distanceM - b.s.distanceM);
    const picked: typeof ranked = [];
    for (const r of ranked) {
      if (picked.length >= MAX_QUEST_STEPS) break;
      if (picked.some((p) => p.s.type === r.s.type)) continue;
      picked.push(r);
    }
    for (const r of ranked) {
      if (picked.length >= MAX_QUEST_STEPS) break;
      if (!picked.includes(r)) picked.push(r);
    }
    const ordered = picked.sort((a, b) => a.s.distanceM - b.s.distanceM);
    const withWhy: QuestStep[] = ordered.map((r) => ({
      dropId: r.s.id,
      type: r.s.type,
      walkMinutes: walkMinutes(r.s.distanceM),
      whyKey: r.fit.whyKey,
    }));
    return { steps: withWhy, minutes: Math.max(...withWhy.map((s) => s.walkMinutes)), ai: false, trace: [] };
  }
  return {
    steps,
    minutes: Math.max(...steps.map((s) => s.walkMinutes)),
    ai: false,
    trace: [],
  };
}

export type RemoteQuest = {
  title: string;
  steps: { drop_id: string; teaser: string; sponsored?: boolean; business?: string; why?: string }[];
  minutes: number;
  trace: string[];
};

export function resolveRemoteQuest(raw: unknown, signals: SenseSignal[]): Quest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RemoteQuest>;
  if (typeof r.title !== 'string' || !Array.isArray(r.steps)) return null;
  const byId = new Map(signals.map((s) => [s.id, s]));
  const used = new Set<string>();
  const steps: QuestStep[] = [];
  for (const st of r.steps.slice(0, 10)) {
    if (steps.length >= MAX_QUEST_STEPS) break;
    const sig = st && typeof st.drop_id === 'string' ? byId.get(st.drop_id) : undefined;
    if (!sig || used.has(sig.id)) continue;
    // At most one sponsored stop, regardless of what the wire says.
    const sponsored = st.sponsored === true && !steps.some((x) => x.sponsored);
    used.add(sig.id);
    steps.push({
      dropId: sig.id,
      type: sig.type,
      walkMinutes: walkMinutes(sig.distanceM),
      teaser: typeof st.teaser === 'string' ? st.teaser : undefined,
      why: typeof st.why === 'string' && st.why.trim() ? st.why.trim().slice(0, 100) : undefined,
      ...(sponsored
        ? {
            sponsored: true,
            business:
              typeof st.business === 'string' && st.business.trim()
                ? st.business.trim().slice(0, 60)
                : undefined,
          }
        : {}),
    });
  }
  if (steps.length === 0) return null;
  return {
    title: r.title,
    steps,
    minutes: Math.max(...steps.map((s) => s.walkMinutes)),
    ai: true,
    trace: Array.isArray(r.trace) ? r.trace.filter((x) => typeof x === 'string').slice(0, 8) : [],
  };
}
