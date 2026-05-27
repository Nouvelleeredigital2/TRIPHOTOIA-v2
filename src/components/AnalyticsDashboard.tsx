import React from 'react';

interface AnalyticsDashboardProps {
  open: boolean;
  onClose: () => void;
}

export function AnalyticsDashboard({ open, onClose }: AnalyticsDashboardProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-foreground">Analytics cloud</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Fermer
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Les statistiques cloud seront activees avec le socle Supabase.
        </p>
      </div>
    </div>
  );
}
