import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { COUNTDOWN_CLIPS } from '../src/player/countdown';

const dir = path.join(__dirname, '../assets/countdown/zh-Hant');
const measured: Record<'3' | '2' | '1' | 'start', number> = {
  '3': 0.576,
  '2': 0.408,
  '1': 0.408,
  start: 0.744,
};

describe('countdown clips', () => {
  it('bundles trimmed HsiaoYu zh-Hant speech inside each countdown slot', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const readme = fs.readFileSync(path.join(dir, '../README.md'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '../scripts/generate-countdown.py'), 'utf8');
    expect(manifest.locale).toBe('zh-Hant');
    expect(manifest.voice).toBe('zh-TW-HsiaoYuNeural');
    expect(manifest.status).toBe('ready');
    expect(manifest.placeholder).toBe(false);
    expect(manifest.clips.map((clip: { token: string }) => clip.token)).toEqual(['3', '2', '1', 'start']);
    for (const clip of manifest.clips) {
      const token = clip.token as '3' | '2' | '1' | 'start';
      expect(COUNTDOWN_CLIPS[token].text).toBe(clip.text);
      expect(COUNTDOWN_CLIPS[token].maxDurationSeconds).toBe(clip.max_duration_seconds);
      expect(clip.file).toBe(`${token}.mp3`);
      expect(clip.over_limit).toBe(false);
      expect(clip.measured_duration_seconds).toBe(measured[token]);
      expect(clip.measured_duration_seconds).toBeLessThanOrEqual(clip.max_duration_seconds);
      const file = path.join(dir, clip.file);
      const bytes = fs.readFileSync(file);
      expect(bytes.length).toBeGreaterThan(100);
      expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(clip.sha256);
    }
    expect(readme).toMatch(/HsiaoYu/);
    expect(readme).toMatch(/silenceremove/);
    expect(script).toMatch(/zh-TW-HsiaoYuNeural/);
    expect(script).toMatch(/silenceremove=start_periods=1:start_threshold=-50dB:stop_periods=-1/);
    expect(script).not.toMatch(/AZURE_SPEECH_KEY\s*=\s*['"][A-Za-z0-9]/);
    expect(script).not.toMatch(/Ocp-Apim-Subscription-Key['"]?\s*[:=]\s*['"][A-Za-z0-9]{8,}/);
  });
});
