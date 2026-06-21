import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Star,
  Flag,
  XCircle,
  RotateCcw,
  Trash2,
  FolderPlus,
  Circle,
} from 'lucide-react';
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
          className="fixed bottom-16 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xl">
            {/* Compteur */}
            <Badge
              variant="secondary"
              className="shrink-0 text-sm font-semibold"
            >
              {count} photo{count > 1 ? 's' : ''}
            </Badge>

            <div className="mx-1 h-6 w-px bg-border" />

            {/* ⭐ Note en masse */}
            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-xs"
                onClick={() => setRatingOpen((v) => !v)}
                title="Attribuer une note"
              >
                <Star className="h-3.5 w-3.5" />
                Note
              </Button>

              <AnimatePresence>
                {ratingOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute bottom-full left-0 mb-2 flex gap-1 rounded-xl border border-border bg-card p-2 shadow-xl"
                  >
                    {[0, 1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          onRate(r);
                          setRatingOpen(false);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold transition-colors hover:bg-muted"
                        title={
                          r === 0
                            ? 'Retirer la note'
                            : `${r} étoile${r > 1 ? 's' : ''}`
                        }
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
              <Flag className="h-3.5 w-3.5" />
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
              <XCircle className="h-3.5 w-3.5" />
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
              <RotateCcw className="h-3.5 w-3.5" />
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
                  <Circle className="h-3.5 w-3.5" />
                  Couleur
                </Button>
                <AnimatePresence>
                  {colorOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute bottom-full left-0 mb-2 flex gap-1.5 rounded-xl border border-border bg-card p-2 shadow-xl"
                    >
                      {COLOR_LABEL_KEYS.map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            onColorLabel(c);
                            setColorOpen(false);
                          }}
                          className="h-6 w-6 rounded-full border-2 border-white/50 transition-transform hover:scale-110"
                          style={{ backgroundColor: COLOR_LABEL_META[c].dot }}
                          title={COLOR_LABEL_META[c].label}
                        />
                      ))}
                      <button
                        onClick={() => {
                          onColorLabel(null);
                          setColorOpen(false);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-border text-xs text-muted-foreground transition-colors hover:text-foreground"
                        title="Retirer le label"
                      >
                        <X className="h-3 w-3" />
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
                <FolderPlus className="h-3.5 w-3.5" />
                Collection
              </Button>
            )}

            <div className="mx-1 h-6 w-px bg-border" />

            {/* 🗑️ Supprimer */}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
              title="Supprimer les photos sélectionnées"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>

            <div className="mx-1 h-6 w-px bg-border" />

            {/* ✕ Effacer sélection */}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 rounded-full p-0"
              onClick={onClearSelection}
              title="Effacer la sélection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
