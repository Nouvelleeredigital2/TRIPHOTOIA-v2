import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  syncStatus: SyncStatus;
  setSyncStatus: (status: SyncStatus) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  _init: () => () => void; // returns cleanup function
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  syncStatus: 'idle',

  setSyncStatus: (status) => set({ syncStatus: status }),

  signIn: async (email, password) => {
    if (!supabase) throw new Error('Supabase non configuré');
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  },

  signUp: async (email, password) => {
    if (!supabase) throw new Error('Supabase non configuré');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ user: null, session: null, syncStatus: 'idle' });
  },

  _init: () => {
    if (!supabase) {
      set({ loading: false });
      return () => {};
    }

    // Charger la session existante
    supabase.auth.getSession().then(({ data }) => {
      set({
        user: data.session?.user ?? null,
        session: data.session ?? null,
        loading: false,
      });
    });

    // Écouter les changements d'état auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        user: session?.user ?? null,
        session: session ?? null,
        loading: false,
      });
    });

    return () => subscription.unsubscribe();
  },
}));
