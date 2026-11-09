import { UNIT_SECONDS } from '../content';

/** Spoken countdown clips. The screen shows 3 / 2 / 1 only; TTS still reads 三／二／一／開始. */
export const COUNTDOWN_CLIPS = {
  '3': { text: '三', label: '3', maxDurationSeconds: 0.65 },
  '2': { text: '二', label: '2', maxDurationSeconds: 0.65 },
  '1': { text: '一', label: '1', maxDurationSeconds: 0.65 },
  start: { text: '開始', label: '開始', maxDurationSeconds: 0.85 },
} as const;

export type CountdownClipId = keyof typeof COUNTDOWN_CLIPS;

export type CountdownBeat = {
  /** Unique inside one unit slot. Start and end counts must not block each other. */
  key: string;
  at: number;
  clip: CountdownClipId;
};

/**
 * Fixed pre-exercise prep, used for the opening lead-in and every gap.
 * 2.5s name window (longest bundled name is 2.208s) + 0.5s pause, then
 * 3 / 2 / 1 / 開始 at exact 1s starts. The action begins 1s after 開始.
 */
export const NAME_WINDOW_SECONDS = 2.5;
export const NAME_PAUSE_SECONDS = 0.5;
export const COUNTDOWN_BEAT_SECONDS = 1;
/**
 * A name may still start this late. 0.5s + the 2.208s clip ends at 2.708s,
 * before "3" at 3.000s. Later than this, skip the name so it cannot run into the count.
 */
export const NAME_START_GRACE_SECONDS = 0.5;
export const PREP_SECONDS =
  NAME_WINDOW_SECONDS + NAME_PAUSE_SECONDS + 4 * COUNTDOWN_BEAT_SECONDS;

const COUNT_START_SECONDS = NAME_WINDOW_SECONDS + NAME_PAUSE_SECONDS;

/** "3, 2, 1, 開始" on a 1.000s wall-clock grid. The action starts at PREP_SECONDS. */
export const START_COUNTDOWN_BEATS: readonly CountdownBeat[] = [
  { key: 'start:3', at: COUNT_START_SECONDS, clip: '3' },
  { key: 'start:2', at: COUNT_START_SECONDS + COUNTDOWN_BEAT_SECONDS, clip: '2' },
  { key: 'start:1', at: COUNT_START_SECONDS + 2 * COUNTDOWN_BEAT_SECONDS, clip: '1' },
  { key: 'start:go', at: COUNT_START_SECONDS + 3 * COUNTDOWN_BEAT_SECONDS, clip: 'start' },
];

/** "3, 2, 1" at 27s, 28s, and 29s of the 30s exercise. */
export const END_COUNTDOWN_BEATS: readonly CountdownBeat[] = [
  { key: 'end:3', at: 27, clip: '3' },
  { key: 'end:2', at: 28, clip: '2' },
  { key: 'end:1', at: 29, clip: '1' },
];

export function countdownPlayId(clip: CountdownClipId): string {
  return `countdown:${clip}`;
}

export function exerciseNamePlayId(exerciseId: string): string {
  return `name:${exerciseId}`;
}

/** True while 開始 is being spoken. The screen stays blank for that second. */
export function isSpokenStartMoment(
  beats: readonly CountdownBeat[],
  offset: number,
  until: number,
): boolean {
  return beats.some((beat) => beat.clip === 'start' && offset >= beat.at && offset < until);
}

/** Label of the latest numeric beat (3 / 2 / 1). 開始 is spoken and not shown. */
export function visibleCountdownLabel(
  beats: readonly CountdownBeat[],
  offset: number,
  until: number,
): string | undefined {
  if (isSpokenStartMoment(beats, offset, until)) return undefined;
  let label: string | undefined;
  for (const beat of beats) {
    if (beat.clip === 'start') continue;
    if (offset >= beat.at && offset < until) label = COUNTDOWN_CLIPS[beat.clip].label;
  }
  return label;
}

export function countdownFitsGap(beats: readonly CountdownBeat[], gapSeconds = PREP_SECONDS): boolean {
  return beats.every((beat) => {
    const end = beat.at + COUNTDOWN_CLIPS[beat.clip].maxDurationSeconds;
    return beat.at >= 0 && end <= gapSeconds;
  });
}

export function endCountdownInsideUnit(unitSeconds = UNIT_SECONDS): boolean {
  return END_COUNTDOWN_BEATS.every((beat, index) => {
    const end = beat.at + COUNTDOWN_CLIPS[beat.clip].maxDurationSeconds;
    const next = END_COUNTDOWN_BEATS[index + 1]?.at ?? unitSeconds;
    return beat.at >= 27 && end <= next && end <= unitSeconds;
  });
}

/** Name window, pause, 1s beats, and the action 1s after 開始. */
export function prepTimelineHolds(): boolean {
  const beats = START_COUNTDOWN_BEATS;
  if (beats.length !== 4) return false;
  if (beats[0].at !== NAME_WINDOW_SECONDS + NAME_PAUSE_SECONDS) return false;
  for (let i = 1; i < beats.length; i += 1) {
    if (beats[i].at - beats[i - 1].at !== COUNTDOWN_BEAT_SECONDS) return false;
  }
  const go = beats[beats.length - 1];
  return (
    go.clip === 'start'
    && go.at + COUNTDOWN_BEAT_SECONDS === PREP_SECONDS
    && go.at + COUNTDOWN_CLIPS.start.maxDurationSeconds <= PREP_SECONDS
    && countdownFitsGap(beats)
  );
}
