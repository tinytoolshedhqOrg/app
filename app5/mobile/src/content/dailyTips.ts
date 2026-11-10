import catalog from './dailyTips.json';
import { SUPPORTED_UI_LOCALES, type AppLocale } from '../i18n';

export type TipCategory =
  | 'stretching'
  | 'sedentary_breaks'
  | 'mobility'
  | 'general_physical_activity'
  | 'safe_exercise'
  | 'posture';

export type TipContext = 'strength_training';

export type DailyTip = {
  id: string;
  title: string;
  category: TipCategory;
  sentences: Record<AppLocale, [string]>;
  sourceId: string;
  provenance: string;
  context: TipContext[];
};

export type DailyTipSource = {
  id: string;
  institution: string;
  title: string;
  url: string;
  pageDate: string;
  reviewedDate: string;
  updatedDate: string;
  nextReview: string;
  dateNote: string;
  accessDate: string;
};

const tips = catalog.tips as DailyTip[];
const sources = catalog.sources as Record<string, DailyTipSource>;

export const DAILY_TIP_IDS: readonly string[] = catalog.ids;
export const DAILY_TIP_ACCESS_DATE = catalog.accessDate;

const byId = new Map(tips.map((tip) => [tip.id, tip]));

export function listDailyTips(): readonly DailyTip[] {
  return tips;
}

export function getDailyTip(id: string): DailyTip | undefined {
  return byId.get(id);
}

export function getDailyTipSource(sourceId: string): DailyTipSource | undefined {
  return sources[sourceId];
}

export function tipSentences(id: string, locale: string): [string] | undefined {
  const tip = byId.get(id);
  if (!tip) return undefined;
  const supported = (SUPPORTED_UI_LOCALES as readonly string[]).includes(locale)
    ? (locale as AppLocale)
    : SUPPORTED_UI_LOCALES[0];
  return tip.sentences[supported];
}
