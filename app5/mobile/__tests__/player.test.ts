import type { AudioService } from '../src/audio';
import type { Exercise, VoiceCue } from '../src/content';
import {
  CUE_DEADLINE_SECONDS,
} from '../src/content';
import {
  COUNTDOWN_CLIPS,
  END_COUNTDOWN_BEATS,
  LEAD_SECONDS,
  PlayerController,
  SLOT_SECONDS,
  START_COUNTDOWN_BEATS,
  countdownFitsGap,
  endCountdownInsideUnit,
  totalPlaybackSeconds,
  unitStartSeconds,
} from '../src/player';

function cue(id: string, at: number): VoiceCue {
  return {
    id,
    at_seconds: at,
    max_duration_seconds: 2,
    text: id,
    audio_path: null,
    measured_duration_seconds: null,
  };
}

function unit(id: string, cues: VoiceCue[] = [cue(`${id}_c`, 0)]): Exercise {
  return {
    id,
    name: id,
    content_version: '0',
    status: 'draft',
    review_status: 'source_referenced',
    position: 'sitting',
    body_regions: ['neck'],
    movement_type: 'mobility',
    access_tier: 'free',
    duration_seconds: 30,
    gap_after_seconds: 3,
    equipment: [],
    setup: 'sit',
    description: 'd',
    instructions: ['i'],
    cautions: ['c'],
    movement_timeline: [
      { start_seconds: 0, end_seconds: 15, instruction: 'first' },
      { start_seconds: 15, end_seconds: 30, instruction: 'second' },
    ],
    voice_cues: cues,
    animation_brief: 'a',
    media: {
      status: 'not_created',
      image_path: null,
      animation_path: null,
      animation_format: 'mp4',
      animation_playback: 'follow_movement_timeline',
      animation_duration_seconds: null,
      figma_url: null,
    },
    source_ids: [],
  };
}

function mockAudio(): AudioService & { plays: string[] } {
  const plays: string[] = [];
  let muted = false;
  return {
    plays,
    load: jest.fn(async () => {}),
    playAt: jest.fn(async (id: string) => {
      if (!muted) plays.push(id);
    }),
    stopAll: jest.fn(async () => {}),
    pause: jest.fn(),
    resume: jest.fn(),
    setMuted(value: boolean) {
      muted = value;
    },
    onRouteChange: jest.fn(() => () => {}),
  };
}

