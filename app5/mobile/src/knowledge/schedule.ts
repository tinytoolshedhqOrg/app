import { isCivilDate } from './localDate';

export type DailyTipRecord = {
  order: string[];
  index: number;
  shownOn: string;
};

function sameIds(order: string[], ids: readonly string[]): boolean {
  if (order.length !== ids.length) return false;
  const expected = new Set(ids);
  if (expected.size !== ids.length) return false;
  const seen = new Set<string>();
  for (const id of order) {
    if (!expected.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return seen.size === ids.length;
}

export function isDailyTipRecord(value: unknown, ids: readonly string[]): value is DailyTipRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<DailyTipRecord>;
  if (!Array.isArray(record.order) || !record.order.every((id) => typeof id === 'string')) return false;
  if (!sameIds(record.order, ids)) return false;
  if (typeof record.index !== 'number' || !Number.isInteger(record.index)) return false;
  if (record.index < 0 || record.index >= record.order.length) return false;
  return typeof record.shownOn === 'string' && isCivilDate(record.shownOn);
}

export function shuffleIds(ids: readonly string[], random: () => number, avoidFirst?: string): string[] {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = next[i];
    next[i] = next[j];
    next[j] = swap;
  }
  if (avoidFirst && next.length > 1 && next[0] === avoidFirst) {
    const swap = next[0];
    next[0] = next[1];
    next[1] = swap;
  }
  return next;
}

function pruneRemovedTips(
  stored: DailyTipRecord | null,
  today: string,
  ids: readonly string[],
  random: () => number,
): DailyTipRecord | null {
  if (!stored || !Array.isArray(stored.order) || !isDailyTipRecord(stored, stored.order)) return null;
  const allowed = new Set(ids);
  const order = stored.order.filter((id) => allowed.has(id));
  if (order.length === 0 || !sameIds(order, ids)) return null;

  const index = stored.order.slice(0, stored.index).filter((id) => allowed.has(id)).length;
  if (allowed.has(stored.order[stored.index])) return { ...stored, order, index };

  const shownOn = today > stored.shownOn ? today : stored.shownOn;
  if (index < order.length) return { order, index, shownOn };
  return { order: shuffleIds(ids, random, order[index - 1]), index: 0, shownOn };
}

/**
 * One tip per local civil day on which the completed-workout card is shown.
 * A later day advances exactly one step, including after several absent days.
 * The same day, and a clock set backwards, keep the current tip.
 * The next day after the last tip of a cycle starts a new shuffle whose first id
 * is not the previous cycle's last id.
 */
export function presentDailyTip(
  stored: DailyTipRecord | null,
  today: string,
  ids: readonly string[],
  random: () => number = Math.random,
): DailyTipRecord {
  if (!isCivilDate(today)) throw new Error('today must be a civil date');
  if (!isDailyTipRecord(stored, ids)) {
    const pruned = pruneRemovedTips(stored, today, ids, random);
    if (!pruned) return { order: shuffleIds(ids, random), index: 0, shownOn: today };
    stored = pruned;
  }
  if (stored.shownOn >= today) return stored;
  if (stored.index < stored.order.length - 1) {
    return { order: stored.order, index: stored.index + 1, shownOn: today };
  }
  const lastShown = stored.order[stored.index];
  return { order: shuffleIds(ids, random, lastShown), index: 0, shownOn: today };
}
