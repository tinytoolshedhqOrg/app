import { GAP_SECONDS, UNIT_SECONDS } from '../content';

/** Spoken countdown clips. UI copy stays numeric; TTS reads 三／二／一／開始. */
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

/** "3, 2, 1, 開始" inside the 3s pre-exercise gap. The last clip ends before the unit. */
export const START_COUNTDOWN_BEATS: readonly CountdownBeat[] = [
  { key: 'start:3', at: 0, clip: '3' },
  { key: 'start:2', at: 0.7, clip: '2' },
  { key: 'start:1', at: 1.4, clip: '1' },
  { key: 'start:go', at: 2.1, clip: 'start' },
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

/** Label of the latest beat that has started and is still inside the phase. */
export function visibleCountdownLabel(
  beats: readonly CountdownBeat[],
  offset: number,
  until: number,
): string | undefined {
  let label: string | undefined;
  for (const beat of beats) {
    if (offset >= beat.at && offset < until) label = COUNTDOWN_CLIPS[beat.clip].label;
  }
  return label;
}

export function countdownFitsGap(beats: readonly CountdownBeat[], gapSeconds = GAP_SECONDS): boolean {
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
