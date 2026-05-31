/**
 * PhotoDetailPanel — panneau slide-in droit affiché quand une photo est sélectionnée en triage.
 * Contient : miniature, méta fichier, analyse AI, histogramme RGB, tags, note utilisateur.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  X,
  Tag,
  StickyNote,
  BarChart2,
  Info,
  Camera,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Photo, COLOR_LABEL_META, COLOR_LABEL_KEYS, ColorLabel } from '../types';
import { usePhotoStore } from '../store/photoStore';
import { formatFileSize } from '../lib/utils';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { StarRating } from './ui/star-rating';
import { RGBHistogram } from './RGBHistogram';

// Référence de tableau vide partagée et stable (voir usage dans le sélecteur tags).
const EMPTY_TAGS: string[] = [];

// ── Section repliable ────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  defaultOpen = true,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        className="w-full flex items-center gap-2 py-2.5 px-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        <span className="uppercase tracking-wider">{title}</span>
        <span className="ml-auto">
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>
      {open && <div className="pb-3 px-1 space-y-2">{children}</div>}
    </div>
  );
}

// ── EXIF helpers ─────────────────────────────────────────────────────────────

function formatExifValue(key: string, val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (key === 'ExposureTime' && typeof val === 'number') {
    return val < 1 ? `1/${Math.round(1 / val)}s` : `${val}s`;
  }
  if (key === 'FNumber' && typeof val === 'number') return `f/${val}`;
  if (key === 'FocalLength' && typeof val === 'number') return `${val}mm`;
  if ((key === 'ISO' || key === 'ISOSpeedRatings') && typeof val === 'number') return `ISO ${val}`;
  if (key === 'DateTimeOriginal' && typeof val === 'string') {
    const d = new Date(val.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
    return isNaN(d.getTime()) ? val : d.toLocaleString('fr-FR');
  }
  if (typeof val === 'object') return null;
  return String(val);
}

const EXIF_FIELDS: { key: string; label: string }[] = [
  { key: 'Make', label: 'Fabricant' },
  { key: 'Model', label: 'Modèle' },
  { key: 'DateTimeOriginal', label: 'Date' },
  { key: 'ExposureTime', label: 'Exposition' },
  { key: 'FNumber', label: 'Ouverture' },
  { key: 'ISO', label: 'ISO' },
  { key: 'ISOSpeedRatings', label: 'ISO' },
  { key: 'FocalLength', label: 'Focale' },
  { key: 'LensModel', label: 'Objectif' },
  { key: 'Flash', label: 'Flash' },
  { key: 'WhiteBalance', label: 'Balance blancs' },
  { key: 'ExposureProgram', label: 'Programme' },
  { key: 'MeteringMode', label: 'Métrologie' },
];

// ── Panneau principal ────────────────────────────────────────────────────────

interface PhotoDetailPanelProps {
  photo: Photo;
  onClose: () => void;
}

export function PhotoDetailPanel({ photo, onClose }: PhotoDetailPanelProps) {
  const setPhotoRating = usePhotoStore((s) => s.setPhotoRating);
  const togglePhotoPick = usePhotoStore((s) => s.togglePhotoPick);
  const togglePhotoReject = usePhotoStore((s) => s.togglePhotoReject);
  const unflagPhoto = usePhotoStore((s) => s.unflagPhoto);
  const setColorLabel = usePhotoStore((s) => s.setColorLabel);
  const updateUserTags = usePhotoStore((s) => s.updateUserTags);
  const setPhotoNote = usePhotoStore((s) => s.setPhotoNote);

  // Référence vide STABLE : `?? []` créerait un nouveau tableau à chaque rendu,
  // ce qui casse le cache de getSnapshot (zustand) → boucle de rendu infinie (#185).
  const userTags = usePhotoStore((s) => s.userTags[photo.id] ?? EMPTY_TAGS);
  const photoNote = usePhotoStore((s) => s.photoNotes[photo.id] ?? '');

  const analysis = photo.analysis;
  const hasAnalysis = !!analysis && !analysis.error;

  // Note locale (debounce vers store)
  const [noteLocal, setNoteLocal] = useState(photoNote);
  const noteTimerRef = useRef<number | null>(null);
  // A-24 : note en attente de persistance (id + valeur), pour pouvoir « flusher »
  // immédiatement au blur, au changement de photo, au démontage et avant unload.
  const pendingNoteRef = useRef<{ id: string; value: string } | null>(null);

  const flushNote = useCallback(() => {
    if (noteTimerRef.current !== null) {
      window.clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }
    const pending = pendingNoteRef.current;
    if (pending) {
      setPhotoNote(pending.id, pending.value);
      pendingNoteRef.current = null;
    }
  }, [setPhotoNote]);

  // Sync note si photo change
  useEffect(() => {
    setNoteLocal(photoNote);
  }, [photo.id, photoNote]);

  // Flush de la note en attente quand on change de photo ou qu'on démonte le panneau.
  // Le cleanup s'exécute avec l'ancien `photo.id` ; pendingNoteRef porte le bon id.
  useEffect(() => () => flushNote(), [photo.id, flushNote]);

  // Flush avant fermeture/rechargement de l'onglet.
  useEffect(() => {
    const handler = () => flushNote();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flushNote]);

  const handleNoteChange = useCallback((val: string) => {
    setNoteLocal(val);
    pendingNoteRef.current = { id: photo.id, value: val };
    if (noteTimerRef.current !== null) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => {
      setPhotoNote(photo.id, val);
      pendingNoteRef.current = null;
      noteTimerRef.current = null;
    }, 600);
  }, [photo.id, setPhotoNote]);

  // Tag inline editor
  const [tagInput, setTagInput] = useState('');
  const addTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    if (!userTags.includes(tag)) {
      updateUserTags(photo.id, [...userTags, tag]);
    }
    setTagInput('');
  }, [tagInput, userTags, photo.id, updateUserTags]);

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      addTag();
      e.preventDefault();
    }
  };
  const handleRemoveTag = (tag: string) => {
    updateUserTags(photo.id, userTags.filter((t) => t !== tag));
  };

  // EXIF
  const exifObj = (analysis === null ? null : (photo.metadata?.exif)) as Record<string, unknown> | null | undefined;
  const exifRows = exifObj
    ? EXIF_FIELDS.map((f) => ({ label: f.label, value: formatExifValue(f.key, exifObj[f.key]) }))
        .filter((row) => row.value !== null)
        // dédoublonner ISO / ISOSpeedRatings
        .filter((row, i, arr) => arr.findIndex((r) => r.value === row.value && r.label === row.label) === i)
    : [];

  const isMobile = useIsMobile();

  // ── Bottom-sheet (mobile) vs side-panel (desktop) ────────────────────────
  const motionProps = isMobile
    ? {
        initial: { y: '100%', opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: '100%', opacity: 0 },
        transition: { type: 'spring' as const, damping: 30, stiffness: 300 },
        className:
          'fixed bottom-0 left-0 right-0 z-50 max-h-[75vh] bg-card border-t border-border/50 flex flex-col overflow-hidden rounded-t-2xl shadow-2xl',
      }
    : {
        initial: { x: 40, opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: 40, opacity: 0 },
        transition: { duration: 0.22, ease: 'easeOut' as const },
        className:
          'w-72 flex-shrink-0 bg-card border-l border-border/50 flex flex-col overflow-hidden rounded-l-xl shadow-xl',
      };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <motion.aside
        key="photo-detail-panel"
        {...motionProps}
      >
        {/* Mobile drag handle */}
        {isMobile && (
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>
        )}

        {/* En-tête */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40 shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Détail</span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            title="Fermer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Miniature */}
        <div className="aspect-video relative overflow-hidden bg-muted/30">
          <img
            src={photo.previewUrl}
            alt={photo.file.name}
            className="w-full h-full object-contain"
          />
          {/* Badge pick / reject overlay */}
          {analysis?.isPick && (
            <div className="absolute top-2 left-2">
              <Badge className="text-xs bg-green-600 text-white border-green-700">🎯 Pick</Badge>
            </div>
          )}
          {(analysis?.isRejected) && (
            <div className="absolute top-2 left-2">
              <Badge variant="destructive" className="text-xs">❌ Rejetée</Badge>
            </div>
          )}
          {analysis?.colorLabel && (
            <div className="absolute bottom-2 right-2">
              <div
                className="w-4 h-4 rounded-full border-2 border-white/80 shadow"
                style={{ backgroundColor: COLOR_LABEL_META[analysis.colorLabel].dot }}
              />
            </div>
          )}
        </div>

        <div className="px-3 py-1 space-y-0.5">
          {/* Nom fichier */}
          <p className="text-sm font-semibold truncate text-foreground mt-2" title={photo.file.name}>
            {photo.file.name}
          </p>

          {/* Actions rapides */}
          <div className="flex items-center gap-1.5 py-2">
            <div onClick={(e) => e.stopPropagation()}>
              <StarRating
                rating={analysis?.rating ?? 0}
                onRatingChange={(r) => setPhotoRating(photo.id, r)}
                size="sm"
              />
            </div>
            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant={analysis?.isPick ? 'default' : 'outline'}
                className="h-7 px-2 text-xs"
                onClick={() => togglePhotoPick(photo.id)}
                title="Marquer Pick (P)"
              >
                {analysis?.isPick ? '🎯' : 'P'}
              </Button>
              <Button
                size="sm"
                variant={analysis?.isRejected ? 'destructive' : 'outline'}
                className="h-7 px-2 text-xs"
                onClick={() => togglePhotoReject(photo.id)}
                title="Rejeter (X)"
              >
                X
              </Button>
              {(analysis?.isPick || analysis?.isRejected) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => unflagPhoto(photo.id)}
                  title="Retirer flags (U)"
                >
                  U
                </Button>
              )}
            </div>
          </div>

          {/* Labels couleur */}
          <div className="flex gap-1.5 py-1">
            {COLOR_LABEL_KEYS.map((label) => {
              const meta = COLOR_LABEL_META[label];
              const active = analysis?.colorLabel === label;
              return (
                <button
                  key={label}
                  title={meta.label}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    active ? 'scale-125 border-white/80 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-110'
                  }`}
                  style={{ backgroundColor: meta.dot }}
                  onClick={() => setColorLabel(photo.id, active ? null : label)}
                />
              );
            })}
            {analysis?.colorLabel && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground ml-1"
                onClick={() => setColorLabel(photo.id, null)}
                title="Retirer le label"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sections */}
          <div className="mt-2">

            {/* Infos fichier */}
            <Section icon={<Info className="w-3.5 h-3.5" />} title="Fichier">
              <table className="w-full text-xs">
                <tbody>
                  <tr>
                    <td className="text-muted-foreground pr-3 py-0.5 whitespace-nowrap">Taille</td>
                    <td className="font-medium">{formatFileSize(photo.file.size)}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground pr-3 py-0.5 whitespace-nowrap">Type</td>
                    <td className="font-medium">{photo.file.type || '—'}</td>
                  </tr>
                  {photo.metadata?.width && photo.metadata?.height && (
                    <tr>
                      <td className="text-muted-foreground pr-3 py-0.5 whitespace-nowrap">Dimensions</td>
                      <td className="font-medium">{photo.metadata.width} × {photo.metadata.height}</td>
                    </tr>
                  )}
                  {photo.file.lastModified && (
                    <tr>
                      <td className="text-muted-foreground pr-3 py-0.5 whitespace-nowrap">Modifié</td>
                      <td className="font-medium">
                        {new Date(photo.file.lastModified).toLocaleDateString('fr-FR')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>

            {/* Analyse AI */}
            {hasAnalysis && (
              <Section icon={<BarChart2 className="w-3.5 h-3.5" />} title="Analyse">
                <table className="w-full text-xs">
                  <tbody>
                    {analysis.sharpnessScore !== undefined && (
                      <tr>
                        <td className="text-muted-foreground pr-3 py-0.5 whitespace-nowrap">Netteté</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted/50 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  analysis.sharpnessScore > 0.7 ? 'bg-green-500' :
                                  analysis.sharpnessScore > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${analysis.sharpnessScore * 100}%` }}
                              />
                            </div>
                            <span className="font-medium w-8 text-right">
                              {Math.round(analysis.sharpnessScore * 100)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {analysis.compositionScore !== undefined && (
                      <tr>
                        <td className="text-muted-foreground pr-3 py-0.5 whitespace-nowrap">Composition</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted/50 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${analysis.compositionScore * 100}%` }}
                              />
                            </div>
                            <span className="font-medium w-8 text-right">
                              {Math.round(analysis.compositionScore * 100)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {analysis.isBlurry !== undefined && (
                      <tr>
                        <td className="text-muted-foreground pr-3 py-0.5">Flou</td>
                        <td className="font-medium">{analysis.isBlurry ? '⚠️ Floue' : '✅ Nette'}</td>
                      </tr>
                    )}
                    {analysis.hasOpenEyes !== undefined && (
                      <tr>
                        <td className="text-muted-foreground pr-3 py-0.5">Yeux</td>
                        <td className="font-medium">{analysis.hasOpenEyes ? '✅ Ouverts' : '⚠️ Fermés'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Section>
            )}

            {/* Histogramme RGB */}
            <Section icon={<BarChart2 className="w-3.5 h-3.5" />} title="Histogramme" defaultOpen={false}>
              <RGBHistogram src={photo.previewUrl} height={64} showLegend />
            </Section>

            {/* EXIF */}
            {exifRows.length > 0 && (
              <Section icon={<Camera className="w-3.5 h-3.5" />} title="EXIF" defaultOpen={false}>
                <table className="w-full text-xs">
                  <tbody>
                    {exifRows.map((row) => (
                      <tr key={`${row.label}-${row.value}`}>
                        <td className="text-muted-foreground pr-3 py-0.5 whitespace-nowrap">{row.label}</td>
                        <td className="font-medium truncate max-w-[120px]" title={row.value ?? undefined}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* Tags AI */}
            {hasAnalysis && analysis.tags && analysis.tags.length > 0 && (
              <Section icon={<Tag className="w-3.5 h-3.5" />} title="Tags AI">
                <div className="flex flex-wrap gap-1">
                  {analysis.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {/* Tags utilisateur */}
            <Section icon={<Tag className="w-3.5 h-3.5" />} title="Mes tags">
              <div className="flex flex-wrap gap-1 mb-2">
                {userTags.map((tag) => (
                  <button
                    key={tag}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-primary/10 text-primary hover:bg-destructive/10 hover:text-destructive transition-colors"
                    onClick={() => handleRemoveTag(tag)}
                    title="Supprimer ce tag"
                  >
                    {tag} <X className="w-2.5 h-2.5 ml-0.5" />
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Ajouter tag…"
                  className="flex-1 text-xs bg-muted/40 border border-border/40 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  onClick={addTag}
                  disabled={!tagInput.trim()}
                  className="shrink-0 px-2 py-1.5 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                >
                  Ajouter
                </button>
              </div>
            </Section>

            {/* Notes */}
            <Section icon={<StickyNote className="w-3.5 h-3.5" />} title="Note">
              <textarea
                value={noteLocal}
                onChange={(e) => handleNoteChange(e.target.value)}
                onBlur={flushNote}
                placeholder="Ajoutez une note…"
                rows={3}
                className="w-full text-xs bg-muted/40 border border-border/40 rounded px-2 py-1.5 outline-none resize-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
              />
            </Section>

          </div>
        </div>
      </div>
    </motion.aside>
    </>
  );
}
