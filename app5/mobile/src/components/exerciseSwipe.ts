export const SWIPE_DELETE_WIDTH = 76;
export const SWIPE_SLOP = 10;
const HORIZONTAL_DOMINANCE = 1.25;
const REVEAL_FRACTION = 0.4;
/** PanResponder reports vx in pixels per millisecond. */
const FLICK_LOOKAHEAD_MS = 120;

export type SwipeClaimState = {
  canDelete: boolean;
  revealed: boolean;
  sorting: boolean;
};

export function removeExerciseAt<T>(items: readonly T[], index: number): T[] {
  if (items.length <= 1 || !Number.isInteger(index) || index < 0 || index >= items.length) {
    return items as T[];
  }
  const next = items.filter((_, itemIndex) => itemIndex !== index);
  return next.length >= 1 ? next : (items as T[]);
}

export function swipeShouldClaim(dx: number, dy: number, state: SwipeClaimState): boolean {
  if (state.sorting || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < SWIPE_SLOP || absX < absY * HORIZONTAL_DOMINANCE) return false;
  if (dx < 0) return state.canDelete;
  return state.revealed;
}

export function nextSwipeOffset(start: number, dx: number, canDelete: boolean): number {
  const min = canDelete ? -SWIPE_DELETE_WIDTH : 0;
  const delta = Number.isFinite(dx) ? dx : 0;
  const origin = Number.isFinite(start) ? start : 0;
  return Math.max(min, Math.min(0, origin + delta));
}

export function swipeShouldReveal(offset: number, velocityX: number, canDelete: boolean): boolean {
  if (!canDelete || !Number.isFinite(offset)) return false;
  const velocity = Number.isFinite(velocityX) ? velocityX : 0;
  const projected = Math.max(
    -SWIPE_DELETE_WIDTH,
    Math.min(0, offset + velocity * FLICK_LOOKAHEAD_MS),
  );
  return projected <= -SWIPE_DELETE_WIDTH * REVEAL_FRACTION;
}
