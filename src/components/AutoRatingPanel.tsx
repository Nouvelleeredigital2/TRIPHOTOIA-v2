import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Sparkles, Info } from 'lucide-react';
import { usePhotoStore } from '../store/photoStore';
import toast from 'react-hot-toast';

const PRESETS = [
  {
    id: 'strict' as const,
    name: 'Strict',
    icon: '🎯',
    description: 'Seules les meilleures photos obtiennent 5 étoiles',
    distribution: '5% ⭐⭐⭐⭐⭐ | 15% ⭐⭐⭐⭐ | 30% ⭐⭐⭐',
    color: 'bg-red-500/10 border-red-500/20',
  },
  {
    id: 'balanced' as const,
    name: 'Équilibré',
    icon: '⚖️',
    description: 'Distribution équilibrée des notes (recommandé)',
    distribution: '10% ⭐⭐⭐⭐⭐ | 20% ⭐⭐⭐⭐ | 30% ⭐⭐⭐',
    color: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    id: 'generous' as const,
    name: 'Généreux',
    icon: '💎',
    description: 'Plus de photos avec notes élevées',
    distribution: '15% ⭐⭐⭐⭐⭐ | 25% ⭐⭐⭐⭐ | 30% ⭐⭐⭐',
    color: 'bg-green-500/10 border-green-500/20',
  },
  {
    id: 'quality' as const,
    name: 'Qualité pure',
    icon: '🔬',
    description: "Basé uniquement sur les scores d'analyse",
    distribution: 'Distribution naturelle selon qualité réelle',
    color: 'bg-purple-500/10 border-purple-500/20',
  },
];

export function AutoRatingPanel() {
  const [selectedPreset, setSelectedPreset] = useState<
    'strict' | 'balanced' | 'generous' | 'quality'
  >('balanced');
  const [isProcessing, setIsProcessing] = useState(false);

  const photos = usePhotoStore((state) => state.photos);
  const autoRateAllPhotos = usePhotoStore((state) => state.autoRateAllPhotos);

  const analyzedPhotos = photos.filter((p) => p.analysis && !p.analysis.error);
  const canAutoRate = analyzedPhotos.length > 0;

  const handleAutoRate = async () => {
    if (!canAutoRate) {
      toast.error('Aucune photo analysée à noter');
      return;
    }

    setIsProcessing(true);

    try {
      autoRateAllPhotos(selectedPreset);

      // Calculer distribution
      const dist: Record<number, number> = {
        0: 0,
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      };
      analyzedPhotos.forEach((p) => {
        const r = p.analysis?.rating || 0;
        dist[r]++;
      });

      toast.success(
        <div className="space-y-1">
          <div className="font-semibold">
            ✨ {analyzedPhotos.length} photos notées automatiquement
          </div>
          <div className="text-xs text-muted-foreground">
            ⭐⭐⭐⭐⭐ {dist[5]} | ⭐⭐⭐⭐ {dist[4]} | ⭐⭐⭐ {dist[3]} | ⭐⭐{' '}
            {dist[2]} | ⭐ {dist[1]}
          </div>
        </div>,
        { duration: 5000 }
      );
    } catch (error) {
      toast.error('Erreur lors de la notation automatique');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Notation automatique (heuristique)
          <Badge variant="secondary" className="ml-2">
            {analyzedPhotos.length} photo{analyzedPhotos.length > 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Info */}
        <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/10 p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 text-info" />
          <div>
            <p className="font-medium">Comment ça marche ?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              L'IA analyse la netteté (40%), la composition (30%), les yeux
              ouverts (15%) et le besoin de retouche (15%) pour attribuer
              automatiquement une note de 0 à 5 étoiles.
            </p>
          </div>
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Choisir un preset :</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedPreset(preset.id)}
                className={`rounded-lg border-2 p-4 text-left transition-all ${
                  selectedPreset === preset.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${preset.color}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-2xl">{preset.icon}</span>
                  <span className="font-semibold">{preset.name}</span>
                  {selectedPreset === preset.id && (
                    <Badge variant="default" className="ml-auto text-xs">
                      Sélectionné
                    </Badge>
                  )}
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  {preset.description}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {preset.distribution}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Bouton d'action */}
        <Button
          onClick={handleAutoRate}
          disabled={!canAutoRate || isProcessing}
          className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
          size="lg"
        >
          <Sparkles className="mr-2 h-5 w-5" />
          {isProcessing
            ? 'Notation en cours...'
            : `Noter automatiquement ${analyzedPhotos.length} photo${analyzedPhotos.length > 1 ? 's' : ''}`}
        </Button>

        {/* Critères détaillés */}
        <div className="space-y-2 rounded-lg bg-muted/50 p-3">
          <h4 className="text-sm font-semibold">Critères de notation :</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>• Netteté (sharpnessScore)</span>
              <Badge variant="outline" className="text-xs">
                40%
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>• Composition</span>
              <Badge variant="outline" className="text-xs">
                30%
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>• Yeux ouverts (portraits)</span>
              <Badge variant="outline" className="text-xs">
                15%
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>• Besoin de retouche</span>
              <Badge variant="outline" className="text-xs">
                15%
              </Badge>
            </div>
          </div>
        </div>

        {/* Échelle de notation */}
        <div className="space-y-2 rounded-lg bg-muted/50 p-3">
          <h4 className="text-sm font-semibold">Échelle de notation :</h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-yellow-500">⭐⭐⭐⭐⭐</span>
              <span className="text-muted-foreground">
                Score ≥ 90% - Excellente
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-500">⭐⭐⭐⭐</span>
              <span className="text-muted-foreground">
                Score ≥ 75% - Très bonne
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-500">⭐⭐⭐</span>
              <span className="text-muted-foreground">Score ≥ 60% - Bonne</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-500">⭐⭐</span>
              <span className="text-muted-foreground">
                Score ≥ 40% - Moyenne
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-500">⭐</span>
              <span className="text-muted-foreground">
                Score ≥ 20% - Faible
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">☆</span>
              <span className="text-muted-foreground">
                Score &lt; 20% - À rejeter
              </span>
            </div>
          </div>
        </div>

        {/* Note */}
        <p className="text-center text-xs text-muted-foreground">
          💡 Vous pouvez toujours ajuster manuellement les notes après la
          notation automatique
        </p>
      </CardContent>
    </Card>
  );
}
