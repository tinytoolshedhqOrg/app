import { COUNTDOWN_CLIPS, type CountdownClipId } from '../player/countdown';

/**
 * Offline countdown clips for the only app UI locale (zh-Hant).
 * These files are silent placeholders until scripts/generate-countdown.py
 * replaces them with zh-TW-HsiaoYuNeural speech. See assets/countdown/README.md.
 */
const assets: Record<CountdownClipId, number> = {
  '3': require('../../assets/countdown/zh-Hant/3.placeholder.mp3'),
  '2': require('../../assets/countdown/zh-Hant/2.placeholder.mp3'),
  '1': require('../../assets/countdown/zh-Hant/1.placeholder.mp3'),
  start: require('../../assets/countdown/zh-Hant/start.placeholder.mp3'),
};

export function countdownAsset(id: CountdownClipId): number {
  return assets[id];
}

export function resolveCountdownPlay(
  playId: string,
): { asset: number; maxDurationSeconds: number } | undefined {
  const prefix = 'countdown:';
  if (!playId.startsWith(prefix)) return undefined;
  const id = playId.slice(prefix.length) as CountdownClipId;
  const clip = COUNTDOWN_CLIPS[id];
  const asset = assets[id];
  if (!clip || asset == null) return undefined;
  return { asset, maxDurationSeconds: clip.maxDurationSeconds };
}
