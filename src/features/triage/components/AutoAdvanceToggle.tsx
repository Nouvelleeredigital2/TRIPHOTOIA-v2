import React from 'react';
import { SkipForward } from 'lucide-react';

interface AutoAdvanceToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function AutoAdvanceToggle({ enabled, onToggle }: AutoAdvanceToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={enabled ? 'Auto-avance activée — cliquer pour désactiver (Caps Lock)' : 'Activer l\'auto-avance après chaque action (Caps Lock)'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all select-none ${
        enabled
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
      }`}
    >
      <SkipForward className="w-3.5 h-3.5" />
      Auto {enabled ? 'ON' : 'OFF'}
    </button>
  );
}
