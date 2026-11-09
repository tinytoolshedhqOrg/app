import fs from 'fs';
import path from 'path';
import { COUNTDOWN_CLIPS } from '../src/player/countdown';

const dir = path.join(__dirname, '../assets/countdown/zh-Hant');

describe('countdown placeholders', () => {
  it('bundles silent zh-Hant clips and documents how to generate HsiaoYu audio', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const readme = fs.readFileSync(path.join(dir, '../README.md'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '../scripts/generate-countdown.py'), 'utf8');
    expect(manifest.locale).toBe('zh-Hant');
    expect(manifest.voice).toBe('zh-TW-HsiaoYuNeural');
    expect(manifest.status).toBe('placeholder');
    expect(manifest.clips.map((clip: { token: string }) => clip.token)).toEqual(['3', '2', '1', 'start']);
    for (const clip of manifest.clips) {
      const token = clip.token === 'start' ? 'start' : clip.token;
      expect(COUNTDOWN_CLIPS[token as '3' | '2' | '1' | 'start'].text).toBe(clip.text);
      expect(COUNTDOWN_CLIPS[token as '3' | '2' | '1' | 'start'].maxDurationSeconds).toBe(clip.max_duration_seconds);
      const file = path.join(dir, clip.file);
      expect(fs.existsSync(file)).toBe(true);
      expect(clip.file).toMatch(/\.placeholder\.mp3$/);
      expect(fs.statSync(file).size).toBeGreaterThan(100);
    }
    expect(readme).toMatch(/HsiaoYu/);
    expect(readme).toMatch(/placeholder/);
    expect(script).toMatch(/zh-TW-HsiaoYuNeural/);
    expect(script).not.toMatch(/AZURE_SPEECH_KEY\s*=\s*['"][A-Za-z0-9]/);
    expect(script).not.toMatch(/Ocp-Apim-Subscription-Key['"]?\s*[:=]\s*['"][A-Za-z0-9]{8,}/);
  });
});