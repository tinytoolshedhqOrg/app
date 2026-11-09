import { loadBundledContent } from "../src/content";
import { activityGroupIssues, activityIdFor } from "../src/content/activityGroups";
import {
  advanceCandidate,
  insertReplacement,
  rankReplacements,
} from "../src/content/replacements";

const catalog = () => loadBundledContent().exercises;
const byId = (id: string) => {
  const exercise = catalog().find((item) => item.id === id);
  if (!exercise) throw new Error(`missing ${id}`);
  return exercise;
};

describe("replacement classification", () => {
  it("validates explicit activity groups against the shared catalog", () => {
    expect(activityGroupIssues(catalog())).toEqual([]);
    expect(new Set(catalog().map((exercise) => exercise.id)).size).toBe(catalog().length);
  });

  it("ranks the same activity and body area, preferring a similar posture", () => {
    const removed = byId("sit_wrist_flex");
    const ranked = rankReplacements(removed, catalog(), new Set());
    expect(ranked.map((exercise) => exercise.id)).toEqual(["stand_wrist_flex", "lie_wrist_flex"]);
    expect(ranked.every((exercise) => exercise.movement_type === removed.movement_type)).toBe(true);
    expect(ranked.every((exercise) => exercise.body_regions.some((region) => removed.body_regions.includes(region)))).toBe(true);
  });

  it("excludes the removed exercise, exercises already in the routine, and duplicate pool rows", () => {
    const removed = byId("sit_wrist_flex");
    const pool = [removed, byId("stand_wrist_flex"), byId("stand_wrist_flex"), byId("lie_wrist_flex")];
    const ranked = rankReplacements(removed, pool, new Set(["lie_wrist_flex"]));
    expect(ranked.map((exercise) => exercise.id)).toEqual(["stand_wrist_flex"]);
  });

  it("does not offer a different movement or an unrelated fallback", () => {
    const misses: [string, string][] = [
      ["sit_upper_back_turn", "stand_shoulder_blades"],
      ["sit_neck_turn", "sit_neck_side"],
      ["lie_heel_slide", "sit_knee_extend"],
      ["lie_ankle_circles", "lie_ankle_pump"],
      ["sit_shoulder_circles", "stand_arm_raise"],
    ];
    for (const [removedId, otherId] of misses) {
      const ranked = rankReplacements(byId(removedId), catalog(), new Set());
      expect(ranked.map((exercise) => exercise.id)).not.toContain(otherId);
      const removedActivity = activityIdFor(removedId);
      const otherActivity = activityIdFor(otherId);
      expect(removedActivity != null && removedActivity === otherActivity).toBe(false);
    }
    expect(rankReplacements(byId("stand_calf_wall"), catalog(), new Set())).toEqual([]);
    expect(rankReplacements(byId("sit_upper_back_turn"), catalog(), new Set())).toEqual([]);
  });

  it("rejects a same-activity row that does not share a body area or movement type", () => {
    const removed = byId("sit_wrist_flex");
    const wrongArea = { ...byId("stand_wrist_flex"), body_regions: ["neck"] };
    const wrongType = { ...byId("stand_wrist_flex"), movement_type: "stretch" };
    expect(rankReplacements(removed, [wrongArea, wrongType], new Set())).toEqual([]);
  });

  it("advances through each candidate once and then stops", () => {
    expect(advanceCandidate(3, 0)).toBe(1);
    expect(advanceCandidate(3, 1)).toBe(2);
    expect(advanceCandidate(3, 2)).toBeNull();
    expect(advanceCandidate(1, 0)).toBeNull();
    expect(advanceCandidate(2, -1)).toBeNull();
    expect(advanceCandidate(0, 0)).toBeNull();
  });

  it("inserts the accepted exercise at the deleted position and refuses duplicates", () => {
    const items = [byId("sit_finger_open"), byId("sit_elbow_bend")];
    const candidate = byId("stand_wrist_flex");
    const next = insertReplacement(items, 1, candidate);
    expect(next.map((exercise) => exercise.id)).toEqual([
      "sit_finger_open",
      "stand_wrist_flex",
      "sit_elbow_bend",
    ]);
    expect(items.map((exercise) => exercise.id)).toEqual(["sit_finger_open", "sit_elbow_bend"]);
    expect(insertReplacement(next, 0, candidate)).toBe(next);
  });
});
