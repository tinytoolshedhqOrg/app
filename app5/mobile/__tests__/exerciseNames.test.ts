import fs from 'fs';
import path from 'path';
import { exerciseNameAsset, resolveExerciseNamePlay } from '../src/audio/exerciseNames';
import { exerciseLibrary } from '../src/content/exercise-index';
import { NAME_WINDOW_SECONDS } from '../src/player/countdown';

const dir = path.join(__dirname, '../assets/exercise-names/zh-Hant');

describe('exercise name clips', () => {
  it('plays bundled HsiaoYu names and skips exercises that do not have a clip yet', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const audioManifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../assets/exercises/audio-manifest.json'), 'utf8'),
    );
    const source = fs.readFileSync(path.join(__dirname, '../src/audio/exerciseNames.ts'), 'utf8');
    expect(manifest.locale).toBe('zh-Hant');
    expect(manifest.voice).toBe('zh-TW-HsiaoYuNeural');
    expect(audioManifest.voice).toBe('zh-TW-HsiaoYuNeural');
    expect(source).not.toMatch(/AZURE_SPEECH_KEY|Ocp-Apim-Subscription-Key/);
    const clips = manifest.clips as Record<string, { text: string; file: string; duration_seconds: number }>;
    const ids = Object.keys(clips);
    const libraryIds = exerciseLibrary.map((exercise) => exercise.id);
    expect(libraryIds).toHaveLength(100);
    expect(ids.every((id) => libraryIds.includes(id))).toBe(true);
    const names = audioManifest.name_clips as { exercise_id: string; text: string; target_path: string; status: string }[];
    expect(names.map((clip) => clip.exercise_id).sort()).toEqual([...libraryIds].sort());
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
      const listed = names.find((clip) => clip.exercise_id === id);
      expect(listed).toMatchObject({
        text: clip.text,
        target_path: `assets/exercise-names/zh-Hant/${id}.mp3`,
        status: 'ready',
      });
    }
    const pending = names.filter((clip) => clip.status === 'needed');
    expect(pending.length).toBe(libraryIds.length - ids.length);
    for (const clip of pending) {
      expect(clip.text.length).toBeGreaterThan(0);
      expect(clip.text.length).toBeLessThanOrEqual(8);
      expect(clip.target_path).toBe(`assets/exercise-names/zh-Hant/${clip.exercise_id}.mp3`);
      expect(fs.existsSync(path.join(__dirname, '..', clip.target_path))).toBe(false);
      expect(exerciseNameAsset(clip.exercise_id)).toBeUndefined();
      expect(resolveExerciseNamePlay(`name:${clip.exercise_id}`)).toBeUndefined();
    }
    expect(longest).toBe(2.208);
    expect(resolveExerciseNamePlay('name:missing_exercise')).toBeUndefined();
    expect(resolveExerciseNamePlay('countdown:3')).toBeUndefined();
    expect(exerciseNameAsset('missing_exercise')).toBeUndefined();
  });
});
