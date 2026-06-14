import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { usePhotoStore } from '../../store/photoStore';
import { Photo, RetouchOptionKey, RETOUCH_OPTION_KEYS, RetouchOptions } from '../../types';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Filmstrip } from './components/Filmstrip';
import { BeforeAfterPreview } from './components/BeforeAfterPreview';
import { AdjustmentPanel } from './components/AdjustmentPanel';
import { Histogram } from './components/Histogram';
import { PresetsPanel } from './components/PresetsPanel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Checkbox } from '../../components/ui/checkbox';
import { ConfirmationDialog } from '../../components/ui/confirmation-dialog';

const createPhotoMap = (photos: Photo[]) => {
  return new Map(photos.map((photo) => [photo.id, photo]));
};

/**
 * Maps RetouchOptions to an approximate CSS filter string for instant
 * slider preview while the canvas retouch debounces in the background.
 * Values are in the [-100, +100] range; CSS filter baseline is 1.
 */
function retouchOptionsToCssFilter(opts: RetouchOptions): string {
  const parts: string[] = [];
  if (opts.exposure !== 0)
    parts.push(`brightness(${Math.max(0, 1 + opts.exposure / 100).toFixed(3)})`);
  if (opts.contrast !== 0)
    parts.push(`contrast(${Math.max(0, 1 + opts.contrast / 100).toFixed(3)})`);
  const sat = opts.saturation + opts.vibrance * 0.5;
  if (sat !== 0)
    parts.push(`saturate(${Math.max(0, 1 + sat / 100).toFixed(3)})`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

interface SyncSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (options: RetouchOptionKey[]) => void;
  disabled?: boolean;
}

const SyncSettingsDialog: React.FC<SyncSettingsDialogProps> = ({ open, onOpenChange, onApply, disabled = false }) => {
  const [selectedOptions, setSelectedOptions] = useState<Set<RetouchOptionKey>>(new Set(RETOUCH_OPTION_KEYS));

  useEffect(() => {
    if (open) {
      setSelectedOptions(new Set(RETOUCH_OPTION_KEYS));
    }
  }, [open]);

  const toggleOption = (option: RetouchOptionKey, checked: boolean) => {
    setSelectedOptions((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(option);
      } else {
        next.delete(option);
      }
      return next;
    });
  };

  const handleApply = () => {
    onApply(Array.from(selectedOptions));
  };

  const selectAll = () => setSelectedOptions(new Set(RETOUCH_OPTION_KEYS));
  const clearAllOptions = () => setSelectedOptions(new Set());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Synchroniser les réglages</DialogTitle>
          <DialogDescription>
            Choisissez les paramètres de retouche à appliquer aux autres photos sélectionnées.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <button type="button" className="underline" onClick={selectAll}>
              Tout sélectionner
            </button>
            <button type="button" className="underline" onClick={clearAllOptions}>
              Effacer
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
            {RETOUCH_OPTION_KEYS.map((option) => {
              const isChecked = selectedOptions.has(option);
              return (
                <label key={option} className="flex items-center gap-3 rounded-md border border-border/40 bg-muted/10 p-2 text-sm">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(value) => toggleOption(option, Boolean(value))}
                    aria-label={`Synchroniser ${option}`}
                  />
                  <span className="capitalize">{option.replace(/([A-Z])/g, ' $1')}</span>
                </label>
              );
            })}
          </div>
        </div>

        <DialogFooter className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleApply} disabled={selectedOptions.size === 0 || disabled}>
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export function DevelopmentTab() {
  const retouchSessionPhotoIds = usePhotoStore((state) => state.retouchSessionPhotoIds);
  const retouchActivePhotoId = usePhotoStore((state) => state.retouchActivePhotoId);
  const setActiveRetouchPhoto = usePhotoStore((state) => state.setActiveRetouchPhoto);
  const updateRetouchOption = usePhotoStore((state) => state.updateRetouchOption);
  const resetRetouchOptions = usePhotoStore((state) => state.resetRetouchOptions);
  const syncRetouchSettings = usePhotoStore((state) => state.syncRetouchSettings);
  const getRetouchOptions = usePhotoStore((state) => state.getRetouchOptions);
  const getRetouchedPreviewUrl = usePhotoStore((state) => state.getRetouchedPreviewUrl);
  const refreshRetouchPreview = usePhotoStore((state) => state.refreshRetouchPreview);
  const endRetouchSession = usePhotoStore((state) => state.endRetouchSession);
  const setActiveTab = usePhotoStore((state) => state.setActiveTab);
  // Référence brute (déjà un Set dans le store) : `new Set(...)` créerait une
  // nouvelle référence à chaque rendu → cache getSnapshot cassé → boucle infinie (#185).
  const developmentSelection = usePhotoStore((state) => state.developmentSelection);
  const toggleDevelopmentSelection = usePhotoStore((state) => state.toggleDevelopmentSelection);
  const setDevelopmentSelection = usePhotoStore((state) => state.setDevelopmentSelection);
  const retouchProcessingIds = usePhotoStore((state) => state.retouchProcessingIds);
  const computeAutoRetouchPreset = usePhotoStore((state) => state.computeAutoRetouchPreset);
  const clearAutoRetouchState = usePhotoStore((state) => state.clearAutoRetouchState);
  const isAutoRetouchComputing = usePhotoStore((state) => state.isAutoRetouchComputing);
  const autoRetouchError = usePhotoStore((state) => state.autoRetouchError);
  const photos = usePhotoStore((state) => state.photos);

  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  // F-06: local pending state for instant CSS filter preview while canvas debounces
  const [pendingOptions, setPendingOptions] = useState<RetouchOptions | null>(null);
  const pendingRef = useRef<RetouchOptions | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const photosMap = useMemo(() => createPhotoMap(photos), [photos]);
  const sessionPhotos = useMemo(
    () =>
      retouchSessionPhotoIds
        .map((id) => photosMap.get(id))
        .filter((photo): photo is Photo => Boolean(photo)),
    [retouchSessionPhotoIds, photosMap]
  );

  const activePhoto: Photo | null = useMemo(() => {
    if (!retouchActivePhotoId) {
      return null;
    }
    return photosMap.get(retouchActivePhotoId) ?? null;
  }, [photosMap, retouchActivePhotoId]);

  const activeOptions = useMemo(() => {
    if (!retouchActivePhotoId) {
      return null;
    }
    return getRetouchOptions(retouchActivePhotoId);
    // lastUpdated est un déclencheur de recalcul volontaire (les options sont
    // lues via getRetouchOptions et changent quand la retouche est mise à jour).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getRetouchOptions, retouchActivePhotoId, activePhoto?.retouch?.lastUpdated]);

  const activePreviewUrl = useMemo(() => {
    if (!retouchActivePhotoId) {
      return null;
    }
    return getRetouchedPreviewUrl(retouchActivePhotoId);
    // lastUpdated : déclencheur de recalcul volontaire (la preview change quand
    // la retouche est mise à jour).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getRetouchedPreviewUrl, retouchActivePhotoId, activePhoto?.retouch?.lastUpdated]);

  const originalPreviewUrl = activePhoto?.retouch?.originalPreviewUrl ?? activePhoto?.previewUrl ?? null;
  const isProcessing = !!(retouchActivePhotoId && retouchProcessingIds.has(retouchActivePhotoId));

  const previewCssFilter = useMemo(
    () => (pendingOptions ? retouchOptionsToCssFilter(pendingOptions) : undefined),
    [pendingOptions]
  );

  useEffect(() => {
    if (!retouchActivePhotoId && retouchSessionPhotoIds.length > 0) {
      setActiveRetouchPhoto(retouchSessionPhotoIds[0]);
    }
  }, [retouchActivePhotoId, retouchSessionPhotoIds, setActiveRetouchPhoto]);

  useEffect(() => {
    if (retouchActivePhotoId) {
      refreshRetouchPreview(retouchActivePhotoId);
    }
  }, [retouchActivePhotoId, refreshRetouchPreview]);

  useEffect(() => {
    if (sessionPhotos.length === 0) {
      setDevelopmentSelection([]);
    }
  }, [sessionPhotos.length, setDevelopmentSelection]);

  useEffect(() => {
    clearAutoRetouchState();
  }, [retouchActivePhotoId, clearAutoRetouchState]);

  // Clear any pending slider state when switching photos
  useEffect(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    pendingRef.current = null;
    setPendingOptions(null);
  }, [retouchActivePhotoId]);

  const handleAdjustmentChange = useCallback(
    (option: RetouchOptionKey, value: number) => {
      if (!retouchActivePhotoId || !activeOptions) return;

      // Accumulate changes into the pending ref for instant CSS preview
      const base = pendingRef.current ?? activeOptions;
      const next: RetouchOptions = { ...base, [option]: value };
      pendingRef.current = next;
      setPendingOptions(next);

      // Debounce the expensive canvas retouch
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        const toFlush = pendingRef.current;
        if (!toFlush || !retouchActivePhotoId) return;
        Object.entries(toFlush).forEach(([key, val]) => {
          if (activeOptions[key as RetouchOptionKey] !== val) {
            updateRetouchOption(retouchActivePhotoId, key as RetouchOptionKey, val as number);
          }
        });
        pendingRef.current = null;
        setPendingOptions(null);
      }, 300);
    },
    [retouchActivePhotoId, activeOptions, updateRetouchOption]
  );

  const handleResetAdjustments = useCallback(() => {
    setResetDialogOpen(true);
  }, []);

  const confirmResetAdjustments = useCallback(() => {
    if (!retouchActivePhotoId) {
      return;
    }
    resetRetouchOptions(retouchActivePhotoId);
    toast.success('Réglages réinitialisés');
  }, [retouchActivePhotoId, resetRetouchOptions]);

  const handleSyncApply = useCallback(
    async (optionsToSync: RetouchOptionKey[]) => {
      if (!retouchActivePhotoId) {
        return;
      }
      const targets = Array.from(developmentSelection).filter((id) => id !== retouchActivePhotoId);
      if (targets.length === 0) {
        toast.error('Aucune autre photo sélectionnée pour synchroniser.');
        return;
      }
      try {
        await syncRetouchSettings(retouchActivePhotoId, targets, optionsToSync);
        setIsSyncDialogOpen(false);
        toast.success('Réglages synchronisés avec succès.');
      } catch (error) {
        console.error('Sync error', error);
        toast.error('Échec de la synchronisation des réglages.');
      }
    },
    [retouchActivePhotoId, developmentSelection, syncRetouchSettings]
  );

  const handleRefreshPreview = useCallback(() => {
    if (!retouchActivePhotoId) {
      return;
    }
    refreshRetouchPreview(retouchActivePhotoId);
  }, [retouchActivePhotoId, refreshRetouchPreview]);

  const handleAutoRetouch = useCallback(() => {
    if (!retouchActivePhotoId) {
      return;
    }
    computeAutoRetouchPreset(retouchActivePhotoId);
  }, [retouchActivePhotoId, computeAutoRetouchPreset]);

  /** Applique toutes les valeurs d'un preset à la photo active */
  const handleApplyPreset = useCallback(
    (options: RetouchOptions) => {
      if (!retouchActivePhotoId) return;
      const keys = Object.keys(options) as (keyof RetouchOptions)[];
      keys.forEach((key) => {
        updateRetouchOption(retouchActivePhotoId, key, options[key]);
      });
    },
    [retouchActivePhotoId, updateRetouchOption]
  );

  /** Applique un preset à toutes les photos de la sélection développement */
  const handleApplyPresetToAll = useCallback(
    (options: RetouchOptions) => {
      const targets = Array.from(developmentSelection);
      if (targets.length === 0) return;
      const keys = Object.keys(options) as (keyof RetouchOptions)[];
      targets.forEach((photoId) => {
        keys.forEach((key) => {
          updateRetouchOption(photoId, key, options[key]);
        });
      });
    },
    [developmentSelection, updateRetouchOption]
  );

  const handleLeaveDevelopment = () => {
    endRetouchSession();
    setActiveTab('triage');
    clearAutoRetouchState();
  };

  if (sessionPhotos.length === 0) {
    const steps = [
      {
        num: "1",
        icon: "🖼️",
        title: "Importez vos photos",
        desc: "Glissez-déposez vos fichiers dans l'onglet Ingestion, ou cliquez pour les sélectionner. L'IA les analyse automatiquement.",
      },
      {
        num: "2",
        icon: "🎯",
        title: "Triez et sélectionnez",
        desc: "Dans l'onglet Triage, cochez les photos à développer. Utilisez les filtres (Picks, étoiles, labels) pour cibler votre sélection.",
      },
      {
        num: "3",
        icon: "✨",
        title: "Lancez le développement",
        desc: "Cliquez sur « Développer les sélectionnées » dans la barre d'actions. Ici vous pouvez retoucher, synchroniser les réglages et exporter.",
      },
    ];
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="h-full flex flex-col items-center justify-center gap-8 px-4"
      >
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎨</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Espace de développement</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            Retouchez vos photos avec précision grâce aux curseurs professionnels, aux presets et à l'assistance IA.
          </p>
        </div>

        {/* Workflow steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
          {steps.map((step) => (
            <div
              key={step.num}
              className="bg-muted/30 border border-border/40 rounded-xl p-4 flex flex-col gap-2 text-center"
            >
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold text-sm flex items-center justify-center mx-auto">
                {step.num}
              </div>
              <span className="text-2xl">{step.icon}</span>
              <h3 className="font-semibold text-sm">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Tips */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 max-w-md w-full text-sm text-center">
          <span className="font-semibold text-amber-700 dark:text-amber-400">💡 Astuce :</span>
          <span className="text-muted-foreground ml-1">
            Utilisez « Auto-retouche IA » pour obtenir des suggestions de réglages basées sur l'analyse de chaque photo.
          </span>
        </div>

        <Button onClick={() => setActiveTab('triage')} size="lg" className="gap-2">
          Aller au triage →
        </Button>
      </motion.div>
    );
  }

  if (!activePhoto || !activeOptions) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col gap-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold">Développement</h2>
          <p className="text-muted-foreground">
            Ajustez vos photos sélectionnées, synchronisez les réglages et préparez-les pour l'export.
          </p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Lot : <Badge variant="outline">{retouchSessionPhotoIds.length} photo{retouchSessionPhotoIds.length > 1 ? 's' : ''}</Badge>
            </span>
            <span>
              Sélection active : <Badge variant={developmentSelection.size > 0 ? 'default' : 'outline'}>{developmentSelection.size}</Badge>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleLeaveDevelopment}>
            Terminer la session
          </Button>
          <Button
            variant="secondary"
            onClick={() => setIsSyncDialogOpen(true)}
            disabled={developmentSelection.size <= 1}
          >
            Synchroniser…
          </Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[220px_1fr_320px] gap-6 min-h-0">
        <aside className="bg-muted/20 border border-border/40 rounded-lg p-3 overflow-hidden">
          <Filmstrip
            photos={sessionPhotos}
            activePhotoId={retouchActivePhotoId}
            processingIds={retouchProcessingIds}
            developmentSelection={developmentSelection}
            onSelect={setActiveRetouchPhoto}
            onToggleDevelopment={toggleDevelopmentSelection}
          />
        </aside>

        <section className="flex flex-col gap-4 min-h-0">
          <BeforeAfterPreview
            beforeUrl={originalPreviewUrl}
            afterUrl={activePreviewUrl}
            photoName={activePhoto.file.name}
            isProcessing={isProcessing}
            onRefresh={handleRefreshPreview}
            afterCssFilter={previewCssFilter}
          />
          <div className="bg-muted/20 border border-border/40 rounded-lg p-4">
            <Histogram imageUrl={activePreviewUrl ?? originalPreviewUrl ?? undefined} />
          </div>
        </section>

        <aside className="bg-muted/20 border border-border/40 rounded-lg p-4 overflow-y-auto flex flex-col gap-5">
          {/* A-35 : rappel que la retouche est non destructive */}
          <p className="text-[11px] leading-snug text-muted-foreground bg-background/60 border border-border/40 rounded-md px-2.5 py-1.5">
            Réglages <span className="font-medium text-foreground">non destructifs</span> : l'original
            n'est pas modifié ; ils sont appliqués à l'export. « Réinitialiser » les annule.
          </p>
          <PresetsPanel
            currentOptions={activeOptions}
            onApplyPreset={handleApplyPreset}
            onApplyPresetToAll={developmentSelection.size > 1 ? handleApplyPresetToAll : undefined}
            selectedCount={developmentSelection.size}
            disabled={isProcessing}
          />
          <div className="border-t border-border/40" />
          <AdjustmentPanel
            options={activeOptions}
            onChange={handleAdjustmentChange}
            onReset={handleResetAdjustments}
            isProcessing={isProcessing}
            onAuto={handleAutoRetouch}
            isAutoComputing={isAutoRetouchComputing}
            autoError={autoRetouchError}
            lastAutoPreset={activePhoto.retouch?.lastAutoPreset ?? null}
            autoConfidence={activePhoto.retouch?.autoPresetConfidence ?? null}
          />
        </aside>
      </div>

      <SyncSettingsDialog
        open={isSyncDialogOpen}
        onOpenChange={setIsSyncDialogOpen}
        onApply={handleSyncApply}
        disabled={!retouchActivePhotoId}
      />

      <ConfirmationDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        onConfirm={confirmResetAdjustments}
        title="Réinitialiser les réglages ?"
        description="Êtes-vous sûr de vouloir réinitialiser tous les réglages de retouche de cette photo ? Cette action ne peut pas être annulée."
        confirmText="Réinitialiser"
        cancelText="Annuler"
        variant="destructive"
      />
    </motion.div>
  );
}

export default DevelopmentTab;
