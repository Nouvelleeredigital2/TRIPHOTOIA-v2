import React from 'react';
import { ExportFilterMode } from '../exportSelection';

export type FilterMode = ExportFilterMode;

interface FilterPreset {
  label: string;
  mode: FilterMode;
  minRating?: number;
}

const PRESETS: FilterPreset[] = [
  { label: 'Tout', mode: 'all' },
  { label: 'Favorites', mode: 'favorites-only' },
  { label: '🎯 Picks', mode: 'picks-only' },
  { label: '≥ 3★', mode: 'min-rating', minRating: 3 },
  { label: '≥ 4★', mode: 'min-rating', minRating: 4 },
  { label: '≥ 5★', mode: 'min-rating', minRating: 5 },
];

interface ExportFilterBarProps {
  mode: FilterMode;
  minRating: number;
  includeRejected: boolean;
  count: number;
  onModeChange: (mode: FilterMode, minRating?: number) => void;
  onIncludeRejectedChange: (value: boolean) => void;
}

export function ExportFilterBar({
  mode,
  minRating,
  includeRejected,
  count,
  onModeChange,
  onIncludeRejectedChange,
}: ExportFilterBarProps) {
  const isActive = (preset: FilterPreset) => {
    if (preset.mode !== mode) return false;
    if (preset.mode === 'min-rating') return preset.minRating === minRating;
    return true;
  };

  return (
    <div className="space-y-3">
      {/* Pill buttons */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onModeChange(preset.mode, preset.minRating)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
              isActive(preset)
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
            }`}
          >
            {preset.label}
          </button>
        ))}

        {/* Toggle rejetées */}
        <button
          type="button"
          onClick={() => onIncludeRejectedChange(!includeRejected)}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
            !includeRejected
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-border bg-background text-muted-foreground hover:border-destructive/40'
          }`}
        >
          {includeRejected ? '❌ Incluses' : '❌ Exclues'}
        </button>
      </div>

      {/* Compteur résultat */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Résultat :</span>
        <span className="font-semibold tabular-nums text-foreground">
          {count}
        </span>
        <span className="text-muted-foreground">
          photo{count > 1 ? 's' : ''} à exporter
        </span>
        {count === 0 && (
          <span className="ml-1 text-xs text-destructive">
            ⚠ Aucune photo ne correspond
          </span>
        )}
      </div>
    </div>
  );
}
