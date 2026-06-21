import { SkipForward } from 'lucide-react';

interface AutoAdvanceToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function AutoAdvanceToggle({
  enabled,
  onToggle,
}: AutoAdvanceToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={
        enabled
          ? 'Auto-avance activée — cliquer pour désactiver (Caps Lock)'
          : "Activer l'auto-avance après chaque action (Caps Lock)"
      }
      className={`flex select-none items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
        enabled
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
      }`}
    >
      <SkipForward className="h-3.5 w-3.5" />
      Auto {enabled ? 'ON' : 'OFF'}
    </button>
  );
}