describe('player timeline', () => {
  it('maps 3 minutes to 6 units, a 3s lead-in, and a 3s gap after every unit', () => {
    expect(LEAD_SECONDS).toBe(3);
    expect(SLOT_SECONDS).toBe(33);
    expect(totalPlaybackSeconds(6)).toBe(201);
    expect(LEAD_SECONDS + 6 * 30 + 6 * 3).toBe(201);
    expect(unitStartSeconds(0)).toBe(LEAD_SECONDS);
    expect(countdownFitsGap(START_COUNTDOWN_BEATS)).toBe(true);
    expect(endCountdownInsideUnit()).toBe(true);
    expect(END_COUNTDOWN_BEATS.map((beat) => beat.at)).toEqual([27, 28, 29]);
    expect(CUE_DEADLINE_SECONDS).toBe(END_COUNTDOWN_BEATS[0].at);
  });

  it('uses wall clock plus accumulated pause, not frame counts', () => {
    let now = 1_000_000;
    const audio = mockAudio();
    const p = new PlayerController([unit('a'), unit('b')], audio, () => now);
    p.start();
    now += 5000;
    expect(p.snapshot().elapsedSeconds).toBe(5);
    p.pause();
    now += 20_000;
    expect(p.snapshot().elapsedSeconds).toBe(5);
    expect(p.snapshot().paused).toBe(true);
    p.resume();
    now += 1000;
    expect(p.snapshot().elapsedSeconds).toBe(6);
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.resume).toHaveBeenCalled();
  });

  it('reports unit vs gap phases and per-unit countdown', () => {
    let now = 0;
    const p = new PlayerController([unit('a'), unit('b')], mockAudio(), () => now);
    p.start();
    expect(p.snapshot().phase).toBe('lead');
    expect(p.snapshot().countdownLabel).toBe('3');

    now = LEAD_SECONDS * 1000 + 10_000;
    const mid = p.snapshot();
    expect(mid.phase).toBe('unit');
    expect(mid.unitIndex).toBe(0);
    expect(mid.unitRemaining).toBe(20);
    expect(mid.instruction).toBe('first');

    now = LEAD_SECONDS * 1000 + 31_000;
    const gap = p.snapshot();
    expect(gap.phase).toBe('gap');
    expect(gap.gapRemaining).toBe(2);
    expect(gap.next?.id).toBe('b');
    expect(gap.countdownLabel).toBe('2');

    now = LEAD_SECONDS * 1000 + 33_000;
    const next = p.snapshot();
    expect(next.phase).toBe('unit');
    expect(next.unitIndex).toBe(1);
    expect(next.unitRemaining).toBe(30);

    now = totalPlaybackSeconds(2) * 1000;
    expect(p.snapshot().phase).toBe('complete');
  });

  it('skip stops audio and jumps to the next unit; last skip completes', () => {
    let now = 0;
    const audio = mockAudio();
    const p = new PlayerController([unit('a'), unit('b')], audio, () => now);
    p.start();
    now = (LEAD_SECONDS + 4) * 1000;
    p.skip();
    expect(audio.stopAll).toHaveBeenCalled();
    expect(p.snapshot().unitIndex).toBe(1);
    expect(p.snapshot().phase).toBe('unit');
    expect(p.snapshot().elapsedSeconds).toBeCloseTo(unitStartSeconds(1), 5);
    p.skip();
    expect(p.snapshot().phase).toBe('complete');
  });

  it('previous restarts the current unit after 1s, else goes back', () => {
    let now = 0;
    const p = new PlayerController([unit('a'), unit('b')], mockAudio(), () => now);
    p.start();
    now = (LEAD_SECONDS + 5) * 1000;
    p.previous();
    expect(p.snapshot().unitIndex).toBe(0);
    expect(p.snapshot().phase).toBe('unit');
    expect(p.snapshot().elapsedSeconds).toBeCloseTo(LEAD_SECONDS, 5);

    now = (LEAD_SECONDS + 5) * 1000 + 100;
    p.skip();
    expect(p.snapshot().unitIndex).toBe(1);
    now = (LEAD_SECONDS + 5) * 1000 + 200;
    p.previous();
    expect(p.snapshot().unitIndex).toBe(0);
  });

  it('fires voice cues on the unit clock and skips them when muted', () => {
    let now = 0;
    const audio = mockAudio();
    const p = new PlayerController(
      [unit('a', [cue('c1', 0), cue('c2', 10)])],
      audio,
      () => now,
    );
    p.start();
    now = LEAD_SECONDS * 1000;
    p.tick();
    expect(audio.plays).toEqual(['c1']);
    now = (LEAD_SECONDS + 10) * 1000;
    p.tick();
    expect(audio.plays).toEqual(['c1', 'c2']);

    audio.plays.length = 0;
    audio.setMuted(true);
    const p2 = new PlayerController([unit('a', [cue('m1', 0)])], audio, () => 0);
    p2.start();
    p2.tick();
    expect(audio.plays).toEqual([]);
    expect(p2.snapshot().countdownLabel).toBe('3');
  });
});

describe('voice timing after a delayed ticker',()=>{
 it('skips expired prompts instead of speaking old instructions together',()=>{
  let now=0;const audio=mockAudio();
  const p=new PlayerController([unit('a',[cue('old',0),cue('current',10)])],audio,()=>now);
  p.start();
  now = LEAD_SECONDS * 1000 + 10500;
  p.tick();
  expect(audio.plays).toEqual(['current']);
  (audio.stopAll as jest.Mock).mockClear();
  now = LEAD_SECONDS * 1000 + 30500;
  p.tick();
  expect(audio.stopAll).toHaveBeenCalled();
  expect(audio.plays).toEqual(['current']);
 });
});

