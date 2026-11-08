import type { AudioPlayer } from 'expo-audio';
import { createCueAudioService } from '../src/audio/cues';
import { cueAssets, exerciseLibrary } from '../src/content/exercise-index';

describe('local voice clips', () => {
 const cue = exerciseLibrary[0].voice_cues[0];
 const originalAsset = cueAssets[cue.id];
 const makePlayer = () => ({ pause: jest.fn(), play: jest.fn(), replace: jest.fn() });
 beforeEach(() => { delete cueAssets[cue.id]; jest.useFakeTimers(); });
 afterEach(() => {
  if (originalAsset === undefined) delete cueAssets[cue.id];
  else cueAssets[cue.id] = originalAsset;
  jest.useRealTimers();
 });
 it('plays a bundled standing cue through the local audio player', async () => {
  const standingCue = exerciseLibrary.find((e) => e.id === 'stand_neck_turn')!.voice_cues[0];
  const asset = standingCue.id === cue.id ? originalAsset : cueAssets[standingCue.id];
  expect(asset).toBeDefined();
  if (standingCue.id === cue.id) cueAssets[cue.id] = originalAsset;
  const player = makePlayer();
  const audio = createCueAudioService(player as unknown as AudioPlayer, jest.fn());
  await audio.playAt(standingCue.id);
  expect(player.replace).toHaveBeenCalledWith(asset);
  expect(player.play).toHaveBeenCalledTimes(1);
  await audio.stopAll();
 });
 it('keeps a missing clip silent for text-only guidance', async () => {
  const player = makePlayer();
  const audio = createCueAudioService(player as unknown as AudioPlayer, jest.fn());
  await audio.playAt(cue.id);
  expect(player.play).not.toHaveBeenCalled();
 });
 it('pauses and resumes within the cue budget, then stops on a transition', async () => {
  cueAssets[cue.id] = 42;
  const player = makePlayer();
  const audio = createCueAudioService(player as unknown as AudioPlayer, jest.fn());
  await audio.playAt(cue.id);
  expect(player.replace).toHaveBeenCalledWith(42);
  jest.advanceTimersByTime(1000);
  audio.pause();
  jest.advanceTimersByTime(15000);
  audio.resume();
  expect(player.play).toHaveBeenCalledTimes(2);
  await audio.stopAll();
  audio.resume();
  expect(player.play).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
 });
 it('stops a clip at its budget and respects mute', async () => {
  cueAssets[cue.id] = 42;
  const player = makePlayer();
  const audio = createCueAudioService(player as unknown as AudioPlayer, jest.fn());
  await audio.playAt(cue.id);
  const count=player.pause.mock.calls.length;
  jest.advanceTimersByTime(cue.max_duration_seconds * 1000);
  expect(player.pause.mock.calls.length).toBeGreaterThan(count);
  audio.setMuted(true);
  await audio.playAt(cue.id);
  expect(player.play).toHaveBeenCalledTimes(1);
 });
 it('cancels pending cue timers after the native player has been released', async () => {
  cueAssets[cue.id] = 42;
  const player = makePlayer();
  const audio = createCueAudioService(player as unknown as AudioPlayer, jest.fn());
  await audio.playAt(cue.id);
  player.pause.mockImplementation(() => { throw new Error('Native shared object already released'); });
  expect(() => audio.dispose()).not.toThrow();
  expect(jest.getTimerCount()).toBe(0);
  expect(() => jest.advanceTimersByTime(10000)).not.toThrow();
 });
});
