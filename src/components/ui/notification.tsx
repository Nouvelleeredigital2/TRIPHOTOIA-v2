import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface NotificationProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  onClose?: () => void;
  duration?: number;
}

const typeStyles = {
  success: 'bg-green-500 text-white',
  error: 'bg-red-500 text-white',
  warning: 'bg-yellow-500 text-black',
  info: 'bg-blue-500 text-white',
};

const typeIcons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export function Notification({
  type,
  title,
  message,
  onClose,
  duration = 4000,
}: NotificationProps) {
  React.useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [duration, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'fixed right-4 top-4 z-50 w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg',
        typeStyles[type]
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-lg">{typeIcons[type]}</div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold">{title}</h4>
          {message && <p className="mt-1 text-sm opacity-90">{message}</p>}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 text-lg opacity-70 transition-opacity hover:opacity-100"
          >
            ×
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function NotificationContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed right-4 top-4 z-50 space-y-2">
      <AnimatePresence>{children}</AnimatePresence>
    </div>
  );
}
