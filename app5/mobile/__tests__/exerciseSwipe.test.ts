import {
  nextSwipeOffset,
  removeExerciseAt,
  SWIPE_DELETE_WIDTH,
  SWIPE_SLOP,
  swipeShouldClaim,
  swipeShouldReveal,
} from "../src/components/exerciseSwipe";

describe("removeExerciseAt", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("removes only the chosen index and keeps the other objects", () => {
    const next = removeExerciseAt(items, 1);
    expect(next).toEqual([{ id: "a" }, { id: "c" }]);
    expect(next[0]).toBe(items[0]);
    expect(next[1]).toBe(items[2]);
    expect(items).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("refuses the last remaining action and invalid indexes", () => {
    const only = [{ id: "a" }];
    expect(removeExerciseAt(only, 0)).toBe(only);
    expect(removeExerciseAt(items, -1)).toBe(items);
    expect(removeExerciseAt(items, 3)).toBe(items);
    expect(removeExerciseAt(items, 1.5)).toBe(items);
  });
});

describe("swipe gesture policy", () => {
  const closed = { canDelete: true, revealed: false, sorting: false };

  it("claims a left swipe only when deletion is allowed and the gesture is horizontal", () => {
    expect(swipeShouldClaim(-SWIPE_SLOP - 4, 2, closed)).toBe(true);
    expect(swipeShouldClaim(-SWIPE_SLOP + 4, 0, closed)).toBe(false);
    expect(swipeShouldClaim(-24, 30, closed)).toBe(false);
    expect(swipeShouldClaim(24, 0, closed)).toBe(false);
    expect(swipeShouldClaim(-30, 0, { ...closed, canDelete: false })).toBe(false);
    expect(swipeShouldClaim(-30, 0, { ...closed, sorting: true })).toBe(false);
    expect(swipeShouldClaim(Number.NaN, 0, closed)).toBe(false);
  });

  it("claims a right swipe only to close an open row", () => {
    expect(swipeShouldClaim(24, 1, { ...closed, revealed: true })).toBe(true);
    expect(swipeShouldClaim(24, 1, closed)).toBe(false);
  });

  it("reveals only past the threshold or on a left flick, and never for the last action", () => {
    expect(swipeShouldReveal(-SWIPE_DELETE_WIDTH, 0, true)).toBe(true);
    expect(swipeShouldReveal(-4, 0, true)).toBe(false);
    expect(swipeShouldReveal(-4, -1, true)).toBe(true);
    expect(swipeShouldReveal(-SWIPE_DELETE_WIDTH, 1, true)).toBe(false);
    expect(swipeShouldReveal(-SWIPE_DELETE_WIDTH, 0, false)).toBe(false);
  });

  it("keeps the row from sliding when deletion is not allowed", () => {
    expect(nextSwipeOffset(0, -40, true)).toBe(-40);
    expect(nextSwipeOffset(0, -200, true)).toBe(-SWIPE_DELETE_WIDTH);
    expect(nextSwipeOffset(0, -40, false)).toBe(0);
    expect(nextSwipeOffset(-20, 8, true)).toBe(-12);
  });
});
