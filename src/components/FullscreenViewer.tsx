import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Play, Pause } from 'lucide-react';
import { Photo, COLOR_LABEL_META, COLOR_LABEL_KEYS } from '../types';
import { StarRating } from './ui/star-rating';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { usePhotoStore } from '../store/photoStore';
import { RGBHistogram } from './RGBHistogram';
import toast from 'react-hot-toast';

interface FullscreenViewerProps {
  photo: Photo;
  photos: Photo[];
  open: boolean;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}

function ExifRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-white/50 shrink-0">{label}</span>
      <span className="text-white text-right truncate max-w-[12rem]" title={value}>{value}</span>
    </div>
  );
}

export function FullscreenViewer({
  photo,
  photos,
  open,
  onClose,
  onNext,
  onPrevious
}: FullscreenViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(3); // seconds
  const slideshowTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const setPhotoRating  = usePhotoStore((state) => state.setPhotoRating);
  const togglePhotoPick = usePhotoStore((state) => state.togglePhotoPick);
  const togglePhotoReject = usePhotoStore((state) => state.togglePhotoReject);
  const unflagPhoto     = usePhotoStore((state) => state.unflagPhoto);
  const setColorLabel   = usePhotoStore((state) => state.setColorLabel);

  const currentIndex = photos.findIndex(p => p.id === photo.id);
  const hasNext     = currentIndex < photos.length - 1;
  const hasPrevious = currentIndex > 0;

  // Réinitialiser zoom + pan �  chaque changement de photo
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photo.id]);

  // Réinitialiser pan si zoom redescend �  1
  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  // ── Slideshow auto-advance ────────────────────────────────────────────────
  useEffect(() => {
    if (!slideshowActive || !onNext) {
      if (slideshowTimerRef.current !== null) {
        window.clearInterval(slideshowTimerRef.current);
        slideshowTimerRef.current = null;
      }
      return;
    }
    slideshowTimerRef.current = window.setInterval(() => {
      if (hasNext) {
        onNext();
      } else {
        // Stop at end
        setSlideshowActive(false);
      }
    }, slideshowInterval * 1000);
    return () => {
      if (slideshowTimerRef.current !== null) {
        window.clearInterval(slideshowTimerRef.current);
        slideshowTimerRef.current = null;
      }
    };
  }, [slideshowActive, slideshowInterval, hasNext, onNext]);

  // Stop slideshow when viewer closes
  useEffect(() => {
    if (!open) setSlideshowActive(false);
  }, [open]);

  // ── Wheel zoom (zoom vers curseur) ────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom((prev) => {
      const next = Math.min(8, Math.max(1, prev * factor));
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
        return 1;
      }

      // Zoom vers la position du curseur
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;
        const scale = next / prev;
        setPan((p) => ({
          x: mx - scale * (mx - p.x),
          y: my - scale * (my - p.y),
        }));
      }
      return next;
    });
  };

  // ── Drag to pan ────────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.mx;
    const dy = e.clientY - dragStartRef.current.my;
    setPan({ x: dragStartRef.current.px + dx, y: dragStartRef.current.py + dy });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Keep a stable ref so the keyboard handler always sees fresh values
  const stateRef = useRef({ photo, hasNext, hasPrevious, zoom, pan, showInfo, slideshowActive, onClose, onNext, onPrevious });
  stateRef.current = { photo, hasNext, hasPrevious, zoom, pan, showInfo, slideshowActive, onClose, onNext, onPrevious };

  // Raccourcis clavier en mode plein écran
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;

      // Ignore when typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        case 'Escape':
        case 'f':
        case 'F':
          s.onClose();
          break;
        case 'ArrowRight':
          if (s.hasNext && s.onNext) s.onNext();
          break;
        case 'ArrowLeft':
          if (s.hasPrevious && s.onPrevious) s.onPrevious();
          break;
        case '0': case '1': case '2': case '3': case '4': case '5': {
          const n = parseInt(e.key);
          setPhotoRating(s.photo.id, n);
          toast.success(n === 0 ? 'Note retirée' : `${n} étoile${n > 1 ? 's' : ''}`);
          break;
        }
        case '6': case '7': case '8': case '9': {
          const idx = parseInt(e.key) - 6; // 6→0 rouge, 7→1 jaune, 8→2 vert, 9→3 bleu
          const label = COLOR_LABEL_KEYS[idx];
          if (label) {
            setColorLabel(s.photo.id, label);
            toast.success(`${COLOR_LABEL_META[label].label} appliqué`);
          }
          break;
        }
        case 'p':
        case 'P':
          togglePhotoPick(s.photo.id);
          toast.success(s.photo.analysis?.isPick ? 'Pick retiré' : '🎯 Marqué comme Pick');
          break;
        case 'x':
        case 'X':
          togglePhotoReject(s.photo.id);
          toast.success(s.photo.analysis?.isRejected ? 'Reject retiré' : '❌ Photo rejetée');
          break;
        case 'u':
        case 'U':
          unflagPhoto(s.photo.id);
          toast.success('⚪ Flags retirés');
          break;
        case 'i':
        case 'I':
          stateRef.current.showInfo = !s.showInfo;
          setShowInfo(v => !v);
          break;
        case ' ':
          e.preventDefault();
          setSlideshowActive(v => !v);
          break;
        case '+':
        case '=':
          setZoom((z) => Math.min(z * 1.5, 8));
          break;
        case '-':
        case '_':
          setZoom((z) => {
            const next = Math.max(z / 1.5, 1);
            if (next <= 1) setPan({ x: 0, y: 0 });
            return next;
          });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!open) return null;

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
              <h3 className="text-white font-medium">{photo.file.name}</h3>
              <Badge variant="secondary" className="text-xs">
                {currentIndex + 1} / {photos.length}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              {/* Slideshow controls */}
              {photos.length > 1 && (
                <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1">
                  <select
                    value={slideshowInterval}
                    onChange={(e) => setSlideshowInterval(Number(e.target.value))}
                    className="bg-transparent text-white text-xs outline-none cursor-pointer"
                    title="Durée par photo"
                  >
                    <option value={2} className="bg-black">2 s</option>
                    <option value={3} className="bg-black">3 s</option>
                    <option value={5} className="bg-black">5 s</option>
                    <option value={8} className="bg-black">8 s</option>
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`text-white hover:bg-white/20 h-7 w-7 p-0 ${slideshowActive ? 'bg-white/20' : ''}`}
                    onClick={() => setSlideshowActive(v => !v)}
                    title={slideshowActive ? 'Pause diaporama (Espace)' : 'Lancer le diaporama (Espace)'}
                  >
                    {slideshowActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                </div>
              )}

              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20"
                onClick={() => setShowInfo(!showInfo)}
              >
                {showInfo ? 'Masquer infos' : 'Afficher infos'}
              </Button>

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
        </div>

        {/* Image principale — zone zoom + pan */}
        <div
          ref={containerRef}
          className="absolute inset-0 flex items-center justify-center p-16 overflow-hidden"
          style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          title={zoom > 1 ? 'Double-clic pour réinitialiser' : undefined}
        >
          <motion.img
            key={photo.id}
            src={photo.previewUrl}
            alt={photo.file.name}
            className="max-w-full max-h-full object-contain select-none pointer-events-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '50% 50%',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            draggable={false}
          />
        </div>

        {/* Navigation */}
        {hasPrevious && (
          <Button
            size="lg"
            variant="ghost"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-16 w-16"
            onClick={onPrevious}
          >
            <ChevronLeft className="w-8 h-8" />
          </Button>
        )}

        {hasNext && (
          <Button
            size="lg"
            variant="ghost"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-16 w-16"
            onClick={onNext}
          >
            <ChevronRight className="w-8 h-8" />
          </Button>
        )}

        {/* Footer avec infos et contrôles */}
        <AnimatePresence>
          {showInfo && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6"
            >
              <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-3 gap-8">
                  {/* Notation */}
                  <div className="space-y-3">
                    <h4 className="text-white font-semibold text-sm">Notation</h4>
                    <div className="bg-black/60 backdrop-blur-sm rounded-lg p-3">
                      <StarRating
                        rating={photo.analysis?.rating || 0}
                        onRatingChange={(rating) => {
                          setPhotoRating(photo.id, rating);
                          toast.success(`${rating === 0 ? 'Note retirée' : `${rating} étoile${rating > 1 ? 's' : ''}`}`);
                        }}
                        size="lg"
                        showCount
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={photo.analysis?.isPick ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => {
                          togglePhotoPick(photo.id);
                          toast.success(photo.analysis?.isPick ? 'Pick retiré' : '🎯 Marqué comme Pick');
                        }}
                      >
                        {photo.analysis?.isPick ? '🎯 Pick' : 'P - Pick'}
                      </Button>

                      <Button
                        size="sm"
                        variant={photo.analysis?.isRejected ? 'destructive' : 'outline'}
                        className="flex-1"
                        onClick={() => {
                          togglePhotoReject(photo.id);
                          toast.success(photo.analysis?.isRejected ? 'Reject retiré' : '❌ Photo rejetée');
                        }}
                      >
                        {photo.analysis?.isRejected ? '❌ Reject' : 'X - Reject'}
                      </Button>
                    </div>
                  </div>

                  {/* Métadonnées & EXIF */}
                  <div className="space-y-3">
                    <h4 className="text-white font-semibold text-sm">Métadonnées</h4>
                    <div className="space-y-1.5 text-xs text-white/80">
                      {/* Fichier */}
                      <ExifRow label="Fichier" value={photo.file.name} />
                      <ExifRow label="Taille" value={`${(photo.file.size / 1024 / 1024).toFixed(2)} Mo`} />
                      <ExifRow label="Format" value={photo.file.type.split('/')[1]?.toUpperCase() ?? '—'} />
                      {photo.metadata?.width && photo.metadata?.height && (
                        <ExifRow label="Dimensions" value={`${photo.metadata.width} × ${photo.metadata.height} px`} />
                      )}
                      {/* Analyse IA */}
                      {photo.analysis?.sharpnessScore !== undefined && (
                        <ExifRow label="Netteté" value={`${Math.round(photo.analysis.sharpnessScore * 100)}%`} />
                      )}
                      {photo.analysis?.compositionScore !== undefined && (
                        <ExifRow label="Composition" value={`${Math.round(photo.analysis.compositionScore * 100)}%`} />
                      )}
                      {photo.analysis?.isBlurry !== undefined && (
                        <ExifRow label="Flou" value={photo.analysis.isBlurry ? '❌ Oui' : '✅ Non'} />
                      )}
                      {/* EXIF caméra */}
                      {photo.metadata?.exif && (() => {
                        const e = photo.metadata.exif as Record<string, unknown>;
                        return (
                          <>
                            {e.Make && e.Model && <ExifRow label="Appareil" value={`${e.Make} ${e.Model}`} />}
                            {e.FocalLength && <ExifRow label="Focale" value={`${e.FocalLength} mm`} />}
                            {e.ExposureTime && <ExifRow label="Vitesse" value={`1/${Math.round(1 / Number(e.ExposureTime))} s`} />}
                            {e.FNumber && <ExifRow label="Ouverture" value={`f/${e.FNumber}`} />}
                            {e.ISOSpeedRatings && <ExifRow label="ISO" value={String(e.ISOSpeedRatings)} />}
                            {e.DateTimeOriginal && <ExifRow label="Date" value={String(e.DateTimeOriginal).replace('T', ' ')} />}
                          </>
                        );
                      })()}
                      {/* Tags IA */}
                      {(photo.analysis?.tags ?? []).length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-1">
                          {(photo.analysis!.tags!).slice(0, 6).map((t) => (
                            <span key={t} className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-white/70">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Zoom + Histogramme */}
                  <div className="space-y-3">
                    <h4 className="text-white font-semibold text-sm">Zoom</h4>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const next = Math.max(zoom / 1.5, 1);
                          setZoom(next);
                          if (next <= 1) setPan({ x: 0, y: 0 });
                        }}
                        disabled={zoom <= 1}
                      >
                        <ZoomOut className="w-4 h-4" />
                      </Button>

                      <div className="flex-1 text-center text-white font-medium">
                        {Math.round(zoom * 100)}%
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setZoom(Math.min(zoom * 1.5, 8))}
                        disabled={zoom >= 8}
                      >
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                    >
                      <Maximize2 className="w-4 h-4 mr-2" />
                      Réinitialiser
                    </Button>

                    {/* Histogramme RGB */}
                    <div>
                      <p className="text-white/50 text-xs mb-1.5">Histogramme</p>
                      <RGBHistogram src={photo.previewUrl} height={56} showLegend />
                    </div>
                  </div>
                </div>

                {/* Raccourcis */}
                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="flex flex-wrap gap-4 text-xs text-white/60">
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">←→</kbd> Navigation</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">0-5</kbd> Noter</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">6-9</kbd> Label couleur</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">P</kbd> Pick</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">X</kbd> Reject</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">U</kbd> Unflag</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">I</kbd> Infos</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">+/-</kbd> Zoom</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">Scroll</kbd> Zoom curseur</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">Drag</kbd> Pan</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">2×clic</kbd> Reset</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">Espace</kbd> Diaporama</span>
                    <span><kbd className="px-2 py-1 bg-white/10 rounded">F/ESC</kbd> Quitter</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
