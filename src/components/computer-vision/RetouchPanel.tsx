import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { RetouchResult, RetouchOptions } from '../../lib/computer-vision';

interface RetouchPanelProps {
  retouchResult: RetouchResult;
  onApplyRetouch?: (options: RetouchOptions) => void;
  onReset?: () => void;
  onSave?: () => void;
}

export const RetouchPanel: React.FC<RetouchPanelProps> = ({
  retouchResult,
  onApplyRetouch,
  onReset,
  onSave,
}) => {
  const [isBeforeAfter, setIsBeforeAfter] = useState(false);
  const [customOptions, setCustomOptions] = useState<RetouchOptions>(
    retouchResult.appliedOptions
  );

  const handleOptionChange = (key: keyof RetouchOptions, value: number) => {
    setCustomOptions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleWhiteBalanceChange = (
    key: 'temperature' | 'tint',
    value: number
  ) => {
    setCustomOptions((prev) => ({
      ...prev,
      whiteBalance: {
        ...prev.whiteBalance,
        [key]: value,
      },
    }));
  };

  const formatValue = (value: number) => {
    return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  };

  const getValueColor = (value: number) => {
    if (Math.abs(value) < 5) return 'text-gray-600';
    if (value > 0) return 'text-green-600';
    return 'text-red-600';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Retouche Automatique</span>
          <div className="flex space-x-2">
            <Button
              size="sm"
              variant={isBeforeAfter ? 'default' : 'outline'}
              onClick={() => setIsBeforeAfter(!isBeforeAfter)}
            >
              {isBeforeAfter ? 'Après' : 'Avant'}
            </Button>
            <Badge variant="outline">
              Confiance: {(retouchResult.analysis.confidence * 100).toFixed(1)}%
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Aperçu avant/après */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Aperçu</h4>
          <div className="relative flex min-h-[200px] items-center justify-center rounded-lg bg-gray-100 p-4">
            {isBeforeAfter ? (
              <div className="text-center">
                <div className="mb-2 text-4xl">📸</div>
                <p className="text-sm text-gray-600">Image retouchée</p>
                <p className="mt-1 text-xs text-gray-500">
                  {retouchResult.success
                    ? 'Retouche appliquée avec succès'
                    : 'Erreur lors de la retouche'}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-2 text-4xl">📷</div>
                <p className="text-sm text-gray-600">Image originale</p>
                <p className="mt-1 text-xs text-gray-500">
                  Image avant retouche automatique
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Métriques avant/après */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Métriques</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Luminosité</span>
                <div className="flex space-x-2">
                  <span className="text-gray-500">
                    {retouchResult.beforeAfterMetrics.brightness.before.toFixed(
                      1
                    )}
                  </span>
                  <span>→</span>
                  <span
                    className={getValueColor(
                      retouchResult.beforeAfterMetrics.brightness.after -
                        retouchResult.beforeAfterMetrics.brightness.before
                    )}
                  >
                    {retouchResult.beforeAfterMetrics.brightness.after.toFixed(
                      1
                    )}
                  </span>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span>Contraste</span>
                <div className="flex space-x-2">
                  <span className="text-gray-500">
                    {retouchResult.beforeAfterMetrics.contrast.before.toFixed(
                      1
                    )}
                  </span>
                  <span>→</span>
                  <span
                    className={getValueColor(
                      retouchResult.beforeAfterMetrics.contrast.after -
                        retouchResult.beforeAfterMetrics.contrast.before
                    )}
                  >
                    {retouchResult.beforeAfterMetrics.contrast.after.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Saturation</span>
                <div className="flex space-x-2">
                  <span className="text-gray-500">
                    {retouchResult.beforeAfterMetrics.saturation.before.toFixed(
                      1
                    )}
                  </span>
                  <span>→</span>
                  <span
                    className={getValueColor(
                      retouchResult.beforeAfterMetrics.saturation.after -
                        retouchResult.beforeAfterMetrics.saturation.before
                    )}
                  >
                    {retouchResult.beforeAfterMetrics.saturation.after.toFixed(
                      1
                    )}
                  </span>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span>Netteté</span>
                <div className="flex space-x-2">
                  <span className="text-gray-500">
                    {retouchResult.beforeAfterMetrics.sharpness.before.toFixed(
                      1
                    )}
                  </span>
                  <span>→</span>
                  <span
                    className={getValueColor(
                      retouchResult.beforeAfterMetrics.sharpness.after -
                        retouchResult.beforeAfterMetrics.sharpness.before
                    )}
                  >
                    {retouchResult.beforeAfterMetrics.sharpness.after.toFixed(
                      1
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contrôles de retouche */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Ajustements</h4>

          {/* Luminosité */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Luminosité</span>
              <span className="font-mono text-sm">
                {formatValue(customOptions.brightness)}
              </span>
            </div>
            <input
              type="range"
              min="-100"
              max="100"
              value={customOptions.brightness}
              onChange={(e) =>
                handleOptionChange('brightness', Number(e.target.value))
              }
              className="w-full"
            />
          </div>

          {/* Contraste */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Contraste</span>
              <span className="font-mono text-sm">
                {formatValue(customOptions.contrast)}
              </span>
            </div>
            <input
              type="range"
              min="-100"
              max="100"
              value={customOptions.contrast}
              onChange={(e) =>
                handleOptionChange('contrast', Number(e.target.value))
              }
              className="w-full"
            />
          </div>

          {/* Saturation */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Saturation</span>
              <span className="font-mono text-sm">
                {formatValue(customOptions.saturation)}
              </span>
            </div>
            <input
              type="range"
              min="-100"
              max="100"
              value={customOptions.saturation}
              onChange={(e) =>
                handleOptionChange('saturation', Number(e.target.value))
              }
              className="w-full"
            />
          </div>

          {/* Netteté */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Netteté</span>
              <span className="font-mono text-sm">
                {customOptions.sharpness.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={customOptions.sharpness}
              onChange={(e) =>
                handleOptionChange('sharpness', Number(e.target.value))
              }
              className="w-full"
            />
          </div>

          {/* Balance des blancs */}
          <div className="space-y-3">
            <span className="text-sm font-medium">Balance des blancs</span>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Température</span>
                <span className="font-mono text-sm">
                  {formatValue(customOptions.whiteBalance.temperature)}
                </span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={customOptions.whiteBalance.temperature}
                onChange={(e) =>
                  handleWhiteBalanceChange(
                    'temperature',
                    Number(e.target.value)
                  )
                }
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Teinte</span>
                <span className="font-mono text-sm">
                  {formatValue(customOptions.whiteBalance.tint)}
                </span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={customOptions.whiteBalance.tint}
                onChange={(e) =>
                  handleWhiteBalanceChange('tint', Number(e.target.value))
                }
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-2 pt-4">
          {onApplyRetouch && (
            <Button
              onClick={() => onApplyRetouch(customOptions)}
              className="flex-1"
            >
              🎨 Appliquer
            </Button>
          )}
          {onReset && (
            <Button variant="outline" onClick={onReset}>
              ↺ Reset
            </Button>
          )}
          {onSave && (
            <Button variant="outline" onClick={onSave}>
              💾 Sauvegarder
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
