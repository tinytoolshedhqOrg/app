import type { AudioService } from '../audio';
import { GAP_SECONDS, UNIT_SECONDS, type Exercise, type VoiceCue } from '../content';
import {
  END_COUNTDOWN_BEATS,
  START_COUNTDOWN_BEATS,
  countdownPlayId,
  visibleCountdownLabel,
  COUNTDOWN_CLIPS,
  type CountdownBeat,
} from './countdown';

export const SLOT_SECONDS = UNIT_SECONDS + GAP_SECONDS;
/** Spoken "3, 2, 1, 開始" before every exercise, including the first. */
export const LEAD_SECONDS = GAP_SECONDS;

export function unitStartSeconds(index: number): number {
  return LEAD_SECONDS + index * SLOT_SECONDS;
}

export function totalPlaybackSeconds(unitCount: number): number {
  if (unitCount <= 0) return 0;
  return LEAD_SECONDS + unitCount * SLOT_SECONDS;
}

export function formatActiveDurationLabel(activeSeconds: number): { n: number; unit: 'sec' | 'min' } {
  if (activeSeconds % 60 === 0) return { n: activeSeconds / 60, unit: 'min' };
  return { n: activeSeconds, unit: 'sec' };
}

export type PlayerPhase = 'idle' | 'lead' | 'unit' | 'gap' | 'complete';

export type PlayerSnapshot = {
  phase: PlayerPhase;
  unitIndex: number;
  unitCount: number;
  elapsedSeconds: number;
  totalSeconds: number;
  unitRemaining: number;
  gapRemaining: number;
  paused: boolean;
  progress: number;
  /** 3 / 2 / 1 / 開始 while a spoken countdown is on screen. Independent of mute. */
  countdownLabel?: string;
  current?: Exercise;
  next?: Exercise;
  instruction?: string;
};

export type Clock = () => number;

function segmentAt(ex: Exercise, offset: number): string | undefined {
  return ex.movement_timeline.find((s) => offset >= s.start_seconds && offset < s.end_seconds)?.instruction;
}

export class PlayerController {
  readonly units: Exercise[];
  readonly audio: AudioService;
  private readonly now: Clock;
  private startedAt: number | null = null;
  private pauseStartedAt: number | null = null;
  private pauseAccumulatedMs = 0;
  private seekOffsetMs = 0;
  private firedCues = new Set<string>();
  private lastUnitIndex = -1;
  private lastPhase: PlayerPhase | null = null;

  constructor(units: Exercise[], audio: AudioService, now: Clock = () => Date.now()) {
    this.units = units;
    this.audio = audio;
    this.now = now;
  }

  get unitCount(): number {
    return this.units.length;
  }

  get totalSeconds(): number {
    return totalPlaybackSeconds(this.unitCount);
  }

  get paused(): boolean {
    return this.pauseStartedAt != null;
  }

  get started(): boolean {
    return this.startedAt != null;
  }

  elapsedMs(at: number = this.now()): number {
    if (this.startedAt == null) return 0;
    const extra = this.pauseStartedAt != null ? at - this.pauseStartedAt : 0;
    return Math.max(0, at - this.startedAt - this.pauseAccumulatedMs - extra + this.seekOffsetMs);
  }

  snapshot(at: number = this.now()): PlayerSnapshot {
    const unitCount = this.unitCount;
    const totalSeconds = this.totalSeconds;
    if (this.startedAt == null) {
      return {
        phase: 'idle',
        unitIndex: 0,
        unitCount,
        elapsedSeconds: 0,
        totalSeconds,
        unitRemaining: UNIT_SECONDS,
        gapRemaining: 0,
        paused: false,
        progress: 0,
        current: this.units[0],
        next: this.units[1],
        instruction: this.units[0] ? segmentAt(this.units[0], 0) : undefined,
      };
    }
    const elapsedSeconds = this.elapsedMs(at) / 1000;
    if (elapsedSeconds < LEAD_SECONDS && unitCount > 0) {
      const current = this.units[0];
      return {
        phase: 'lead',
        unitIndex: 0,
        unitCount,
        elapsedSeconds,
        totalSeconds,
        unitRemaining: UNIT_SECONDS,
        gapRemaining: LEAD_SECONDS - elapsedSeconds,
        paused: this.paused,
        progress: elapsedSeconds / totalSeconds,
        countdownLabel: visibleCountdownLabel(START_COUNTDOWN_BEATS, elapsedSeconds, LEAD_SECONDS),
        current,
        next: this.units[1],
        instruction: current?.setup,
      };
    }
    if (elapsedSeconds >= totalSeconds || unitCount === 0) {
      return {
        phase: 'complete',
        unitIndex: Math.max(0, unitCount - 1),
        unitCount,
        elapsedSeconds: totalSeconds,
        totalSeconds,
        unitRemaining: 0,
        gapRemaining: 0,
        paused: this.paused,
        progress: 1,
        current: this.units[unitCount - 1],
      };
    }
    const shifted = elapsedSeconds - LEAD_SECONDS;
    const unitIndex = Math.min(unitCount - 1, Math.floor(shifted / SLOT_SECONDS));
    const offset = shifted - unitIndex * SLOT_SECONDS;
    const current = this.units[unitIndex];
    const next = this.units[unitIndex + 1];
    if (offset < UNIT_SECONDS) {
      return {
        phase: 'unit',
        unitIndex,
        unitCount,
        elapsedSeconds,
        totalSeconds,
        unitRemaining: UNIT_SECONDS - offset,
        gapRemaining: 0,
        paused: this.paused,
        progress: elapsedSeconds / totalSeconds,
        countdownLabel: visibleCountdownLabel(END_COUNTDOWN_BEATS, offset, UNIT_SECONDS),
        current,
        next,
        instruction: current ? segmentAt(current, offset) : undefined,
      };
    }
    const gapOffset = offset - UNIT_SECONDS;
    return {
      phase: 'gap',
      unitIndex,
      unitCount,
      elapsedSeconds,
      totalSeconds,
      unitRemaining: 0,
      gapRemaining: SLOT_SECONDS - offset,
      paused: this.paused,
      progress: elapsedSeconds / totalSeconds,
      countdownLabel: next
        ? visibleCountdownLabel(START_COUNTDOWN_BEATS, gapOffset, GAP_SECONDS)
        : undefined,
      current,
      next,
      instruction: next?.setup,
    };
  }

