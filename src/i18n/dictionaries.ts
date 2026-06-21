// Dictionnaires i18n. Clés plates `domaine.cle`. Le français est la langue de
// référence (clés exhaustives) ; l'anglais peut être partiel (fallback sur fr).

export type Lang = 'fr' | 'en';

export const DEFAULT_LANG: Lang = 'fr';

export const fr = {
  'nav.import': 'Import',
  'nav.triage': 'Triage',
  'nav.export': 'Export',
  'header.cloud': 'Se connecter au cloud',
  'header.shortcuts': 'Raccourcis clavier (?)',
  'header.themeLight': 'Mode clair',
  'header.themeDark': 'Mode sombre',
  'header.accent': "Couleur d'accent",
  'header.language': 'Langue',
} as const;

export type TranslationKey = keyof typeof fr;

export const en: Partial<Record<TranslationKey, string>> = {
  'nav.import': 'Import',
  'nav.triage': 'Cull',
  'nav.export': 'Export',
  'header.cloud': 'Sign in to cloud',
  'header.shortcuts': 'Keyboard shortcuts (?)',
  'header.themeLight': 'Light mode',
  'header.themeDark': 'Dark mode',
  'header.accent': 'Accent color',
  'header.language': 'Language',
};

export const DICTIONARIES: Record<Lang, Partial<Record<TranslationKey, string>>> = {
  fr,
  en,
};
