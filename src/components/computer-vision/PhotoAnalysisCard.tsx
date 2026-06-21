import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { PhotoAnalysisResult } from '../../lib/computer-vision';

interface PhotoAnalysisCardProps {
  analysis: PhotoAnalysisResult;
  onRetouch?: (photoId: string) => void;
  onViewDetails?: (photoId: string) => void;
}

export const PhotoAnalysisCard: React.FC<PhotoAnalysisCardProps> = ({
  analysis,
  onRetouch,
  onViewDetails,
}) => {
  const { photoScore, blurAnalysis, retouchAnalysis, recommendations } =
    analysis;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Analyse de la Photo</span>
          <Badge variant={getScoreBadgeVariant(photoScore.overall)}>
            Score: {photoScore.overall.toFixed(1)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scores détaillés */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Netteté</span>
              <span
                className={`text-sm font-bold ${getScoreColor(photoScore.sharpness)}`}
              >
                {photoScore.sharpness.toFixed(1)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-blue-600"
                style={{ width: `${photoScore.sharpness}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Exposition</span>
              <span
                className={`text-sm font-bold ${getScoreColor(photoScore.exposure)}`}
              >
                {photoScore.exposure.toFixed(1)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-green-600"
                style={{ width: `${photoScore.exposure}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Composition</span>
              <span
                className={`text-sm font-bold ${getScoreColor(photoScore.composition)}`}
              >
                {photoScore.composition.toFixed(1)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-purple-600"
                style={{ width: `${photoScore.composition}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Expression</span>
              <span
                className={`text-sm font-bold ${getScoreColor(photoScore.expression)}`}
              >
                {photoScore.expression.toFixed(1)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-pink-600"
                style={{ width: `${photoScore.expression}%` }}
              />
            </div>
          </div>
        </div>

        {/* Analyse du flou */}
        {blurAnalysis.isBlurry && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <div className="flex items-center space-x-2">
              <span className="font-medium text-yellow-600">
                ⚠️ Image floue détectée
              </span>
              <Badge variant="outline" className="text-yellow-600">
                Confiance: {(blurAnalysis.confidence * 100).toFixed(1)}%
              </Badge>
            </div>
            <p className="mt-1 text-sm text-yellow-700">
              Variance: {blurAnalysis.details.variance.toFixed(2)} | Netteté:{' '}
              {blurAnalysis.details.sharpness.toFixed(2)}
            </p>
          </div>
        )}

        {/* Suggestions de retouche */}
        {retouchAnalysis.confidence > 0.5 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-blue-600">
                💡 Retouche recommandée
              </span>
              <Badge variant="outline" className="text-blue-600">
                Confiance: {(retouchAnalysis.confidence * 100).toFixed(1)}%
              </Badge>
            </div>
            <div className="mt-2 space-y-1">
              {retouchAnalysis.needsBrightness && (
                <span className="mr-1 inline-block rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">
                  Luminosité
                </span>
              )}
              {retouchAnalysis.needsContrast && (
                <span className="mr-1 inline-block rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">
                  Contraste
                </span>
              )}
              {retouchAnalysis.needsSaturation && (
                <span className="mr-1 inline-block rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">
                  Saturation
                </span>
              )}
              {retouchAnalysis.needsSharpness && (
                <span className="mr-1 inline-block rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">
                  Netteté
                </span>
              )}
            </div>
          </div>
        )}

        {/* Recommandations */}
        {recommendations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">
              Recommandations
            </h4>
            <div className="space-y-1">
              {recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <span className="mt-0.5 text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-600">
                    {recommendation}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex space-x-2 pt-2">
          {onRetouch && retouchAnalysis.confidence > 0.5 && (
            <Button
              size="sm"
              onClick={() => onRetouch(analysis.photoId)}
              className="flex-1"
            >
              🎨 Retoucher
            </Button>
          )}
          {onViewDetails && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewDetails(analysis.photoId)}
              className="flex-1"
            >
              📊 Détails
            </Button>
          )}
        </div>

        {/* Temps de traitement */}
        <div className="text-center text-xs text-gray-500">
          Traité en {analysis.processingTime.toFixed(0)}ms
        </div>
      </CardContent>
    </Card>
  );
};
