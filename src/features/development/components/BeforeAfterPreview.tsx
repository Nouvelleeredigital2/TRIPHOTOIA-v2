import React, { useMemo, useState, useEffect } from 'react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { cn } from '../../../lib/utils';

interface BeforeAfterPreviewProps {
  beforeUrl: string | null;
  afterUrl: string | null;
  photoName: string;
  isProcessing?: boolean;
  onRefresh?: () => void;
  /** CSS filter string applied to the "after" image for instant slider preview. */
  afterCssFilter?: string;
}

export const BeforeAfterPreview: React.FC<BeforeAfterPreviewProps> = ({
  beforeUrl,
  afterUrl,
  photoName,
  isProcessing = false,
  onRefresh,
  afterCssFilter,
}) => {
  const [slider, setSlider] = useState(50);

  useEffect(() => {
    setSlider(50);
  }, [beforeUrl, afterUrl]);

  // When a CSS filter is pending (user is moving sliders), show the original
  // image with the filter applied as an instant preview instead of waiting
  // for the canvas to re-render.
  const effectiveAfterUrl = afterCssFilter ? beforeUrl : afterUrl;
  const hasAfter = Boolean(effectiveAfterUrl);

  const beforeLabel = useMemo(
    () => (beforeUrl ? 'Avant' : 'Aucune image de référence'),
    [beforeUrl]
  );

  const afterLabel = useMemo(
    () => (hasAfter ? 'Après' : 'Prévisualisation indisponible'),
    [hasAfter]
  );

  return (
    <div className="relative flex flex-col gap-4 rounded-lg border border-border/40 bg-muted/20 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Comparaison Avant / Après</h3>
          <p className="text-sm text-muted-foreground">{photoName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{beforeLabel}</Badge>
          <Badge variant={hasAfter ? 'default' : 'outline'}>{afterLabel}</Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            onClick={onRefresh}
          >
            {isProcessing ? 'Mise à jour…' : 'Régénérer'}
          </Button>
        </div>
      </header>

      <div className="relative h-[360px] overflow-hidden rounded-md bg-background/80">
        {beforeUrl ? (
          <img
            src={beforeUrl}
            alt="Avant"
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            Aucune image originale disponible
          </div>
        )}

        {hasAfter && effectiveAfterUrl && (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${slider}%` }}
          >
            <img
              src={effectiveAfterUrl}
              alt="Après"
              className="h-full w-full object-contain"
              style={afterCssFilter ? { filter: afterCssFilter } : undefined}
            />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 border border-white/10" />

        <div className="absolute bottom-4 left-1/2 flex w-[220px] -translate-x-1/2 items-center gap-2 rounded-full bg-background/80 px-3 py-1.5 shadow-lg">
          <span className="text-xs text-muted-foreground">Avant</span>
          <input
            type="range"
            min={0}
            max={100}
            value={slider}
            onChange={(event) => setSlider(Number(event.target.value))}
            className={cn('flex-1', isProcessing && 'opacity-60')}
            disabled={isProcessing || !hasAfter}
          />
          <span className="text-xs text-muted-foreground">Après</span>
        </div>

        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
};
