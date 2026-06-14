import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';

interface AnalysisProgressProps {
  total: number;
  processed: number;
  isProcessing: boolean;
  analyzingPhotoIds: Set<string>;
  onStop: () => void;
}

export function AnalysisProgress({
  total,
  processed,
  isProcessing,
  analyzingPhotoIds,
  onStop,
}: AnalysisProgressProps) {
  const progress = total > 0 ? (processed / total) * 100 : 0;
  const remaining = total - processed;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Analyse en cours
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={isProcessing ? 'default' : 'secondary'}>
              {isProcessing ? 'En cours' : 'En pause'}
            </Badge>
            {isProcessing && (
              <Button
                variant="outline"
                size="sm"
                onClick={onStop}
                className="text-destructive hover:text-destructive"
              >
                ArrÃªter
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progression</span>
            <span>{processed} / {total}</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <motion.div
              className="bg-primary h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {remaining > 0 ? `${remaining} photos restantes` : "Analyse terminee"}
          </div>
        </div>

        {analyzingPhotoIds.size > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">
              Photos en cours d&apos;analyse ({analyzingPhotoIds.size})
            </div>
            <div className="flex flex-wrap gap-1">
              {Array.from(analyzingPhotoIds).map((photoId) => (
                <Badge key={photoId} variant="outline" className="text-xs">
                  {photoId.split('-')[0]}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}



