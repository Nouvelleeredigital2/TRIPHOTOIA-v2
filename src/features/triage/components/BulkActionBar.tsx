import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, Flag, XCircle, RotateCcw, Trash2, FolderPlus, Circle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { ColorLabel, COLOR_LABEL_META, COLOR_LABEL_KEYS } from '../../../types';

interface BulkActionBarProps {
  count: number;
  onRate: (rating: number) => void;
  onPick: () => void;
  onReject: () => void;
  onUnflag: () => void;
  onDelete: () => void;
  onColorLabel?: (label: ColorLabel | null) => void;
  onAddToCollection?: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  count,
  onRate,
  onPick,
  onReject,
  onUnflag,
  onDelete,
  onColorLabel,
  onAddToCollection,
  onClearSelection,
}: BulkActionBarProps) {
  const [ratingOpen, setRatingOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="bulk-bar"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-2 bg-card border border-border shadow-2xl rounded-2xl px-4 py-3">
            {/* Compteur */}
            <Badge variant="secondary" className="text-sm font-semibold shrink-0">
              {count} photo{count > 1 ? 's' : ''}
            </Badge>

            <div className="w-px h-6 bg-border mx-1" />

            {/* ⭐ Note en masse */}
            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-xs"
                onClick={() => setRatingOpen((v) => !v)}
                title="Attribuer une note"
              >
                <Star className="w-3.5 h-3.5" />
                Note
              </Button>

              <AnimatePresence>
                {ratingOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-xl shadow-xl p-2 flex gap-1"
                  >
                    {[0, 1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        onClick={() => { onRate(r); setRatingOpen(false); }}
                        className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-sm font-semibold transition-colors"
                        title={r === 0 ? 'Retirer la note' : `${r} étoile${r > 1 ? 's' : ''}`}
                      >
                        {r === 0 ? '✕' : r}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 🎯 Pick */}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs"
              onClick={onPick}
              title="Marquer comme Pick"
            >
              <Flag className="w-3.5 h-3.5" />
              Pick
            </Button>

            {/* ❌ Rejeter */}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs text-destructive hover:text-destructive"
              onClick={onReject}
              title="Rejeter"
            >
              <XCircle className="w-3.5 h-3.5" />
              Rejeter
            </Button>

            {/* ⚪ Retirer flags */}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs"
              onClick={onUnflag}
              title="Retirer tous les flags"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Unflag
            </Button>

            {/* 🎨 Label couleur */}
            {onColorLabel && (
              <div className="relative">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-xs"
                  onClick={() => setColorOpen((v) => !v)}
                  title="Appliquer un label couleur"
                >
                  <Circle className="w-3.5 h-3.5" />
                  Couleur
                </Button>
                <AnimatePresence>
                  {colorOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-xl shadow-xl p-2 flex gap-1.5"
                    >
                      {COLOR_LABEL_KEYS.map((c) => (
                        <button
                          key={c}
                          onClick={() => { onColorLabel(c); setColorOpen(false); }}
                          className="w-6 h-6 rounded-full border-2 border-white/50 hover:scale-110 transition-transform"
                          style={{ backgroundColor: COLOR_LABEL_META[c].dot }}
                          title={COLOR_LABEL_META[c].label}
                        />
                      ))}
                      <button
                        onClick={() => { onColorLabel(null); setColorOpen(false); }}
                        className="w-6 h-6 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground hover:text-foreground text-xs transition-colors"
                        title="Retirer le label"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Collection */}
            {onAddToCollection && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-xs"
                onClick={onAddToCollection}
                title="Ajouter à la collection"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Collection
              </Button>
            )}

            <div className="w-px h-6 bg-border mx-1" />

            {/* 🗑️ Supprimer */}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
              title="Supprimer les photos sélectionnées"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer
            </Button>

            <div className="w-px h-6 bg-border mx-1" />

            {/* ✕ Effacer sélection */}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 rounded-full"
              onClick={onClearSelection}
              title="Effacer la sélection"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
