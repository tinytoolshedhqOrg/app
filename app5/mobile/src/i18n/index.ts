import * as Localization from 'expo-localization';
import zhHant from '../../languages/zh-Hant.json';

type Dict = typeof zhHant;

/** In-app UI dictionaries. iOS photo-permission strings are not app UI locales. */
export const SUPPORTED_UI_LOCALES = ['zh-Hant'] as const;
export type AppLocale = (typeof SUPPORTED_UI_LOCALES)[number];

let current: Dict = zhHant;

export function initializeI18n(): void {
  void Localization;
  current = zhHant;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const raw = get(current, key) ?? key;
  return format(typeof raw === 'string' ? raw : String(raw ?? key), params);
}

function format(raw: string, params?: Record<string, string | number>): string {
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : ''));
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}
