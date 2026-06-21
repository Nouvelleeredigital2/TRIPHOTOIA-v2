import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type AiErrorSource = 'analysis' | 'retouch' | 'ingestion' | 'general';
export type AiErrorSeverity = 'info' | 'warning' | 'error';
export type AiErrorStatus = 'new' | 'notified' | 'resolved';

export interface AiError {
  id: string;
  message: string;
  source: AiErrorSource;
  severity: AiErrorSeverity;
  timestamp: number;
  photoId?: string;
  details?: unknown;
  status: AiErrorStatus;
  hint?: string;
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};

interface AiErrorState {
  errors: AiError[];
  pushError: (
    error: Omit<AiError, 'id' | 'timestamp' | 'status'> & {
      id?: string;
      timestamp?: number;
      status?: AiErrorStatus;
    }
  ) => AiError;
  markAsNotified: (id: string) => void;
  resolveError: (id: string) => void;
  resolveErrorsForPhoto: (photoId: string, source?: AiErrorSource) => void;
  clearError: (id: string) => void;
  clearAll: () => void;
}

export const useAiErrorStore = create<AiErrorState>()(
  devtools(
    immer((set) => ({
      errors: [],
      pushError: (error) => {
        const aiError: AiError = {
          ...error,
          id: error.id ?? generateId(),
          timestamp: error.timestamp ?? Date.now(),
          status: error.status ?? 'new',
          severity: error.severity ?? 'error',
        };
        set((state) => {
          state.errors.unshift(aiError);
          if (state.errors.length > 100) {
            state.errors = state.errors.slice(0, 100);
          }
        });
        return aiError;
      },
      markAsNotified: (id) => {
        set((state) => {
          const target = state.errors.find((error) => error.id === id);
          if (target) {
            target.status = 'notified';
          }
        });
      },
      resolveError: (id) => {
        set((state) => {
          const target = state.errors.find((error) => error.id === id);
          if (target) {
            target.status = 'resolved';
          }
        });
      },
      resolveErrorsForPhoto: (photoId, source) => {
        set((state) => {
          state.errors = state.errors.map((error) => {
            if (error.photoId !== photoId) {
              return error;
            }
            if (source && error.source !== source) {
              return error;
            }
            return { ...error, status: 'resolved' };
          });
        });
      },
      clearError: (id) => {
        set((state) => {
          state.errors = state.errors.filter((error) => error.id !== id);
        });
      },
      clearAll: () => {
        set((state) => {
          state.errors = [];
        });
      },
    })),
    { name: 'AiErrorStore' }
  )
);
