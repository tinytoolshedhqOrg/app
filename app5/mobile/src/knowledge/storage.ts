import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAILY_TIP_IDS } from '../content/dailyTips';
import { civilDate, deviceTimeZone } from './localDate';
import { presentDailyTip, type DailyTipRecord } from './schedule';

export const DAILY_TIP_KEY = 'stretch/daily-tip/v1';

export async function readDailyTipRecord(): Promise<DailyTipRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_TIP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DailyTipRecord;
  } catch {
    return null;
  }
}

export async function saveDailyTipRecord(record: DailyTipRecord): Promise<void> {
  await AsyncStorage.setItem(DAILY_TIP_KEY, JSON.stringify(record));
}

export async function showDailyTip(
  today = civilDate(new Date(), deviceTimeZone()),
  random: () => number = Math.random,
): Promise<{ record: DailyTipRecord; tipId: string }> {
  const stored = await readDailyTipRecord();
  const record = presentDailyTip(stored, today, DAILY_TIP_IDS, random);
  if (JSON.stringify(record) !== JSON.stringify(stored)) await saveDailyTipRecord(record);
  return { record, tipId: record.order[record.index] };
}
