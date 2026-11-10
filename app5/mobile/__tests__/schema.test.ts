import bundled from '../assets/content/exercises.zh-Hant.json';
import { parseContentPack, safeParseContentPack, EXPECTED_EXERCISE_COUNT } from '../src/content';

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(bundled)) as Record<string, unknown>;
}

describe('content schema', () => {
  it('accepts the bundled 30-exercise pack with source_referenced', () => {
    const pack = parseContentPack(bundled);
    expect(pack.exercises).toHaveLength(EXPECTED_EXERCISE_COUNT);
    expect(pack.locale).toBe('zh-Hant');
    expect(pack.review_status).toBe('source_referenced');
    const byPos: Record<string, number> = {};
    const ids = new Set<string>();
    for (const ex of pack.exercises) {
      expect(ex.review_status).toBe('source_referenced');
      byPos[ex.position] = (byPos[ex.position] || 0) + 1;
      ids.add(ex.id);
      expect(ex.duration_seconds).toBe(30);
      const last = ex.movement_timeline[ex.movement_timeline.length - 1];
      expect(ex.movement_timeline[0].start_seconds).toBe(0);
      expect(last.end_seconds).toBe(30);
    }
    expect(ids.size).toBe(30);
    expect(byPos).toEqual({ sitting: 10, standing: 10, lying: 10 });
    expect(pack.exercises.every((exercise) => exercise.access_tier === 'free')).toBe(true);
    expect(pack.notes).toContain('部分動作為一般活動設計，沒有對應的官方來源，只依共同注意事項設計。');
  });

  it('rejects a review_status other than source_referenced', () => {
    const raw = clone();
    raw.review_status = 'pending_professional_review';
    expect(safeParseContentPack(raw).success).toBe(false);
  });

  it('rejects duplicate exercise ids', () => {
    const raw = clone() as { exercises: { id: string }[] };
    raw.exercises[1].id = raw.exercises[0].id;
    expect(safeParseContentPack(raw).success).toBe(false);
  });

  it('rejects unknown category refs', () => {
    const raw = clone() as { exercises: { position: string }[] };
    raw.exercises[0].position = 'kneeling';
    expect(safeParseContentPack(raw).success).toBe(false);
  });

  it('rejects a timeline gap', () => {
    const raw = clone() as { exercises: { movement_timeline: { start_seconds: number; end_seconds: number }[] }[] };
    raw.exercises[0].movement_timeline[0].end_seconds = 8;
    expect(safeParseContentPack(raw).success).toBe(false);
  });

  it('rejects a timeline overlap', () => {
    const raw = clone() as { exercises: { movement_timeline: { start_seconds: number }[] }[] };
    raw.exercises[0].movement_timeline[1].start_seconds = 5;
    expect(safeParseContentPack(raw).success).toBe(false);
  });

  it('rejects a voice cue that runs into the ending countdown', () => {
    const raw = clone() as { exercises: { voice_cues: { at_seconds: number; max_duration_seconds: number }[] }[] };
    const cues = raw.exercises[0].voice_cues;
    const last = cues[cues.length - 1];
    last.at_seconds = 24;
    last.max_duration_seconds = 4;
    expect(safeParseContentPack(raw).success).toBe(false);

    const touching = clone() as { exercises: { voice_cues: { at_seconds: number; max_duration_seconds: number }[] }[] };
    const ok = touching.exercises[0].voice_cues;
    ok[ok.length - 1].at_seconds = 23;
    ok[ok.length - 1].max_duration_seconds = 4;
    expect(safeParseContentPack(touching).success).toBe(true);
  });

  it('rejects a voice cue that crosses 30s or the next cue', () => {
    const raw = clone() as { exercises: { voice_cues: { at_seconds: number; max_duration_seconds: number }[] }[] };
    raw.exercises[0].voice_cues[0].max_duration_seconds = 40;
    expect(safeParseContentPack(raw).success).toBe(false);

    const raw2 = clone() as { exercises: { voice_cues: { at_seconds: number; max_duration_seconds: number }[] }[] };
    raw2.exercises[0].voice_cues[0].at_seconds = 12;
    raw2.exercises[0].voice_cues[0].max_duration_seconds = 8;
    expect(safeParseContentPack(raw2).success).toBe(false);
  });

  it('accepts variable catalog sizes instead of requiring exactly 30 exercises', () => {
    const raw = clone() as { exercises: unknown[] };
    raw.exercises = raw.exercises.slice(0, 29);
    expect(safeParseContentPack(raw).success).toBe(true);
  });
});
