import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RetouchPreset, RetouchOptions } from '../types';
import { BUILT_IN_PRESETS } from '../lib/builtInPresets';

interface PresetsState {
  /** Presets créés par l'utilisateur (persistés en localStorage) */
  userPresets: RetouchPreset[];

  /** Retourne tous les presets : built-in d'abord, puis user */
  getAllPresets: () => RetouchPreset[];

  /**
   * Sauvegarde les options actuelles sous un nouveau preset utilisateur.
   * Retourne l'id du preset créé.
   */
  savePreset: (name: string, options: RetouchOptions) => string;

  /** Supprime un preset utilisateur (les built-in sont ignorés) */
  deletePreset: (id: string) => void;

  /** Renomme un preset utilisateur */
  renamePreset: (id: string, newName: string) => void;
}

export const usePresetsStore = create<PresetsState>()(
  persist(
    (set, get) => ({
      userPresets: [],

      getAllPresets: () => [...BUILT_IN_PRESETS, ...get().userPresets],

      savePreset: (name, options) => {
        const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const preset: RetouchPreset = {
          id,
          name: name.trim() || 'Mon preset',
          options: { ...options },
          createdAt: new Date().toISOString(),
          isBuiltIn: false,
        };
        set((state) => ({ userPresets: [...state.userPresets, preset] }));
        return id;
      },

      deletePreset: (id) => {
        set((state) => ({
          userPresets: state.userPresets.filter((p) => p.id !== id),
        }));
      },

      renamePreset: (id, newName) => {
        set((state) => ({
          userPresets: state.userPresets.map((p) =>
            p.id === id ? { ...p, name: newName.trim() || p.name } : p
          ),
        }));
      },
    }),
    {
      name: 'treephoto-presets',
      partialize: (state) => ({ userPresets: state.userPresets }),
    }
  )
);
