import React, { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { ColorLabel, COLOR_LABEL_META, COLOR_LABEL_KEYS } from '../../../types';

type FilterType = string; // 'all' | 'duplicates' | 'rejected' | 'selected' | 'blurry' | 'picks' | `color:${ColorLabel}` | `stars:${number}`

interface FilterBarProps {
  totalPhotos: number;
  duplicateGroups: number;
  rejectedCount: number;
  selectedCount: number;
  blurryCount: number;
  picksCount: number;
  favoritesCount: number;
  reviewCount: number;
  errorsCount: number;
  colorCounts: Record<ColorLabel, number>;
  activeFilter: FilterType;
  searchTerm: string;
  dateFrom: string;
  dateTo: string;
  onFilterChange: (filter: FilterType) => void;
  onSearchChange: (term: string) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
}

const STAR_FILTERS = [5, 4, 3, 2, 1] as const;

export function FilterBar({
  totalPhotos,
  duplicateGroups,
  rejectedCount,
  selectedCount,
  blurryCount,
  picksCount,
  favoritesCount,
  reviewCount,
  errorsCount,
  colorCounts,
  activeFilter,
  searchTerm,
  dateFrom,
  dateTo,
  onFilterChange,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
}: FilterBarProps) {
  const [starsOpen, setStarsOpen] = useState(false);
  const starsRef = useRef<HTMLDivElement>(null);

  // Close stars popover on click outside
  useEffect(() => {
    if (!starsOpen) return undefined;
    const handler = (e: MouseEvent) => {
      if (starsRef.current && !starsRef.current.contains(e.target as Node)) {
        setStarsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [starsOpen]);

  const btn = (
    id: FilterType,
    label: React.ReactNode,
    count?: number,
    extra?: string
  ) => (
    <Button
      key={String(id)}
      variant={activeFilter === id ? 'default' : 'outline'}
      size="sm"
      onClick={() => onFilterChange(id)}
      className={`gap-1.5 ${extra ?? ''}`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <Badge
          variant={activeFilter === id ? 'secondary' : 'outline'}
          className="h-4 min-w-[1.25rem] px-1 text-xs"
        >
          {count}
        </Badge>
      )}
    </Button>
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-muted/40 p-3">
      {/* Ligne 1 : Recherche */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Nom, tag, appareil, objectif, ISO, date…"
          className="h-8 pl-8 pr-8 text-sm"
        />
        {searchTerm && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => onSearchChange('')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Ligne 1b : Plage de dates */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Date :</span>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="h-8 w-[150px] text-xs"
          aria-label="Date de début"
        />
        <span className="text-xs text-muted-foreground">à</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="h-8 w-[150px] text-xs"
          aria-label="Date de fin"
        />
        {(dateFrom || dateTo) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              onDateFromChange('');
              onDateToChange('');
            }}
          >
            Effacer
          </Button>
        )}
      </div>

      {/* Ligne 2 : Filtres principaux */}
      <div className="flex flex-wrap gap-1.5">
        {btn('all', 'Toutes', totalPhotos)}
        {btn('favorites', 'Favorites', favoritesCount)}
        {btn('review', 'A revoir', reviewCount)}
        {btn('picks', '🎯 Picks', picksCount)}

        {/* Filtre ≥N★ avec popover */}
        <div className="relative" ref={starsRef}>
          <Button
            variant={activeFilter.startsWith('stars:') ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setStarsOpen((v) => !v)}
          >
            ⭐ Notes
            {activeFilter.startsWith('stars:') && (
              <Badge variant="secondary" className="h-4 px-1 text-xs">
                ≥{activeFilter.slice(6)}★
              </Badge>
            )}
          </Button>
          {starsOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 flex gap-1 rounded-xl border border-border bg-card p-2 shadow-xl">
              {STAR_FILTERS.map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    onFilterChange(`stars:${n}`);
                    setStarsOpen(false);
                  }}
                  className={`flex flex-col items-center rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-muted ${activeFilter === `stars:${n}` ? 'bg-primary text-primary-foreground' : ''}`}
                >
                  <span className="font-semibold">≥{n}★</span>
                </button>
              ))}
              <button
                onClick={() => {
                  onFilterChange('all');
                  setStarsOpen(false);
                }}
                className="flex flex-col items-center rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {btn('duplicates', 'Doublons', duplicateGroups)}
        {btn('blurry', 'Floues', blurryCount)}
        {btn('rejected', '❌ Rejetées', rejectedCount)}
        {errorsCount > 0 &&
          btn('errors', '⚠️ Erreurs', errorsCount, 'text-destructive')}
        {selectedCount > 0 && btn('selected', 'Sélection', selectedCount)}
      </div>

      {/* Ligne 3 : Labels couleur */}
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-xs text-muted-foreground">
          Couleur :
        </span>
        {COLOR_LABEL_KEYS.map((c) => {
          const meta = COLOR_LABEL_META[c];
          const isActive = activeFilter === `color:${c}`;
          const count = colorCounts[c] ?? 0;
          return (
            <button
              key={c}
              onClick={() => onFilterChange(isActive ? 'all' : `color:${c}`)}
              title={`${meta.label}${count > 0 ? ` (${count})` : ''}`}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all ${
                isActive
                  ? 'border-foreground bg-foreground/10 font-semibold'
                  : 'border-transparent hover:border-border'
              } ${count === 0 ? 'opacity-40' : ''}`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: meta.dot }}
              />
              {count > 0 && (
                <span className="text-muted-foreground">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
