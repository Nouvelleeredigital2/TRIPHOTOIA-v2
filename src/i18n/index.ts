import { useSyncExternalStore } from 'react';
import {
  DEFAULT_LANG,
  DICTIONARIES,
  fr,
  type Lang,
  type TranslationKey,
} from './dictionaries';

// i18n minimal sans dépendance ni provider : un petit store de langue
// (persisté) + une fonction `t()` utilisable partout, y compris hors React.
// `useT()` réabonne les composants au changement de langue.

const STORAGE_KEY = 'treephoto-lang';
const listeners = new Set<() => void>();

const readInitialLang = (): Lang => {
  if (typeof localStorage === 'undefined') return DEFAULT_LANG;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'fr' || saved === 'en' ? saved : DEFAULT_LANG;
};

let currentLang: Lang = readInitialLang();

export const getLanguage = (): Lang => currentLang;

export const setLanguage = (lang: Lang): void => {
  if (lang === currentLang) return;
  currentLang = lang;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lang);
  }
  listeners.forEach((l) => l());
};

const interpolate = (
  str: string,
  vars?: Record<string, string | number>
): string => {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`
  );
};

/**
 * Traduit une clé dans la langue courante. Fallback : langue courante →
 * français (référence) → la clé elle-même (jamais d'écran vide).
 */
export const t = (
  key: TranslationKey,
  vars?: Record<string, string | number>
): string => {
  const value = DICTIONARIES[currentLang]?.[key] ?? fr[key] ?? key;
  return interpolate(value, vars);
};

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Hook React : renvoie `t`, la langue courante et le setter. */
export const useT = (): {
  t: typeof t;
  lang: Lang;
  setLanguage: typeof setLanguage;
} => {
  const lang = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  return { t, lang, setLanguage };
};

export type { Lang, TranslationKey };
