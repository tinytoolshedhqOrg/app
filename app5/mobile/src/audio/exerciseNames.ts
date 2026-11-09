import manifest from '../../assets/exercise-names/zh-Hant/manifest.json';

/** Offline zh-Hant exercise names. Static requires so Metro can bundle them. */
const assets: Record<string, number> = {
  lie_ankle_circles: require('../../assets/exercise-names/zh-Hant/lie_ankle_circles.mp3'),
  lie_ankle_pump: require('../../assets/exercise-names/zh-Hant/lie_ankle_pump.mp3'),
  lie_arm_slide: require('../../assets/exercise-names/zh-Hant/lie_arm_slide.mp3'),
  lie_elbow_bend: require('../../assets/exercise-names/zh-Hant/lie_elbow_bend.mp3'),
  lie_finger_open: require('../../assets/exercise-names/zh-Hant/lie_finger_open.mp3'),
  lie_glute: require('../../assets/exercise-names/zh-Hant/lie_glute.mp3'),
  lie_hamstring: require('../../assets/exercise-names/zh-Hant/lie_hamstring.mp3'),
  lie_heel_slide: require('../../assets/exercise-names/zh-Hant/lie_heel_slide.mp3'),
  lie_knee_roll: require('../../assets/exercise-names/zh-Hant/lie_knee_roll.mp3'),
  lie_pelvic_tilt: require('../../assets/exercise-names/zh-Hant/lie_pelvic_tilt.mp3'),
  lie_single_knee_hug: require('../../assets/exercise-names/zh-Hant/lie_single_knee_hug.mp3'),
  lie_wrist_flex: require('../../assets/exercise-names/zh-Hant/lie_wrist_flex.mp3'),
  sit_ankle_pump: require('../../assets/exercise-names/zh-Hant/sit_ankle_pump.mp3'),
  sit_chest_open: require('../../assets/exercise-names/zh-Hant/sit_chest_open.mp3'),
  sit_elbow_bend: require('../../assets/exercise-names/zh-Hant/sit_elbow_bend.mp3'),
  sit_finger_open: require('../../assets/exercise-names/zh-Hant/sit_finger_open.mp3'),
  sit_knee_extend: require('../../assets/exercise-names/zh-Hant/sit_knee_extend.mp3'),
  sit_neck_side: require('../../assets/exercise-names/zh-Hant/sit_neck_side.mp3'),
  sit_neck_turn: require('../../assets/exercise-names/zh-Hant/sit_neck_turn.mp3'),
  sit_shoulder_circles: require('../../assets/exercise-names/zh-Hant/sit_shoulder_circles.mp3'),
  sit_side_reach: require('../../assets/exercise-names/zh-Hant/sit_side_reach.mp3'),
  sit_triceps: require('../../assets/exercise-names/zh-Hant/sit_triceps.mp3'),
  sit_upper_back_turn: require('../../assets/exercise-names/zh-Hant/sit_upper_back_turn.mp3'),
  sit_wrist_flex: require('../../assets/exercise-names/zh-Hant/sit_wrist_flex.mp3'),
  stand_arm_raise: require('../../assets/exercise-names/zh-Hant/stand_arm_raise.mp3'),
  stand_calf_wall: require('../../assets/exercise-names/zh-Hant/stand_calf_wall.mp3'),
  stand_chest_open: require('../../assets/exercise-names/zh-Hant/stand_chest_open.mp3'),
  stand_elbow_bend: require('../../assets/exercise-names/zh-Hant/stand_elbow_bend.mp3'),
  stand_finger_open: require('../../assets/exercise-names/zh-Hant/stand_finger_open.mp3'),
  stand_neck_turn: require('../../assets/exercise-names/zh-Hant/stand_neck_turn.mp3'),
  stand_overhead_side: require('../../assets/exercise-names/zh-Hant/stand_overhead_side.mp3'),
  stand_shoulder_blades: require('../../assets/exercise-names/zh-Hant/stand_shoulder_blades.mp3'),
  stand_shoulder_circles: require('../../assets/exercise-names/zh-Hant/stand_shoulder_circles.mp3'),
  stand_side_slide: require('../../assets/exercise-names/zh-Hant/stand_side_slide.mp3'),
  stand_triceps: require('../../assets/exercise-names/zh-Hant/stand_triceps.mp3'),
  stand_wrist_flex: require('../../assets/exercise-names/zh-Hant/stand_wrist_flex.mp3'),
};

export function exerciseNameAsset(id: string): number | undefined {
  return assets[id];
}

export function resolveExerciseNamePlay(
  playId: string,
): { asset: number; maxDurationSeconds: number } | undefined {
  const prefix = 'name:';
  if (!playId.startsWith(prefix)) return undefined;
  const id = playId.slice(prefix.length);
  const asset = assets[id];
  const clip = manifest.clips[id as keyof typeof manifest.clips];
  if (asset == null || !clip) return undefined;
  return { asset, maxDurationSeconds: clip.duration_seconds };
}

