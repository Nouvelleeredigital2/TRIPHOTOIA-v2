import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { Photo, COLOR_LABEL_META } from '../types';
import { StarRating } from './ui/star-rating';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { usePhotoStore } from '../store/photoStore';
import toast from 'react-hot-toast';

interface ComparisonViewProps {
  photoA: Photo;
  photoB: Photo;
  photos: Photo[];
  open: boolean;
  onClose: () => void;
  onSelectWinner?: (photoId: string) => void;
}

export function ComparisonView({
  photoA,
  photoB,
  open,
  onClose,
  onSelectWinner
}: ComparisonViewProps) {
  const [selectedSide, setSelectedSide] = useState<'A' | 'B' | null>(null);

  const setPhotoRating = usePhotoStore((state) => state.setPhotoRating);
  const togglePhotoPick = usePhotoStore((state) => state.togglePhotoPick);
  const togglePhotoReject = usePhotoStore((state) => state.togglePhotoReject);

  // Stable ref so the keydown handler doesn't stale-close
  const handlersRef = useRef({ onClose, photoA, photoB });
  handlersRef.current = { onClose, photoA, photoB };

  // Raccourcis clavier en mode comparaison
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
        case 'c':
        case 'C':
          handlersRef.current.onClose();
          break;
        case 'ArrowLeft':
          handleSelectWinner('A');
          break;
        case 'ArrowRight':
          handleSelectWinner('B');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // handleSelectWinner lit handlersRef.current (données fraîches) ; l'écouteur
    // est volontairement attaché une fois par ouverture, pas à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSelectWinner = (side: 'A' | 'B') => {
    const { photoA: pA, photoB: pB } = handlersRef.current;
    const winner = side === 'A' ? pA : pB;
    const loser  = side === 'A' ? pB : pA;

    setSelectedSide(side);

    // Ensure winner is Pick (set, not toggle — avoid double-flip)
    if (!winner.analysis?.isPick) togglePhotoPick(winner.id);
    // Ensure loser is Rejected
    if (!loser.analysis?.isRejected) togglePhotoReject(loser.id);

    toast.success(`${side === 'A' ? '←' : '→'} Photo ${side} sélectionnée comme Pick`);

    if (onSelectWinner) onSelectWinner(winner.id);

    // Auto-close after brief feedback
    setTimeout(() => handlersRef.current.onClose(), 900);
  };

  if (!open) return null;

  const renderPhotoSide = (photo: Photo, side: 'A' | 'B') => {
    const isSelected = selectedSide === side;

    return (
      <div className="relative flex-1 flex flex-col items-center justify-center p-8">
        {/* Label */}
        <div className="absolute top-4 left-4">
          <Badge
            variant={isSelected ? 'default' : 'secondary'}
            className={`text-lg font-bold ${isSelected ? 'bg-green-600' : ''}`}
          >
            {side}
          </Badge>
        </div>

        {/* Image */}
        <motion.div
          className={`relative max-w-full max-h-full transition-all duration-300 ${
            isSelected ? 'ring-4 ring-green-500 rounded-lg' : ''
          }`}
          animate={{ scale: isSelected ? 1.02 : 1 }}
        >
          <img
            src={photo.previewUrl}
            alt={photo.file.name}
            className="max-w-full max-h-[70vh] object-contain rounded-lg"
          />

          {isSelected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-4 right-4 bg-green-600 text-white rounded-full p-3"
            >
              <Check className="w-8 h-8" />
            </motion.div>
          )}
        </motion.div>

        {/* Infos */}
        <div className="mt-4 space-y-2 text-center">
          <div className="text-white font-medium">{photo.file.name}</div>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <StarRating
              rating={photo.analysis?.rating || 0}
              onRatingChange={(rating) => setPhotoRating(photo.id, rating)}
              size="md"
              showCount
            />

            {photo.analysis?.colorLabel && (
              <span
                className="w-4 h-4 rounded-full border-2 border-white/50 shrink-0"
                style={{ backgroundColor: COLOR_LABEL_META[photo.analysis.colorLabel].dot }}
                title={COLOR_LABEL_META[photo.analysis.colorLabel].label}
              />
            )}

            {photo.analysis?.isPick && (
              <Badge className="bg-green-600 text-white">🎯 Pick</Badge>
            )}

            {photo.analysis?.isRejected && (
              <Badge variant="destructive">❌ Reject</Badge>
            )}
          </div>

          <div className="flex gap-4 text-xs text-white/60">
            {photo.analysis?.sharpnessScore !== undefined && (
              <span>Netteté: {Math.round(photo.analysis.sharpnessScore * 100)}%</span>
            )}
            <span>{(photo.file.size / 1024 / 1024).toFixed(2)} MB</span>
            <span>{photo.file.type.split('/')[1]?.toUpperCase()}</span>
          </div>
        </div>

        {/* Bouton de sélection */}
        <Button
          size="lg"
          variant={isSelected ? 'default' : 'outline'}
          className="mt-4"
          onClick={() => handleSelectWinner(side)}
        >
          {isSelected ? (
            <>
              <Check className="w-5 h-5 mr-2" />
              Sélectionnée
            </>
          ) : (
            `Choisir ${side}`
          )}
        </Button>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black"
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="text-white font-semibold text-lg">Comparaison A/B</h3>
              <Badge variant="secondary">
                Choisissez la meilleure photo
              </Badge>
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Grille de comparaison */}
        <div className="absolute inset-0 flex pt-20 pb-8">
          {renderPhotoSide(photoA, 'A')}

          {/* Séparateur */}
          <div className="w-px bg-white/20" />

          {renderPhotoSide(photoB, 'B')}
        </div>

        {/* Instructions */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <div className="bg-black/80 backdrop-blur-sm rounded-lg px-6 py-3 flex gap-6 text-xs text-white/60">
            <span><kbd className="px-2 py-1 bg-white/10 rounded">←</kbd> Choisir A</span>
            <span><kbd className="px-2 py-1 bg-white/10 rounded">→</kbd> Choisir B</span>
            <span><kbd className="px-2 py-1 bg-white/10 rounded">C/ESC</kbd> Quitter</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
