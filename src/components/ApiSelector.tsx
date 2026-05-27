import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { setAnalysisProvider, getAnalysisConfig, AnalysisProvider, AnalysisConfig } from '../../services/geminiService';

interface ApiSelectorProps {
  onConfigChange?: (config: AnalysisConfig) => void;
}

const PROVIDERS: Array<{
  id: AnalysisProvider;
  name: string;
  description: string;
  free: boolean;
  features: string[];
  icon: string;
}> = [
  {
    id: 'local',
    name: 'Analyse locale',
    description: 'Traitement 100% local avec Canvas API et Web Workers',
    free: true,
    features: ['Confidentialite totale', 'Aucun cout', 'Hors ligne', 'Detection de flou', 'Hash perceptuel'],
    icon: '[L]'
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'API gratuite avec modeles pre-entraines',
    free: true,
    features: ['Gratuit', 'Modeles avances', 'Classification d\'images', 'Detection d\'objets'],
    icon: '[HF]'
  },
  {
    id: 'replicate',
    name: 'Replicate',
    description: 'API payante avec modeles de pointe',
    free: false,
    features: ['Modeles haut de gamme', 'Haute precision', 'Detection avancee', 'API rapide'],
    icon: '[R]'
  },
  {
    id: 'clarifai',
    name: 'Clarifai',
    description: 'API payante specialisee en vision par ordinateur',
    free: false,
    features: ['Specialiste CV', 'Detection de visages', 'Reconnaissance d\'objets', 'API robuste'],
    icon: '[C]'
  }
];

export function ApiSelector({ onConfigChange }: ApiSelectorProps) {
  const [currentConfig, setCurrentConfig] = useState<AnalysisConfig>(getAnalysisConfig());
  const [apiKey, setApiKey] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const apiKeyInputId = 'api-selector-api-key';

  const currentProvider = PROVIDERS.find((provider) => provider.id === currentConfig.provider);

  const handleProviderChange = (provider: AnalysisProvider) => {
    const newConfig: AnalysisConfig = {
      provider,
      apiKey: provider === 'local' ? undefined : apiKey,
      model: provider === 'huggingface' ? 'microsoft/resnet-50' : undefined,
    };

    setAnalysisProvider(newConfig);
    setCurrentConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    if (currentConfig.provider !== 'local') {
      const newConfig = { ...currentConfig, apiKey: key };
      setAnalysisProvider(newConfig);
      setCurrentConfig(newConfig);
      onConfigChange?.(newConfig);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            Configuration de l&apos;analyse
          </span>
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? 'Masquer' : 'Configurer'}
          </Button>
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{currentProvider?.icon}</span>
              <span className="font-medium">{currentProvider?.name}</span>
              <Badge variant={currentProvider?.free ? 'default' : 'secondary'}>
                {currentProvider?.free ? 'Gratuit' : 'Payant'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{currentProvider?.description}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Choisir un provider d&apos;analyse :</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {PROVIDERS.map((provider) => (
                <Button
                  key={provider.id}
                  variant={currentConfig.provider === provider.id ? 'default' : 'outline'}
                  className="h-auto p-3 flex flex-col items-start text-left"
                  onClick={() => handleProviderChange(provider.id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{provider.icon}</span>
                    <span className="font-medium">{provider.name}</span>
                    <Badge variant={provider.free ? 'default' : 'secondary'} className="text-xs">
                      {provider.free ? 'Gratuit' : 'Payant'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{provider.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {provider.features.slice(0, 3).map((feature) => (
                      <Badge key={feature} variant="outline" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                    {provider.features.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{provider.features.length - 3} autres
                      </Badge>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {currentConfig.provider !== 'local' && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={apiKeyInputId}>
                Cle API {currentProvider?.name} :
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  id={apiKeyInputId}
                  value={apiKey}
                  onChange={(event) => handleApiKeyChange(event.target.value)}
                  placeholder={`Entrez votre cle API ${currentProvider?.name}`}
                  className="flex-1 px-3 py-2 border rounded-md bg-background text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const key = prompt(`Entrez votre cle API ${currentProvider?.name}:`);
                    if (key) {
                      handleApiKeyChange(key);
                    }
                  }}
                >
                  Configurer
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {currentConfig.provider === 'huggingface' &&
                  'Hugging Face fonctionne sans cle API, mais une cle ameliore les performances.'}
                {currentConfig.provider === 'replicate' &&
                  'Obtenez votre cle API sur https://replicate.com/account/api-tokens'}
                {currentConfig.provider === 'clarifai' &&
                  'Obtenez votre cle API sur https://portal.clarifai.com/settings/authentication'}
              </p>
            </div>
          )}

          {currentProvider && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                Fonctionnalites disponibles :
              </h4>
              <div className="flex flex-wrap gap-1">
                {currentProvider.features.map((feature) => (
                  <Badge key={feature} variant="outline" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
