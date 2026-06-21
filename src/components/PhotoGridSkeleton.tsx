import { Skeleton } from './ui/skeleton';
import { Card } from './ui/card';

/**
 * Carte photo skeleton — shimmer pendant l'analyse ou le chargement paresseux du tab
 */
function PhotoCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      {/* Miniature */}
      <Skeleton className="aspect-square w-full rounded-none" />
      {/* Infos */}
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <div className="flex gap-1 pt-1">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </Card>
  );
}

interface PhotoGridSkeletonProps {
  /** Nombre de cartes à afficher (défaut : 12) */
  count?: number;
  /** Message optionnel sous la grille */
  label?: string;
}

/**
 * Grille de cartes skeleton — utilisée lors du chargement paresseux des onglets
 * ou pendant l'analyse d'un batch de photos.
 */
export function PhotoGridSkeleton({
  count = 12,
  label,
}: PhotoGridSkeletonProps) {
  return (
    <div className="space-y-4">
      {/* Barre de filtres skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>

      {/* Grille de cartes */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: count }).map((_, i) => (
          <PhotoCardSkeleton key={i} />
        ))}
      </div>

      {label && (
        <p className="animate-pulse text-center text-sm text-muted-foreground">
          {label}
        </p>
      )}
    </div>
  );
}

/**
 * Skeleton pour la zone d'analyse en cours dans IngestionTab
 */
export function AnalyzingBadgeSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
      {/* Shimmer ring */}
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-2 border-primary/30" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
      <span className="mt-2 text-xs font-medium text-white">Analyse…</span>
    </div>
  );
}
