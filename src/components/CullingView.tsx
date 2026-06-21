import React, { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { Photo, COLOR_LABEL_META } from '../types';
import { StarRating } from './ui/star-rating';
import { usePhotoStore } from '../store/photoStore';
import toast from 'react-hot-toast';

interface CullingViewProps {
  photos: Photo[]; // photos filtrées visibles dans le triage
  currentId: string | null;
  open: boolean;
  autoAdvance: boolean;
  onClose: () => void;
  onSelectPhoto: (id: string) => void;
}

export function CullingView({
  photos,
  currentId,
  open,
  autoAdvance,
  onClose,
  onSelectPhoto,
}: CullingViewProps) {
  const setPhotoRating = usePhotoStore((s) => s.setPhotoRating);
  const togglePhotoPick = usePhotoStore((s) => s.togglePhotoPick);
  const togglePhotoReject = usePhotoStore((s) => s.togglePhotoReject);
  const unflagPhoto = usePhotoStore((s) => s.unflagPhoto);

  const filmstripRef = useRef<HTMLDivElement>(null);
  const autoAdvanceRef = useRef(autoAdvance);
  const autoTimerRef = useRef<number | null>(null);
  useEffect(() => {
    autoAdvanceRef.current = autoAdvance;
  }, [autoAdvance]);

  const currentIndex = photos.findIndex((p) => p.id === currentId);
  const photo = currentIndex >= 0 ? photos[currentIndex] : (photos[0] ?? null);

  // Scroll filmstrip pour centrer la photo active
  useEffect(() => {
    if (!filmstripRef.current || !currentId) return;
    const thumb = filmstripRef.current.querySelector(
      `[data-id="${currentId}"]`
    ) as HTMLElement | null;
    if (thumb) {
      thumb.scrollIntoView({
        inline: 'center',
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentId]);

  const goNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      onSelectPhoto(photos[currentIndex + 1].id);
    }
  }, [currentIndex, photos, onSelectPhoto]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      onSelectPhoto(photos[currentIndex - 1].id);
    }
  }, [currentIndex, photos, onSelectPhoto]);

  const triggerAutoAdvance = useCallback(() => {
    if (!autoAdvanceRef.current) return;
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = window.setTimeout(goNext, 280);
  }, [goNext]);

  // Raccourcis clavier propres au culling
  useEffect(() => {
    if (!open) return undefined;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (!photo) return;

      // Navigation
      if (e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === 'Escape' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Notation 0–5
      if (['0', '1', '2', '3', '4', '5'].includes(e.key)) {
        const r = parseInt(e.key);
        setPhotoRating(photo.id, r);
        toast.success(
          r === 0 ? 'Note retirée' : `${r} étoile${r > 1 ? 's' : ''}`
        );
        triggerAutoAdvance();
        return;
      }

      // Flags
      switch (e.key.toLowerCase()) {
        case 'p':
          e.preventDefault();
          togglePhotoPick(photo.id);
          toast.success(photo.analysis?.isPick ? 'Pick retiré' : '🎯 Pick');
          triggerAutoAdvance();
          break;
        case 'x':
          e.preventDefault();
          togglePhotoReject(photo.id);
          toast.success(
            photo.analysis?.isRejected ? 'Reject retiré' : '❌ Rejetée'
          );
          triggerAutoAdvance();
          break;
        case 'u':
          e.preventDefault();
          unflagPhoto(photo.id);
          toast.success('⚪ Flags retirés');
          triggerAutoAdvance();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    open,
    photo,
    goNext,
    goPrev,
    onClose,
    setPhotoRating,
    togglePhotoPick,
    togglePhotoReject,
    unflagPhoto,
    triggerAutoAdvance,
  ]);

  if (!open || !photo) return null;

  const analysis = photo.analysis;
  const colorLabel = analysis?.colorLabel;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[250] flex flex-col bg-black"
        >
          {/* ── Toolbar top ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/80 px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-white/60">
                {currentIndex + 1} / {photos.length}
              </span>
              {autoAdvance && (
                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                  <SkipForward className="h-3 w-3" /> Auto
                </span>
              )}
            </div>

            <p
              className="max-w-xs truncate text-sm text-white/70"
              title={photo.file.name}
            >
              {photo.file.name}
            </p>

            <button
              onClick={onClose}
              className="p-1 text-white/50 transition-colors hover:text-white"
              title="Quitter le mode culling (L ou Échap)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* ── Photo principale ── */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.img
                key={photo.id}
                src={photo.previewUrl}
                alt={photo.file.name}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.15 }}
                className="max-h-full max-w-full select-none object-contain"
                draggable={false}
              />
            </AnimatePresence>

            {/* Boutons navigation latéraux */}
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-all hover:bg-black/80 disabled:opacity-20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex === photos.length - 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-all hover:bg-black/80 disabled:opacity-20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            {/* Overlay note + flags (bas de la photo) */}
            <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                {analysis?.isPick && (
                  <span className="rounded bg-green-600/90 px-2 py-0.5 text-xs font-medium text-white">
                    🎯 Pick
                  </span>
                )}
                {analysis?.isRejected && (
                  <span className="rounded bg-red-600/90 px-2 py-0.5 text-xs font-medium text-white">
                    ❌ Rejeté
                  </span>
                )}
                {colorLabel && (
                  <span
                    className="h-3 w-3 rounded-full border-2 border-white/80"
                    style={{
                      backgroundColor: COLOR_LABEL_META[colorLabel].dot,
                    }}
                    title={COLOR_LABEL_META[colorLabel].label}
                  />
                )}
              </div>
              <div className="pointer-events-auto rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-sm">
                <StarRating
                  rating={analysis?.rating ?? 0}
                  onRatingChange={(r) => {
                    setPhotoRating(photo.id, r);
                    triggerAutoAdvance();
                  }}
                  size="md"
                />
              </div>
            </div>
          </div>

          {/* ── Filmstrip ── */}
          <div
            ref={filmstripRef}
            className="flex h-20 shrink-0 items-center gap-1 overflow-x-auto border-t border-white/10 bg-black/90 px-2"
            style={{ scrollbarWidth: 'none' }}
          >
            {photos.map((p, i) => {
              const isActive = p.id === currentId;
              const pAnalysis = p.analysis;
              return (
                <button
                  key={p.id}
                  data-id={p.id}
                  onClick={() => onSelectPhoto(p.id)}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded transition-all ${
                    isActive
                      ? 'scale-105 ring-2 ring-primary'
                      : 'opacity-50 hover:scale-105 hover:opacity-90'
                  }`}
                >
                  <img
                    src={p.previewUrl}
                    alt={p.file.name}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  {/* Mini indicateurs */}
                  {pAnalysis?.isPick && (
                    <div className="absolute left-0.5 top-0.5 text-[9px] leading-none">
                      🎯
                    </div>
                  )}
                  {pAnalysis?.isRejected && (
                    <div className="absolute left-0.5 top-0.5 text-[9px] leading-none">
                      ❌
                    </div>
                  )}
                  {(pAnalysis?.rating ?? 0) > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-px text-center text-[9px] leading-tight text-yellow-400">
                      {'★'.repeat(pAnalysis?.rating ?? 0)}
                    </div>
                  )}
                  {/* Numéro */}
                  <div className="absolute right-0.5 top-0.5 font-mono text-[8px] leading-none text-white/60">
                    {i + 1}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Aide raccourcis (pied) ── */}
          <div className="flex shrink-0 items-center justify-center gap-4 border-t border-white/5 bg-black/80 py-1.5">
            {[
              ['←→', 'Naviguer'],
              ['1–5', 'Étoiles'],
              ['P', 'Pick'],
              ['X', 'Rejeter'],
              ['U', 'Unflag'],
              ['L / Éch', 'Quitter'],
            ].map(([key, label]) => (
              <span key={key} className="text-xs text-white/30">
                <kbd className="font-mono text-white/50">{key}</kbd> {label}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