describe('spoken countdown', () => {
  it('counts in before every exercise and out at 27s, 28s, and 29s', () => {
    let now = 0;
    const audio = mockAudio();
    const p = new PlayerController(
      [unit('a', [cue('a0', 0)]), unit('b', [cue('b0', 0)])],
      audio,
      () => now,
    );
    p.start();
    const beats = [0, 700, 1400, 2100];
    const leadLabels = ['3', '2', '1', '開始'];
    beats.forEach((ms, index) => {
      now = ms;
      p.tick();
      expect(p.snapshot().phase).toBe('lead');
      expect(p.snapshot().countdownLabel).toBe(leadLabels[index]);
    });
    now = LEAD_SECONDS * 1000;
    p.tick();
    expect(p.snapshot().phase).toBe('unit');
    expect(p.snapshot().unitRemaining).toBe(30);
    expect(p.snapshot().countdownLabel).toBeUndefined();

    now = (LEAD_SECONDS + 27) * 1000;
    p.tick();
    expect(p.snapshot().countdownLabel).toBe('3');
    now = (LEAD_SECONDS + 28) * 1000;
    p.tick();
    expect(p.snapshot().countdownLabel).toBe('2');
    now = (LEAD_SECONDS + 29) * 1000;
    p.tick();
    expect(p.snapshot().countdownLabel).toBe('1');
    expect(p.snapshot().phase).toBe('unit');

    now = (LEAD_SECONDS + 30) * 1000;
    p.tick();
    expect(p.snapshot().phase).toBe('gap');
    expect(p.snapshot().countdownLabel).toBe('3');
    now = (LEAD_SECONDS + 30) * 1000 + 700;
    p.tick();
    now = (LEAD_SECONDS + 30) * 1000 + 1400;
    p.tick();
    now = (LEAD_SECONDS + 30) * 1000 + 2100;
    p.tick();
    expect(p.snapshot().countdownLabel).toBe('開始');
    now = unitStartSeconds(1) * 1000;
    p.tick();
    expect(p.snapshot().phase).toBe('unit');
    expect(p.snapshot().unitIndex).toBe(1);
    expect(p.snapshot().unitRemaining).toBe(30);

    expect(audio.plays).toEqual([
      'countdown:3', 'countdown:2', 'countdown:1', 'countdown:start',
      'a0',
      'countdown:3', 'countdown:2', 'countdown:1',
      'countdown:3', 'countdown:2', 'countdown:1', 'countdown:start',
      'b0',
    ]);
    expect(COUNTDOWN_CLIPS.start.text).toBe('開始');
  });

  it('does not speak during the trailing gap or replay a beat after pause', () => {
    let now = 0;
    const audio = mockAudio();
    const p = new PlayerController([unit('a', [cue('a0', 0)])], audio, () => now);
    p.start();
    p.tick();
    p.pause();
    now = 4000;
    p.tick();
    expect(p.snapshot().paused).toBe(true);
    expect(p.snapshot().countdownLabel).toBe('3');
    expect(audio.plays).toEqual(['countdown:3']);
    p.resume();
    p.tick();
    expect(audio.plays).toEqual(['countdown:3']);
    expect(audio.resume).toHaveBeenCalled();

    now = 0;
    const trailing = mockAudio();
    const alone = new PlayerController([unit('a', [cue('a0', 0)])], trailing, () => now);
    alone.start();
    now = LEAD_SECONDS * 1000;
    alone.tick();
    now = (LEAD_SECONDS + 30) * 1000;
    alone.tick();
    expect(alone.snapshot().phase).toBe('gap');
    expect(alone.snapshot().next).toBeUndefined();
    expect(alone.snapshot().countdownLabel).toBeUndefined();
    expect(trailing.plays).toEqual(['a0']);
  });

  it('skips stale countdown audio and does not play it again on the next tick', () => {
    let now = 0;
    const audio = mockAudio();
    const p = new PlayerController(
      [unit('a', [cue('a0', 0)]), unit('b', [cue('b0', 0)])],
      audio,
      () => now,
    );
    p.start();
    now = (LEAD_SECONDS + 27.8) * 1000;
    p.tick();
    expect(p.snapshot().countdownLabel).toBe('3');
    expect(audio.plays).toEqual([]);
    now = (LEAD_SECONDS + 28) * 1000;
    p.tick();
    p.tick();
    expect(audio.plays).toEqual(['countdown:2']);

    p.skip();
    p.tick();
    expect(p.snapshot().unitIndex).toBe(1);
    expect(p.snapshot().phase).toBe('unit');
    expect(audio.plays).toEqual(['countdown:2', 'b0']);
  });

  it('starts the current exercise when skipping the opening countdown', () => {
    let now = 0;
    const audio = mockAudio();
    const p = new PlayerController([unit('a', [cue('a0', 0)]), unit('b')], audio, () => now);
    p.start();
    now = 400;
    p.tick();
    p.skip();
    p.tick();
    expect(p.snapshot().phase).toBe('unit');
    expect(p.snapshot().unitIndex).toBe(0);
    expect(p.snapshot().unitRemaining).toBe(30);
    expect(audio.plays).toEqual(['countdown:3', 'a0']);
    p.tick();
    expect(audio.plays).toEqual(['countdown:3', 'a0']);
  });
});
