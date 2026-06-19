/**
 * export-presets.ts — Gestion des presets d'export (localStorage).
 *
 * Chaque preset enregistre la totalité de ExportFormData sous un nom donné.
 * Pas d'IDB : les presets sont petits et n'ont pas de dépendance sur les photos.
 */

import { ExportFormData } from '../features/export/exportTypes';

const STORAGE_KEY = 'treephoto-export-presets';

export interface ExportPreset {
  id: string;
  name: string;
  data: ExportFormData;
  createdAt: string;
}

function genId(): string {
  const c = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const buf = new Uint32Array(2);
    c.getRandomValues(buf);
    return `${buf[0].toString(36)}-${buf[1].toString(36)}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadPresets(): ExportPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ExportPreset[];
  } catch {
    return [];
  }
}

function savePresets(presets: ExportPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    console.warn('[export-presets] sauvegarde impossible');
  }
}

export function createPreset(name: string, data: ExportFormData): ExportPreset {
  const presets = loadPresets();
  const preset: ExportPreset = {
    id: genId(),
    name: name.trim() || 'Sans nom',
    data,
    createdAt: new Date().toISOString(),
  };
  presets.push(preset);
  savePresets(presets);
  return preset;
}

export function deletePreset(id: string): void {
  const presets = loadPresets().filter((p) => p.id !== id);
  savePresets(presets);
}

export function updatePreset(id: string, data: ExportFormData): void {
  const presets = loadPresets().map((p) => p.id === id ? { ...p, data } : p);
  savePresets(presets);
}
