import ca from '../i18n/ca.json';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import type { Lang } from './types';

export const dictionaries = { ca, es, en } as const;
export const langs: Lang[] = ['ca', 'es', 'en'];

export type Dictionary = (typeof dictionaries)[Lang];

export function isLang(value: string | null | undefined): value is Lang {
  return value === 'ca' || value === 'es' || value === 'en';
}

export function detectLang(stored: string | null | undefined, navigatorLanguage?: string): Lang {
  if (isLang(stored)) return stored;
  const tag = (navigatorLanguage ?? '').toLowerCase();
  if (tag.startsWith('ca')) return 'ca';
  if (tag.startsWith('es')) return 'es';
  if (tag.startsWith('en')) return 'en';
  return 'en';
}
