import React from 'react';
import { ExportFilterMode } from '../exportSelection';

export type FilterMode = ExportFilterMode;

interface FilterPreset {
  label: string;
  mode: FilterMode;
  minRating?: number;
}

const PRESETS: FilterPreset[] = [
  { label: 'Tout',      mode: 'all' },
  { label: 'Favorites', mode: 'favorites-only' },
  { label: '🎯 Picks',  mode: 'picks-only' },
  { label: '≥ 3★',     mode: 'min-rating', minRating: 3 },
  { label: '≥ 4★',     mode: 'min-rating', minRating: 4 },
  { label: '≥ 5★',     mode: 'min-rating', minRating: 5 },
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
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
              isActive(preset)
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
            }`}
          >
            {preset.label}
          </button>
        ))}

        {/* Toggle rejetées */}
        <button
          type="button"
          onClick={() => onIncludeRejectedChange(!includeRejected)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
            !includeRejected
              ? 'bg-destructive/10 text-destructive border-destructive/30'
              : 'bg-background text-muted-foreground border-border hover:border-destructive/40'
          }`}
        >
          {includeRejected ? '❌ Incluses' : '❌ Exclues'}
        </button>
      </div>

      {/* Compteur résultat */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Résultat :</span>
        <span className="font-semibold text-foreground tabular-nums">{count}</span>
        <span className="text-muted-foreground">photo{count > 1 ? 's' : ''} à exporter</span>
        {count === 0 && (
          <span className="text-destructive text-xs ml-1">⚠ Aucune photo ne correspond</span>
        )}
      </div>
    </div>
  );
}
