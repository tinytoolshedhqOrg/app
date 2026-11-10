import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAILY_TIP_IDS } from '../content/dailyTips';
import { civilDate, deviceTimeZone } from './localDate';
import { presentDailyTip, type DailyTipRecord } from './schedule';

export const DAILY_TIP_KEY = 'stretch/daily-tip/v1';

// The original IDs of the retained tips, in the order they were renumbered.
const LEGACY_TIP_IDS = [
  '004', '005', '007', '012', '014', '015', '017', '020', '021', '023', '025',
  '028', '029', '039', '040', '042', '043', '045', '050', '051', '052', '053',
  '056', '060', '064', '065', '067', '068', '069', '070', '071', '072', '073',
  '074', '076', '080', '084', '089', '090', '093', '094', '098',
];
const newIdByLegacyId = new Map(LEGACY_TIP_IDS.map((id, index) => [id, String(index + 1)]));

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
  // Leave retired IDs in place so the scheduler can adjust the saved index.
  const renumbered = stored && Array.isArray(stored.order)
    ? { ...stored, order: stored.order.map((id) => newIdByLegacyId.get(id) ?? id) }
    : stored;
  const record = presentDailyTip(renumbered, today, DAILY_TIP_IDS, random);
  if (JSON.stringify(record) !== JSON.stringify(stored)) await saveDailyTipRecord(record);
  return { record, tipId: record.order[record.index] };
}
