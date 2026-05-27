import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAiErrorStore } from '../store/aiErrorStore';

export const useAiErrorNotifications = () => {
  const errors = useAiErrorStore((state) => state.errors);
  const markAsNotified = useAiErrorStore((state) => state.markAsNotified);

  useEffect(() => {
    if (errors.length === 0) {
      return;
    }

    errors
      .filter((error) => error.status === 'new')
      .forEach((error) => {
        if (error.severity === 'info') {
          toast.success(error.message, { id: error.id });
        } else if (error.severity === 'warning') {
          toast.loading(error.message, { id: error.id, duration: 4000 });
        } else {
          toast.error(error.message, { id: error.id });
        }

        markAsNotified(error.id);
      });
  }, [errors, markAsNotified]);
};
