/**
 * Explicit movement-pattern groups for replacement suggestions.
 * A group only lists posture variants whose written instructions describe the
 * same activity. It is not a clinical, safety, or therapeutic equivalence.
 * Exercises omitted here have no replacement candidate.
 */
export type ActivityGroup = {
  id: string;
  label: string;
  exerciseIds: readonly string[];
};

export const ACTIVITY_GROUPS: readonly ActivityGroup[] = [
  { id: "wrist_flex", label: "手腕屈伸活動", exerciseIds: ["lie_wrist_flex", "sit_wrist_flex", "stand_wrist_flex"] },
  { id: "finger_open", label: "手指開合活動", exerciseIds: ["lie_finger_open", "sit_finger_open", "stand_finger_open"] },
  { id: "elbow_bend", label: "手肘彎伸活動", exerciseIds: ["lie_elbow_bend", "sit_elbow_bend", "stand_elbow_bend"] },
  { id: "triceps_stretch", label: "手臂後側伸展", exerciseIds: ["sit_triceps", "stand_triceps"] },
  { id: "shoulder_circles", label: "肩膀繞圈活動", exerciseIds: ["sit_shoulder_circles", "stand_shoulder_circles"] },
  { id: "chest_open", label: "胸前打開伸展", exerciseIds: ["sit_chest_open", "stand_chest_open"] },
  { id: "neck_turn", label: "轉頭活動", exerciseIds: ["sit_neck_turn", "stand_neck_turn"] },
  { id: "ankle_pump", label: "腳踝勾放活動", exerciseIds: ["lie_ankle_pump", "sit_ankle_pump"] },
  { id: "side_bend", label: "側身輕移", exerciseIds: ["sit_side_reach", "stand_side_slide"] },
];

const activityByExerciseId = new Map<string, string>();
for (const group of ACTIVITY_GROUPS) {
  for (const exerciseId of group.exerciseIds) {
    if (!activityByExerciseId.has(exerciseId)) activityByExerciseId.set(exerciseId, group.id);
  }
}

export function activityIdFor(exerciseId: string): string | undefined {
  return activityByExerciseId.get(exerciseId);
}

export type ActivityExercise = {
  id: string;
  body_regions: readonly string[];
  movement_type: string;
};

export function activityGroupIssues(exercises: readonly ActivityExercise[]): string[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const group of ACTIVITY_GROUPS) {
    if (group.exerciseIds.length < 2) issues.push(`${group.id} needs at least two exercises`);
    const members = group.exerciseIds.map((id) => byId.get(id));
    group.exerciseIds.forEach((id, index) => {
      if (seen.has(id)) issues.push(`${id} is in more than one activity group`);
      seen.add(id);
      if (!members[index]) issues.push(`${group.id} references unknown exercise ${id}`);
    });
    const known = members.filter((exercise): exercise is ActivityExercise => !!exercise);
    const movementTypes = new Set(known.map((exercise) => exercise.movement_type));
    if (movementTypes.size > 1) issues.push(`${group.id} mixes movement types`);
    const shared = known.reduce<Set<string> | null>((regions, exercise) => {
      const next = new Set(exercise.body_regions);
      if (!regions) return next;
      return new Set([...regions].filter((region) => next.has(region)));
    }, null);
    if (known.length > 1 && (!shared || shared.size === 0)) {
      issues.push(`${group.id} does not share a body region`);
    }
  }
  return issues;
}
