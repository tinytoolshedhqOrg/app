import { activityIdFor } from "./activityGroups";

export type ReplacementExercise = {
  id: string;
  position: string;
  body_regions: readonly string[];
  movement_type: string;
};

/** Same posture first, then the other upright posture, then lying. Display order only. */
export function postureDistance(from: string, to: string): number {
  if (from === to) return 0;
  const upright = from !== "lying" && to !== "lying";
  return upright ? 1 : 2;
}

export function sharesBodyArea(left: readonly string[], right: readonly string[]): boolean {
  return left.some((region) => right.includes(region));
}

export function postureNote(from: string, to: string): string {
  const distance = postureDistance(from, to);
  if (distance === 0) return "同一個活動，姿勢相同";
  if (distance === 1) return "同一個活動，姿勢相近";
  return "同一個活動，另一個姿勢";
}

export function rankReplacements<T extends ReplacementExercise>(
  removed: T,
  pool: readonly T[],
  occupiedIds: ReadonlySet<string>,
): T[] {
  const activity = activityIdFor(removed.id);
  if (!activity) return [];
  const seen = new Set<string>();
  const matches: T[] = [];
  for (const candidate of pool) {
    if (candidate.id === removed.id || occupiedIds.has(candidate.id) || seen.has(candidate.id)) continue;
    if (activityIdFor(candidate.id) !== activity) continue;
    if (candidate.movement_type !== removed.movement_type) continue;
    if (!sharesBodyArea(removed.body_regions, candidate.body_regions)) continue;
    seen.add(candidate.id);
    matches.push(candidate);
  }
  matches.sort((a, b) => {
    const byPosture = postureDistance(removed.position, a.position) - postureDistance(removed.position, b.position);
    if (byPosture !== 0) return byPosture;
    return a.id.localeCompare(b.id);
  });
  return matches;
}

/** Next unused candidate, or null when the finite list is exhausted. Does not wrap. */
export function advanceCandidate(length: number, cursor: number): number | null {
  if (!Number.isInteger(length) || length <= 0) return null;
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= length) return null;
  const next = cursor + 1;
  return next < length ? next : null;
}

export function insertReplacement<T extends { id: string }>(
  items: readonly T[],
  index: number,
  candidate: T,
): T[] {
  if (items.some((item) => item.id === candidate.id)) return items as T[];
  const at = Number.isInteger(index) ? Math.max(0, Math.min(items.length, index)) : items.length;
  const next = items.slice();
  next.splice(at, 0, candidate);
  return next;
}