  start(): void {
    this.startedAt = this.now();
    this.pauseStartedAt = null;
    this.pauseAccumulatedMs = 0;
    this.seekOffsetMs = 0;
    this.firedCues.clear();
    this.lastUnitIndex = -1;
    this.lastPhase = null;
    void this.audio.stopAll();
  }

  pause(): void {
    if (this.startedAt == null || this.pauseStartedAt != null) return;
    this.pauseStartedAt = this.now();
    this.audio.pause();
  }

  resume(): void {
    if (this.startedAt == null || this.pauseStartedAt == null) return;
    this.pauseAccumulatedMs += this.now() - this.pauseStartedAt;
    this.pauseStartedAt = null;
    this.audio.resume();
  }

  skip(): void {
    const snap = this.snapshot();
    if (snap.phase === 'complete' || snap.phase === 'idle') return;
    if (snap.phase === 'lead') {
      this.jumpToUnit(0);
      return;
    }
    this.jumpToUnit(snap.unitIndex + 1);
  }

  previous(): void {
    const snap = this.snapshot();
    if (snap.phase === 'idle' || this.startedAt == null) return;
    if (snap.phase === 'lead') {
      this.jumpToElapsed(0);
      return;
    }
    const intoUnit = UNIT_SECONDS - snap.unitRemaining;
    if (snap.phase === 'gap' || (snap.phase === 'unit' && intoUnit > 1)) {
      this.jumpToUnit(snap.unitIndex);
      return;
    }
    this.jumpToUnit(Math.max(0, snap.unitIndex - 1));
  }

  private jumpToUnit(index: number): void {
    if (index >= this.unitCount) {
      this.jumpToElapsed(this.totalSeconds * 1000);
      return;
    }
    this.jumpToElapsed(unitStartSeconds(Math.max(0, index)) * 1000);
  }

  private jumpToElapsed(elapsedMs: number): void {
    void this.audio.stopAll();
    this.firedCues.clear();
    this.lastUnitIndex = -1;
    this.lastPhase = null;
    this.seekToMs(elapsedMs);
  }

  private seekToMs(elapsedMs: number): void {
    const at = this.now();
    if (this.startedAt == null) this.startedAt = at;
    if (this.pauseStartedAt != null) {
      this.pauseAccumulatedMs += at - this.pauseStartedAt;
      this.pauseStartedAt = at;
    }
    this.seekOffsetMs = elapsedMs - (at - this.startedAt - this.pauseAccumulatedMs);
  }

  /**
   * Advance cue / unit-change side effects using wall-clock snapshot.
   * Call from the UI ticker. Does not use frame counts.
   */
  tick(at: number = this.now()): PlayerSnapshot {
    const snap = this.snapshot(at);
    if (snap.phase === 'complete') {
      void this.audio.stopAll();
      this.lastPhase = 'complete';
      return snap;
    }
    if (snap.paused || snap.phase === 'idle') return snap;
    const unitChanged = snap.unitIndex !== this.lastUnitIndex;
    const phaseChanged = snap.phase !== this.lastPhase;
    if (this.lastPhase != null && (unitChanged || phaseChanged)) void this.audio.stopAll();
    if (unitChanged) this.firedCues.clear();
    this.lastUnitIndex = snap.unitIndex;
    this.lastPhase = snap.phase;
    if (snap.phase === 'lead') {
      // The lead-in and the gap after unit 0 share unitIndex 0, so prefix the target.
      this.fireBeats(START_COUNTDOWN_BEATS, LEAD_SECONDS - snap.gapRemaining, 'before:0:');
    } else if (snap.phase === 'gap' && snap.next) {
      this.fireBeats(START_COUNTDOWN_BEATS, GAP_SECONDS - snap.gapRemaining, `before:${snap.unitIndex + 1}:`);
    } else if (snap.phase === 'unit' && snap.current) {
      const elapsedInUnit = UNIT_SECONDS - snap.unitRemaining;
      this.fireCues(snap.current.voice_cues, elapsedInUnit);
      this.fireBeats(END_COUNTDOWN_BEATS, elapsedInUnit);
    }
    return snap;
  }

  private fireCues(cues: VoiceCue[], elapsedInUnit: number): void {
    for (const cue of cues) {
      if (this.firedCues.has(cue.id)) continue;
      if (elapsedInUnit + 0.05 >= cue.at_seconds) {
        this.firedCues.add(cue.id);
        if (elapsedInUnit < cue.at_seconds + cue.max_duration_seconds) void this.audio.playAt(cue.id);
      }
    }
  }

  private fireBeats(beats: readonly CountdownBeat[], elapsed: number, keyPrefix = ''): void {
    for (const beat of beats) {
      const key = keyPrefix + beat.key;
      if (this.firedCues.has(key)) continue;
      const clip = COUNTDOWN_CLIPS[beat.clip];
      if (elapsed + 0.05 >= beat.at) {
        this.firedCues.add(key);
        if (elapsed < beat.at + clip.maxDurationSeconds) void this.audio.playAt(countdownPlayId(beat.clip));
      }
    }
  }
}
