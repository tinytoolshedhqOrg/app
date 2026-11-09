import fs from 'fs';
import path from 'path';
import { exerciseNameAsset, resolveExerciseNamePlay } from '../src/audio/exerciseNames';
import { exerciseLibrary } from '../src/content/exercise-index';
import { NAME_WINDOW_SECONDS } from '../src/player/countdown';

const dir = path.join(__dirname, '../assets/exercise-names/zh-Hant');

describe('exercise name clips', () => {
  it('bundles a trimmed HsiaoYu name for every exercise and skips unknown ids', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const source = fs.readFileSync(path.join(__dirname, '../src/audio/exerciseNames.ts'), 'utf8');
    expect(manifest.locale).toBe('zh-Hant');
    expect(manifest.voice).toBe('zh-TW-HsiaoYuNeural');
    expect(source).not.toMatch(/AZURE_SPEECH_KEY|Ocp-Apim-Subscription-Key/);
    const clips = manifest.clips as Record<string, { text: string; file: string; duration_seconds: number }>;
    const ids = Object.keys(clips);
    expect(ids).toHaveLength(36);
    expect(ids.sort()).toEqual(exerciseLibrary.map((exercise) => exercise.id).sort());
    let longest = 0;
    for (const id of ids) {
      const clip = clips[id];
      expect(clip.text.length).toBeGreaterThan(0);
      expect(clip.file).toBe(`${id}.mp3`);
      expect(clip.duration_seconds).toBeGreaterThan(0);
      expect(clip.duration_seconds).toBeLessThanOrEqual(2.208);
      expect(clip.duration_seconds).toBeLessThanOrEqual(NAME_WINDOW_SECONDS);
      longest = Math.max(longest, clip.duration_seconds);
      const bytes = fs.readFileSync(path.join(dir, clip.file));
      expect(bytes.length).toBeGreaterThan(100);
      expect(source).toContain(`require('../../assets/exercise-names/zh-Hant/${clip.file}')`);
      expect(exerciseNameAsset(id)).toBeDefined();
      expect(resolveExerciseNamePlay(`name:${id}`)).toEqual({
        asset: exerciseNameAsset(id),
        maxDurationSeconds: clip.duration_seconds,
      });
    }
    expect(longest).toBe(2.208);
    expect(resolveExerciseNamePlay('name:missing_exercise')).toBeUndefined();
    expect(resolveExerciseNamePlay('countdown:3')).toBeUndefined();
    expect(exerciseNameAsset('missing_exercise')).toBeUndefined();
  });
});
