import React, { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { Photo, COLOR_LABEL_META } from '../types';
import { StarRating } from './ui/star-rating';
import { usePhotoStore } from '../store/photoStore';
import toast from 'react-hot-toast';

interface CullingViewProps {
  photos: Photo[];          // photos filtrées visibles dans le triage
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
  const setPhotoRating   = usePhotoStore((s) => s.setPhotoRating);
  const togglePhotoPick  = usePhotoStore((s) => s.togglePhotoPick);
  const togglePhotoReject = usePhotoStore((s) => s.togglePhotoReject);
  const unflagPhoto      = usePhotoStore((s) => s.unflagPhoto);

  const filmstripRef = useRef<HTMLDivElement>(null);
  const autoAdvanceRef = useRef(autoAdvance);
  const autoTimerRef   = useRef<number | null>(null);
  useEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);

  const currentIndex = photos.findIndex((p) => p.id === currentId);
  const photo = currentIndex >= 0 ? photos[currentIndex] : photos[0] ?? null;

  // Scroll filmstrip pour centrer la photo active
  useEffect(() => {
    if (!filmstripRef.current || !currentId) return;
    const thumb = filmstripRef.current.querySelector(`[data-id="${currentId}"]`) as HTMLElement | null;
    if (thumb) {
      thumb.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
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
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (!photo) return;

      // Navigation
      if (e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') { e.preventDefault(); goNext(); return; }
      if (e.key === 'ArrowLeft'  || e.key === 'k' || e.key === 'K') { e.preventDefault(); goPrev(); return; }
      if (e.key === 'Escape' || e.key === 'l' || e.key === 'L')     { e.preventDefault(); onClose(); return; }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Notation 0–5
      if (['0','1','2','3','4','5'].includes(e.key)) {
        const r = parseInt(e.key);
        setPhotoRating(photo.id, r);
        toast.success(r === 0 ? 'Note retirée' : `${r} étoile${r > 1 ? 's' : ''}`);
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
          toast.success(photo.analysis?.isRejected ? 'Reject retiré' : '❌ Rejetée');
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
  }, [open, photo, goNext, goPrev, onClose, setPhotoRating, togglePhotoPick, togglePhotoReject, unflagPhoto, triggerAutoAdvance]);

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
          className="fixed inset-0 z-[250] bg-black flex flex-col"
        >
          {/* ── Toolbar top ── */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-white/60 text-sm font-mono">
                {currentIndex + 1} / {photos.length}
              </span>
              {autoAdvance && (
                <span className="flex items-center gap-1 text-primary text-xs font-medium">
                  <SkipForward className="w-3 h-3" /> Auto
                </span>
              )}
            </div>

            <p className="text-white/70 text-sm truncate max-w-xs" title={photo.file.name}>
              {photo.file.name}
            </p>

            <button
              onClick={onClose}
              className="text-white/50 hover:text-white transition-colors p-1"
              title="Quitter le mode culling (L ou Échap)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Photo principale ── */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.img
                key={photo.id}
                src={photo.previewUrl}
                alt={photo.file.name}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.15 }}
                className="max-h-full max-w-full object-contain select-none"
                draggable={false}
              />
            </AnimatePresence>

            {/* Boutons navigation latéraux */}
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 disabled:opacity-20 transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex === photos.length - 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 disabled:opacity-20 transition-all"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            {/* Overlay note + flags (bas de la photo) */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
              <div className="flex items-center gap-3">
                {analysis?.isPick && (
                  <span className="bg-green-600/90 text-white text-xs font-medium px-2 py-0.5 rounded">
                    🎯 Pick
                  </span>
                )}
                {analysis?.isRejected && (
                  <span className="bg-red-600/90 text-white text-xs font-medium px-2 py-0.5 rounded">
                    ❌ Rejeté
                  </span>
                )}
                {colorLabel && (
                  <span
                    className="w-3 h-3 rounded-full border-2 border-white/80"
                    style={{ backgroundColor: COLOR_LABEL_META[colorLabel].dot }}
                    title={COLOR_LABEL_META[colorLabel].label}
                  />
                )}
              </div>
              <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 pointer-events-auto">
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
            className="h-20 shrink-0 flex items-center gap-1 px-2 overflow-x-auto bg-black/90 border-t border-white/10"
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
                  className={`relative shrink-0 h-16 w-16 rounded overflow-hidden transition-all ${
                    isActive
                      ? 'ring-2 ring-primary scale-105'
                      : 'opacity-50 hover:opacity-90 hover:scale-105'
                  }`}
                >
                  <img
                    src={p.previewUrl}
                    alt={p.file.name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                  {/* Mini indicateurs */}
                  {pAnalysis?.isPick && (
                    <div className="absolute top-0.5 left-0.5 text-[9px] leading-none">🎯</div>
                  )}
                  {pAnalysis?.isRejected && (
                    <div className="absolute top-0.5 left-0.5 text-[9px] leading-none">❌</div>
                  )}
                  {(pAnalysis?.rating ?? 0) > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 text-center bg-black/60 text-yellow-400 text-[9px] leading-tight py-px">
                      {'★'.repeat(pAnalysis?.rating ?? 0)}
                    </div>
                  )}
                  {/* Numéro */}
                  <div className="absolute top-0.5 right-0.5 text-white/60 text-[8px] font-mono leading-none">
                    {i + 1}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Aide raccourcis (pied) ── */}
          <div className="shrink-0 flex items-center justify-center gap-4 py-1.5 bg-black/80 border-t border-white/5">
            {[
              ['←→', 'Naviguer'],
              ['1–5', 'Étoiles'],
              ['P', 'Pick'],
              ['X', 'Rejeter'],
              ['U', 'Unflag'],
              ['L / Éch', 'Quitter'],
            ].map(([key, label]) => (
              <span key={key} className="text-white/30 text-xs">
                <kbd className="text-white/50 font-mono">{key}</kbd> {label}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
