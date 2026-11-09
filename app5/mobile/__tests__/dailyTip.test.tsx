import fs from 'fs';
import path from 'path';
import React from 'react';
import { Linking, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Completion from '../src/components/Completion';
import DailyTipCard, { DailyTipBody } from '../src/components/DailyTipCard';
import {
  DAILY_TIP_IDS,
  getDailyTip,
  getDailyTipSource,
  listDailyTips,
  tipSentences,
} from '../src/content/dailyTips';
import { SUPPORTED_UI_LOCALES } from '../src/i18n';
import { civilDate } from '../src/knowledge/localDate';
import { presentDailyTip, shuffleIds, type DailyTipRecord } from '../src/knowledge/schedule';
import { DAILY_TIP_KEY, showDailyTip } from '../src/knowledge/storage';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const zero = () => 0;

function day(n: number): string {
  const date = new Date(Date.UTC(2026, 0, n));
  return date.toISOString().slice(0, 10);
}

describe('daily tip catalog', () => {
  it('keeps exactly the screened 60 ids in zh-Hant, with two sentences each', () => {
    expect(SUPPORTED_UI_LOCALES).toEqual(['zh-Hant']);
    expect(DAILY_TIP_IDS).toHaveLength(60);
    expect(new Set(DAILY_TIP_IDS).size).toBe(60);
    for (const removed of ['001', '002', '003']) {
      expect(DAILY_TIP_IDS).not.toContain(removed);
    }
    const texts = new Set<string>();
    for (const tip of listDailyTips()) {
      expect(DAILY_TIP_IDS).toContain(tip.id);
      expect(tip.title.length).toBeGreaterThan(0);
      expect(tip.provenance.length).toBeGreaterThan(0);
      const source = getDailyTipSource(tip.sourceId);
      expect(source?.url.startsWith('https://')).toBe(true);
      for (const locale of SUPPORTED_UI_LOCALES) {
        const sentences = tip.sentences[locale];
        expect(sentences).toHaveLength(2);
        expect(sentences[0].endsWith('。')).toBe(true);
        expect(sentences[1].endsWith('。')).toBe(true);
        expect(sentences[0].slice(0, -1)).not.toContain('。');
        expect(sentences[1].slice(0, -1)).not.toContain('。');
        texts.add(sentences[0] + sentences[1]);
      }
      expect(tipSentences(tip.id, 'en')).toEqual(tipSentences(tip.id, 'zh-Hant'));
    }
    expect(texts.size).toBe(60);
  });

  it('keeps the approved wording for source-context and strength tips', () => {
    expect(tipSentences('012', 'zh-Hant')).toEqual([
      '除了大肌群，也伸展這項活動最常使用的肌肉和關節。',
      '頁面把這點寫成已有一些證據，而不是每一種運動都用同一套伸展。',
    ]);
    expect(tipSentences('076', 'zh-Hant')).toEqual([
      '大肌群每週至少練兩天，但不要連續兩天練同一組肌肉。',
      '中間留時間讓肌肉恢復。',
    ]);
    expect(tipSentences('080', 'zh-Hant')).toEqual([
      '練肌力時不要憋氣。',
      '用力的時候吐氣，放鬆的時候吸氣。',
    ]);
    expect(tipSentences('095', 'zh-Hant')).toEqual([
      '運動結束後，可以用大約 5 分鐘的緩和伸展，讓身體慢慢鬆開、心跳緩緩下降。',
      '這套動作大約每個停 15 到 20 秒；有傷、有病或懷孕時，先問物理治療師或醫護人員哪些要改。',
    ]);
    expect(getDailyTip('076')?.context).toContain('strength_training');
    expect(getDailyTip('080')?.context).toContain('strength_training');
    expect(getDailyTip('095')?.context).toContain('external_source');
  });
});

describe('daily tip schedule', () => {
  it('uses the local civil date across a UTC boundary and a DST gap', () => {
    const taipeiEvening = new Date('2026-01-15T16:30:00Z');
    expect(taipeiEvening.toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(civilDate(taipeiEvening, 'Asia/Taipei')).toBe('2026-01-16');

    const beforeSpringForward = new Date('2026-03-08T06:30:00Z');
    const afterSpringForward = new Date('2026-03-08T07:30:00Z');
    expect(civilDate(beforeSpringForward, 'America/New_York')).toBe('2026-03-08');
    expect(civilDate(afterSpringForward, 'America/New_York')).toBe('2026-03-08');

    const beforeFallBack = new Date('2026-11-01T05:30:00Z');
    const afterFallBack = new Date('2026-11-01T06:30:00Z');
    expect(civilDate(beforeFallBack, 'America/New_York')).toBe('2026-11-01');
    expect(civilDate(afterFallBack, 'America/New_York')).toBe('2026-11-01');
  });

  it('shows one tip per displayed day, ignores extra workouts, and skips absent days', () => {
    const ids = ['004', '005', '007'];
    let state = presentDailyTip(null, '2026-04-01', ids, zero);
    const first = state.order[state.index];
    state = presentDailyTip(state, '2026-04-01', ids, zero);
    state = presentDailyTip(state, '2026-04-01', ids, zero);
    expect(state.order[state.index]).toBe(first);
    expect(state.shownOn).toBe('2026-04-01');

    state = presentDailyTip(state, '2026-04-08', ids, zero);
    expect(state.index).toBe(1);
    expect(state.shownOn).toBe('2026-04-08');
    const second = state.order[state.index];
    expect(second).not.toBe(first);
  });

  it('keeps the current tip when the clock moves backwards', () => {
    const ids = ['004', '005', '007'];
    const stored: DailyTipRecord = { order: ids, index: 1, shownOn: '2026-06-10' };
    const rewound = presentDailyTip(stored, '2026-06-08', ids, zero);
    expect(rewound).toEqual(stored);
    const caughtUp = presentDailyTip(rewound, '2026-06-10', ids, zero);
    expect(caughtUp.index).toBe(1);
    const next = presentDailyTip(caughtUp, '2026-06-11', ids, zero);
    expect(next.index).toBe(2);
    expect(next.shownOn).toBe('2026-06-11');
  });

  it('reshuffles only after every retained tip was shown, without repeating the boundary', () => {
    const seen: string[] = [];
    let state: DailyTipRecord | null = null;
    for (let n = 1; n <= DAILY_TIP_IDS.length; n += 1) {
      state = presentDailyTip(state, day(n), DAILY_TIP_IDS, zero);
      seen.push(state.order[state.index]);
    }
    expect(new Set(seen).size).toBe(60);
    expect(seen).toEqual(state!.order);
    const last = seen[seen.length - 1];
    const next = presentDailyTip(state, day(DAILY_TIP_IDS.length + 1), DAILY_TIP_IDS, zero);
    expect(next.index).toBe(0);
    expect(next.order[0]).not.toBe(last);
    expect(new Set(next.order)).toEqual(new Set(DAILY_TIP_IDS));
    const again = presentDailyTip(next, day(DAILY_TIP_IDS.length + 1), DAILY_TIP_IDS, zero);
    expect(again.order[again.index]).toBe(next.order[0]);
  });

  it('builds a permutation and avoids an immediate boundary repeat', () => {
    const ids = ['004', '005', '007', '008'];
    const order = shuffleIds(ids, zero);
    expect(new Set(order)).toEqual(new Set(ids));
    const avoided = shuffleIds(ids, zero, order[0]);
    expect(avoided[0]).not.toBe(order[0]);
    expect(new Set(avoided)).toEqual(new Set(ids));
  });

  it('recovers from corrupt storage and keeps the same tip across a restart', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(DAILY_TIP_KEY, '{');
    const first = await showDailyTip('2026-05-01', zero);
    expect(DAILY_TIP_IDS).toContain(first.tipId);
    expect(first.record.order).toHaveLength(60);

    await AsyncStorage.setItem(DAILY_TIP_KEY, JSON.stringify({
      order: ['004'],
      index: 0,
      shownOn: '2026-02-31',
    }));
    const recovered = await showDailyTip('2026-05-02', zero);
    expect(recovered.record.order).toHaveLength(60);
    expect(new Set(recovered.record.order)).toEqual(new Set(DAILY_TIP_IDS));
    expect(recovered.record.shownOn).toBe('2026-05-02');

    const restarted = await showDailyTip('2026-05-02', zero);
    expect(restarted.tipId).toBe(recovered.tipId);
    expect(restarted.record.index).toBe(recovered.record.index);

    const anotherWorkout = await showDailyTip('2026-05-02', zero);
    expect(anotherWorkout.tipId).toBe(recovered.tipId);

    const nextDay = await showDailyTip('2026-05-09', zero);
    expect(nextDay.tipId).not.toBe(recovered.tipId);
    expect(nextDay.record.index).toBe(recovered.record.index + 1);
  });
});

describe('daily tip card', () => {
  let rendered: ReactTestRenderer | undefined;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await AsyncStorage.clear();
    jest.spyOn(Linking, 'openURL').mockImplementation(async () => true);
  });

  afterEach(async () => {
    if (rendered) await act(async () => rendered!.unmount());
    rendered = undefined;
    jest.restoreAllMocks();
  });

  it('renders only on completion, with a source link and no manual next', async () => {
    const home = fs.readFileSync(path.join(__dirname, '../src/screens/HomeScreen.tsx'), 'utf8');
    const preview = fs.readFileSync(path.join(__dirname, '../src/screens/PreviewScreen.tsx'), 'utf8');
    const completion = fs.readFileSync(path.join(__dirname, '../src/components/Completion.tsx'), 'utf8');
    expect(home).not.toMatch(/DailyTipCard/);
    expect(preview).not.toMatch(/DailyTipCard/);
    expect(completion).toMatch(/DailyTipCard/);

    await act(async () => {
      rendered = create(
        <Completion name="早晨" unitCount={3} onHome={() => undefined} onAgain={() => undefined} />,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const text = JSON.stringify(rendered!.toJSON());
    expect(text).toContain('歐哞！你好棒！');
    expect(text).toContain('今日小知識');
    expect(text).not.toContain('下一則');
    expect(text).not.toContain('換一個');

    const tip = getDailyTip('076');
    expect(tip).toBeTruthy();
    await act(async () => rendered!.unmount());
    await act(async () => {
      rendered = create(<DailyTipBody tip={tip!} />);
    });
    const body = JSON.stringify(rendered!.toJSON());
    expect(body).toContain('這則談的是肌力訓練，不是每天的伸展。');
    expect(body).toContain('大肌群每週至少練兩天，但不要連續兩天練同一組肌肉。');
    expect(body).not.toContain('下一則');

    const link = rendered!.root.findAll(
      (node) => node.props?.accessibilityRole === 'link' && typeof node.props.onPress === 'function',
    )[0];
    await act(async () => {
      link.props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith(getDailyTipSource(tip!.sourceId)!.url);

    await act(async () => rendered!.unmount());
    await act(async () => {
      rendered = create(<DailyTipBody tip={getDailyTip('095')!} />);
    });
    const external = JSON.stringify(rendered!.toJSON());
    expect(external).toContain('文中的「這頁」或「這套」指的是下方來源，不是這個 App 的伸展組合。');
    expect(external).toContain('這套動作大約每個停 15 到 20 秒；有傷、有病或懷孕時，先問物理治療師或醫護人員哪些要改。');
    expect(external).not.toContain('這則談的是肌力訓練');

    await act(async () => rendered!.unmount());
    await act(async () => {
      rendered = create(<DailyTipBody tip={getDailyTip('067')!} />);
    });
    const activity = JSON.stringify(rendered!.toJSON());
    expect(activity).toContain('這則談的是整體身體活動，不是伸展單獨的效果。');
    expect(activity).toContain('一般身體活動');
  });

  it('keeps the same id when the locale lookup changes', async () => {
    const shown = await showDailyTip('2026-08-01', zero);
    expect(tipSentences(shown.tipId, 'zh-Hant')).toEqual(tipSentences(shown.tipId, 'fr'));
    await AsyncStorage.clear();
    await act(async () => {
      rendered = create(<DailyTipCard />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const raw = await AsyncStorage.getItem(DAILY_TIP_KEY);
    const record = JSON.parse(raw!) as DailyTipRecord;
    const sentences = tipSentences(record.order[record.index], 'zh-Hant')!;
    const text = JSON.stringify(rendered!.toJSON());
    expect(text).toContain(sentences[0]);
    expect(text).toContain(sentences[1]);
    expect(rendered!.root.findAllByType(Text).some((node) => node.props.children === '今日小知識')).toBe(true);
  });
});
