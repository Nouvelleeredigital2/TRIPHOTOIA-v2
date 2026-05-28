import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Photo, DuplicateGroup } from '../types';
import { X, Check, Trash2, Maximize2 } from 'lucide-react';
import { usePhotoStore } from '../store/photoStore';
import toast from 'react-hot-toast';

interface DuplicateComparisonProps {
  group: DuplicateGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DuplicateComparison({ group, open, onOpenChange }: DuplicateComparisonProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const removePhoto = usePhotoStore((state) => state.removePhoto);
  const setBestInGroup = usePhotoStore((state) => state.setBestInGroup);
  const bestPhotoOverrides = usePhotoStore((state) => state.bestPhotoOverrides);

  const bestPhotoId = bestPhotoOverrides[group.id] || group.bestPhotoId;

  // Calculer la similarité entre deux hash
  const calculateSimilarity = (hash1: string, hash2: string): number => {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) return 0;

    let matches = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) matches++;
    }

    return Math.round((matches / hash1.length) * 100);
  };

  const handleDeleteOthers = () => {
    const photosToDelete = group.photos.filter(p => p.id !== bestPhotoId);

    if (photosToDelete.length === 0) {
      toast.error('Aucune photo à supprimer');
      return;
    }

    if (window.confirm(`Supprimer ${photosToDelete.length} photo(s) et garder uniquement la meilleure ?`)) {
      photosToDelete.forEach(photo => removePhoto(photo.id));
      toast.success(`${photosToDelete.length} photo(s) supprimée(s)`);
      onOpenChange(false);
    }
  };

  const handleSetAsBest = (photoId: string) => {
    setBestInGroup(group.id, photoId);
    toast.success('Meilleure photo mise à jour');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Comparaison des doublons - Groupe {group.id.slice(-8)}</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteOthers}
              className="ml-4"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer les autres ({group.photos.length - 1})
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Grid de comparaison */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {group.photos.map((photo) => {
            const isBest = photo.id === bestPhotoId;
            const isSelected = photo.id === selectedPhoto;
            const similarity = calculateSimilarity(photo.analysis?.perceptualHash || '', group.hash);

            return (
              <motion.div
                key={photo.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`relative rounded-lg border-2 transition-all ${
                  isBest
                    ? 'border-green-500 shadow-lg shadow-green-500/20'
                    : isSelected
                    ? 'border-primary shadow-lg'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setSelectedPhoto(photo.id)}
              >
                {/* Image */}
                <div className="aspect-square relative overflow-hidden rounded-t-lg bg-muted">
                  <img
                    src={photo.previewUrl}
                    alt={photo.file.name}
                    className="w-full h-full object-cover"
                  />

                  {/* Overlay avec actions */}
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-all group">
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(photo.previewUrl, '_blank');
                        }}
                      >
                        <Maximize2 className="w-4 h-4 mr-2" />
                        Agrandir
                      </Button>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {isBest && (
                      <Badge className="bg-green-600 text-white border-green-700">
                        <Check className="w-3 h-3 mr-1" />
                        Meilleure
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {similarity}% similaire
                    </Badge>
                  </div>
                </div>

                {/* Infos et actions */}
                <div className="p-3 space-y-2">
                  <div className="text-sm font-medium truncate" title={photo.file.name}>
                    {photo.file.name}
                  </div>

                  {/* Statistiques */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="font-semibold">Netteté:</span>{' '}
                      {((photo.analysis?.sharpnessScore || 0) * 100).toFixed(0)}%
                    </div>
                    <div>
                      <span className="font-semibold">Taille:</span>{' '}
                      {(photo.file.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                    <div>
                      <span className="font-semibold">Format:</span>{' '}
                      {photo.file.type.split('/')[1]?.toUpperCase() || 'N/A'}
                    </div>
                    <div>
                      <span className="font-semibold">Flou:</span>{' '}
                      {photo.analysis?.isBlurry ? '❌ Oui' : '✅ Non'}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {!isBest && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetAsBest(photo.id);
                        }}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Définir meilleure
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Supprimer cette photo ?')) {
                          removePhoto(photo.id);
                          toast.success('Photo supprimée');
                          if (group.photos.length <= 2) {
                            onOpenChange(false);
                          }
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Légende */}
        <div className="mt-4 p-4 bg-muted/50 rounded-lg text-sm">
          <div className="font-semibold mb-2">💡 Conseils:</div>
          <ul className="space-y-1 text-muted-foreground">
            <li>• La photo avec le <strong>score de netteté le plus élevé</strong> est automatiquement sélectionnée comme meilleure</li>
            <li>• Cliquez sur "Définir meilleure" pour changer la sélection</li>
            <li>• "Supprimer les autres" garde uniquement la meilleure photo</li>
            <li>• Le % de similarité indique à quel point les photos sont identiques</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
