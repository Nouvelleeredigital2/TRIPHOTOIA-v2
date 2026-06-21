import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { getAnalysisConfig, AnalysisConfig } from '@/services/geminiService';

interface ApiSelectorProps {
  onConfigChange?: (config: AnalysisConfig) => void;
}

// P1-B : l'analyse s'effectue exclusivement en local (Canvas API + Web Workers).
// Les providers distants (HuggingFace / Replicate / Clarifai) et le champ de
// clé API ont été retirés : aucune clé d'API tierce n'est demandée ni stockée
// dans le navigateur, et aucune image n'est envoyée à une API tierce.
const LOCAL_PROVIDER = {
  name: 'Analyse locale',
  description: 'Traitement 100 % local avec Canvas API et Web Workers',
  features: [
    'Confidentialité totale',
    'Aucun coût',
    'Hors ligne',
    'Détection de flou',
    'Hash perceptuel',
  ],
  icon: '[L]',
} as const;

export function ApiSelector({ onConfigChange }: ApiSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // La configuration reste sur `local` ; on l'expose pour compatibilité.
  const config = getAnalysisConfig();
  void config;
  void onConfigChange;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            Configuration de l&apos;analyse
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Masquer' : 'Détails'}
          </Button>
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-2xl">{LOCAL_PROVIDER.icon}</span>
              <span className="font-medium">{LOCAL_PROVIDER.name}</span>
              <Badge variant="default">Gratuit</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {LOCAL_PROVIDER.description}
            </p>
          </div>

          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950">
            <h4 className="mb-2 font-medium text-blue-900 dark:text-blue-100">
              Fonctionnalités disponibles :
            </h4>
            <div className="flex flex-wrap gap-1">
              {LOCAL_PROVIDER.features.map((feature) => (
                <Badge key={feature} variant="outline" className="text-xs">
                  {feature}
                </Badge>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Toute l&apos;analyse s&apos;exécute dans votre navigateur. Aucune
            image n&apos;est envoyée à un service tiers et aucune clé d&apos;API
            n&apos;est requise.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
