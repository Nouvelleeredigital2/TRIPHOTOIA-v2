/**
 * useAccentColor — persists and applies a custom accent hue to the CSS token system.
 * Each accent replaces --primary, --ring, --info and updates the secondary shades
 * so every component using Tailwind's `bg-primary` / `text-primary` etc. picks it up.
 */
import { useState, useEffect } from 'react';

export interface AccentOption {
  id: string;
  label: string;
  /** HSL hue value (0-360) */
  hue: number;
  /** Preview hex colour for the swatch */
  hex: string;
}

export const ACCENT_OPTIONS: AccentOption[] = [
  { id: 'violet',  label: 'Violet (défaut)', hue: 262, hex: '#8b5cf6' },
  { id: 'blue',    label: 'Bleu',            hue: 217, hex: '#3b82f6' },
  { id: 'cyan',    label: 'Cyan',            hue: 188, hex: '#06b6d4' },
  { id: 'green',   label: 'Vert',            hue: 142, hex: '#22c55e' },
  { id: 'orange',  label: 'Orange',          hue: 25,  hex: '#f97316' },
  { id: 'rose',    label: 'Rose',            hue: 346, hex: '#f43f5e' },
  { id: 'amber',   label: 'Ambre',           hue: 38,  hex: '#f59e0b' },
];

const STORAGE_KEY = 'triphotoia-accent';
const DEFAULT_ACCENT = 'violet';

function applyAccent(hue: number) {
  const r = document.documentElement;
  // Light mode primaries
  r.style.setProperty('--primary',              `${hue} 83% 58%`);
  r.style.setProperty('--primary-foreground',   '0 0% 100%');
  r.style.setProperty('--secondary',            `${hue} 30% 95%`);
  r.style.setProperty('--secondary-foreground', `${hue} 50% 30%`);
  r.style.setProperty('--accent',               `${hue} 83% 58%`);
  r.style.setProperty('--accent-foreground',    '0 0% 100%');
  r.style.setProperty('--ring',                 `${hue} 83% 58%`);
  r.style.setProperty('--info',                 `${hue} 83% 58%`);
  r.style.setProperty('--info-foreground',      '0 0% 100%');
}

export function useAccentColor() {
  const [accentId, setAccentId] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_ACCENT;
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_ACCENT;
  });

  useEffect(() => {
    const option = ACCENT_OPTIONS.find((o) => o.id === accentId) ?? ACCENT_OPTIONS[0];
    applyAccent(option.hue);
    localStorage.setItem(STORAGE_KEY, accentId);
  }, [accentId]);

  return {
    accentId,
    setAccentId,
    options: ACCENT_OPTIONS,
    current: ACCENT_OPTIONS.find((o) => o.id === accentId) ?? ACCENT_OPTIONS[0],
  };
}
