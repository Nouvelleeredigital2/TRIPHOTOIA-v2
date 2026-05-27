import { useCallback } from 'react';
import toast from 'react-hot-toast';

export function useErrorHandler() {
  const handleError = useCallback((error: Error, context?: string) => {
    console.error(`Error${context ? ` in ${context}` : ''}:`, error);

    const message = error.message || 'Une erreur inattendue survient';
    toast.error(message);
  }, []);

  const handleAsyncError = useCallback(
    async <T>(asyncFn: () => Promise<T>, context?: string): Promise<T> => {
      try {
        return await asyncFn();
      } catch (error) {
        handleError(error as Error, context);
        throw error;
      }
    },
    [handleError]
  );

  return {
    handleError,
    handleAsyncError,
  };
}
