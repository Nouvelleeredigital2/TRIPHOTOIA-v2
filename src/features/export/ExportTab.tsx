import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { usePhotoStore } from '../../store/photoStore';
import { useAuthStore } from '../../store/authStore';
import { trackStats } from '../../lib/sync-utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { formatFileSize } from '../../lib/utils';
import { Photo } from '../../types';
import toast from 'react-hot-toast';
import {
  exportPhotoChaptersAsZip,
  exportPhotosAsZip,
  exportPhotosToDirectory,
  supportsDirectoryExport,
  assessZipExport,
  downloadBlob,
  generateZipFileName,
  WatermarkPosition,
} from '../../lib/export-utils';
import {
  loadPresets,
  createPreset,
  deletePreset,
  updatePreset,
  ExportPreset,
} from '../../lib/export-presets';
import { BookmarkPlus, Trash2, Download } from 'lucide-react';
import { ConfirmationDialog } from '../../components/ui/confirmation-dialog';
import { ExportFilterBar } from './components/ExportFilterBar';
import { RenamePanel } from './components/RenamePanel';
import { buildExportChapters } from './exportChapters';
import { buildDuplicatePhotoIds, buildPhotosToExport } from './exportSelection';
import type { ExportFormData } from './exportTypes';

export type { ExportFormData } from './exportTypes';

const fsaAvailable = supportsDirectoryExport();

// ── Component ─────────────────────────────────────────────────────────────────

function ExportTab() {
  const duplicateGroups = usePhotoStore((state) => state.duplicateGroups);
  const rejectedPhotoIds = usePhotoStore((state) => state.rejectedPhotoIds);
  const pendingExportFilterMode = usePhotoStore(
    (state) => state.pendingExportFilterMode
  );
  const setPendingExportFilterMode = usePhotoStore(
    (state) => state.setPendingExportFilterMode
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // ── Presets state (handlers defined after form below) ────────────────────
  const [presets, setPresets] = useState<ExportPreset[]>(() => loadPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [savePresetName, setSavePresetName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const refreshPresets = useCallback(() => setPresets(loadPresets()), []);

  const collections = usePhotoStore((state) => state.collections);
  const collectionOrder = usePhotoStore((state) => state.collectionOrder);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  const allPhotos = usePhotoStore((state) => state.photos);

  const activeCollection = useMemo(
    () => collections[activeCollectionId],
    [collections, activeCollectionId]
  );

  const activePhotos = useMemo(() => {
    if (!activeCollection) return allPhotos;
    const photoMap = new Map(allPhotos.map((p) => [p.id, p]));
    return activeCollection.photoIds
      .map((id) => photoMap.get(id))
      .filter((p): p is Photo => Boolean(p));
  }, [activeCollection, allPhotos]);

  const form = useForm<ExportFormData>({
    defaultValues: {
      format: 'original',
      quality: 90,
      maxWidth: 1920,
      maxHeight: 1080,
      includeRejected: false,
      includeDuplicates: false,
      renamePattern: '',
      filterMode: 'all',
      minRating: 3,
      watermarkEnabled: false,
      watermarkText: '© Mon Studio',
      watermarkPosition: 'bottom-right',
      watermarkSize: 28,
      watermarkOpacity: 70,
      watermarkColor: '#ffffff',
    },
  });

  useEffect(() => {
    if (!pendingExportFilterMode) return;
    form.setValue('filterMode', pendingExportFilterMode, { shouldDirty: true });
    setPendingExportFilterMode(null);
  }, [form, pendingExportFilterMode, setPendingExportFilterMode]);

  // ── Preset handlers (after form so no TDZ) ──────────────────────────────
  const handleLoadPreset = useCallback(
    (id: string) => {
      const preset = presets.find((p) => p.id === id);
      if (!preset) return;
      form.reset(preset.data);
      setSelectedPresetId(id);
      toast.success(`Preset "${preset.name}" chargé`);
    },
    [presets, form]
  );

  const [overwriteTarget, setOverwriteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const doUpdatePreset = useCallback(
    (id: string, label: string) => {
      updatePreset(id, form.getValues());
      refreshPresets();
      setSelectedPresetId(id);
      setSavePresetName('');
      setShowSaveInput(false);
      toast.success(`Preset "${label}" mis à jour`);
    },
    [form, refreshPresets]
  );

  const handleSavePreset = useCallback(() => {
    // A-33 : nom obligatoire (plus de repli silencieux « Preset »).
    const name = savePresetName.trim();
    if (selectedPresetId && presets.some((p) => p.id === selectedPresetId)) {
      const existing = presets.find((p) => p.id === selectedPresetId);
      doUpdatePreset(selectedPresetId, existing?.name ?? (name || 'Preset'));
      return;
    }
    if (!name) {
      toast.error('Donnez un nom au preset.');
      return;
    }
    // A-33 : si le nom entre en collision avec un preset existant, confirmer l'écrasement.
    const clash = presets.find(
      (p) => p.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (clash) {
      setOverwriteTarget({ id: clash.id, name: clash.name });
      return;
    }
    const created = createPreset(name, form.getValues());
    refreshPresets();
    setSelectedPresetId(created.id);
    setSavePresetName('');
    setShowSaveInput(false);
    toast.success(`Preset "${created.name}" sauvegardé`);
  }, [
    savePresetName,
    selectedPresetId,
    presets,
    form,
    refreshPresets,
    doUpdatePreset,
  ]);

  const [presetDeleteOpen, setPresetDeleteOpen] = useState(false);

  const handleDeletePreset = useCallback(() => {
    if (!selectedPresetId) return;
    setPresetDeleteOpen(true);
  }, [selectedPresetId]);

  const confirmDeletePreset = useCallback(() => {
    if (!selectedPresetId) return;
    const preset = presets.find((p) => p.id === selectedPresetId);
    deletePreset(selectedPresetId);
    refreshPresets();
    setSelectedPresetId('');
    toast.success(`Preset "${preset?.name ?? ''}" supprimé`);
  }, [selectedPresetId, presets, refreshPresets]);

  const presetToDeleteName =
    presets.find((p) => p.id === selectedPresetId)?.name ?? '';

  const {
    includeRejected,
    includeDuplicates,
    qualityValue,
    filterMode,
    watermarkEnabled,
    watermarkOpacity,
    watermarkSize,
    format,
  } = {
    includeRejected: form.watch('includeRejected'),
    includeDuplicates: form.watch('includeDuplicates'),
    qualityValue: form.watch('quality'),
    filterMode: form.watch('filterMode'),
    watermarkEnabled: form.watch('watermarkEnabled'),
    watermarkOpacity: form.watch('watermarkOpacity'),
    watermarkSize: form.watch('watermarkSize'),
    format: form.watch('format'),
  };

  // ── Build photo list ──────────────────────────────────────────────────────

  const buildPhotosToExportFromForm = (data: ExportFormData): Photo[] => {
    return buildPhotosToExport({
      photos: activePhotos,
      duplicateGroups,
      rejectedPhotoIds,
      options: {
        includeRejected: data.includeRejected,
        includeDuplicates: data.includeDuplicates,
        filterMode: data.filterMode,
        minRating: data.minRating,
      },
    });
  };

  // ── Export stats (reactive) ───────────────────────────────────────────────

  const minRatingWatch = form.watch('minRating');
  const filterModeWatch = form.watch('filterMode');

  const exportStats = useMemo(() => {
    const analyzedPhotos = activePhotos.filter(
      (p) => p.analysis && !p.analysis.error
    );
    const photos = buildPhotosToExport({
      photos: activePhotos,
      duplicateGroups,
      rejectedPhotoIds,
      options: {
        includeRejected,
        includeDuplicates,
        filterMode: filterModeWatch,
        minRating: minRatingWatch,
      },
    });

    const totalSize = photos.reduce((sum, p) => sum + p.file.size, 0);
    const duplicatePhotoIds = buildDuplicatePhotoIds(
      analyzedPhotos,
      duplicateGroups
    );
    const duplicatesCount = duplicateGroups.filter((g) =>
      g.photos.some((p) => duplicatePhotoIds.has(p.id))
    ).length;
    const rejectedCount = photos.filter(
      (p) => rejectedPhotoIds.has(p.id) || p.analysis?.isRejected
    ).length;

    return {
      count: photos.length,
      totalSize,
      duplicates: duplicatesCount,
      rejected: rejectedCount,
    };
  }, [
    activePhotos,
    duplicateGroups,
    rejectedPhotoIds,
    includeRejected,
    includeDuplicates,
    filterModeWatch,
    minRatingWatch,
  ]);

  // A-31 : nombre réel de photos exportables par chapitres (selon les filtres courants),
  // pour ne pas activer le bouton si rien n'est exportable.
  const exportableChapterCount = useMemo(() => {
    const chapters = buildExportChapters({
      photos: allPhotos,
      collections,
      collectionOrder,
      duplicateGroups,
      rejectedPhotoIds,
      options: {
        includeRejected,
        includeDuplicates,
        filterMode: filterModeWatch,
        minRating: minRatingWatch,
      },
    });
    return chapters.reduce((sum, c) => sum + c.photos.length, 0);
  }, [
    allPhotos,
    collections,
    collectionOrder,
    duplicateGroups,
    rejectedPhotoIds,
    includeRejected,
    includeDuplicates,
    filterModeWatch,
    minRatingWatch,
  ]);

  // ── Handle submit ─────────────────────────────────────────────────────────

  // A-29 : feedback honnête succès complet / partiel / échec total.
  const reportExportResult = (
    result: { exported: number; failed: number; failedNames: string[] },
    mode: 'ZIP' | 'dossier' | 'chapitres'
  ) => {
    // A-46 : comptabiliser les exports réussis dans les analytics.
    if (result.exported > 0) {
      const uid = useAuthStore.getState().user?.id;
      if (uid)
        trackStats(uid, { exports_count: result.exported }).catch(() => {});
    }
    if (result.failed === 0) {
      toast.success(
        `Export ${mode} terminé : ${result.exported} photo${result.exported > 1 ? 's' : ''}.`
      );
    } else if (result.exported === 0) {
      toast.error(
        `Échec de l'export : aucune des ${result.failed} photos n'a pu être traitée.`
      );
    } else {
      const sample = result.failedNames.slice(0, 3).join(', ');
      const more =
        result.failedNames.length > 3
          ? ` (+${result.failedNames.length - 3})`
          : '';
      toast(
        `Export ${mode} terminé avec ${result.failed} erreur(s) — ${result.exported} réussie(s). Échecs : ${sample}${more}`,
        { icon: '⚠️', duration: 7000 }
      );
    }
  };

  const handleExport = async (data: ExportFormData) => {
    const photosToExport = buildPhotosToExportFromForm(data);
    if (photosToExport.length === 0) {
      toast.error('Aucune photo à exporter');
      return;
    }

    // P1-8 : avertir avant un ZIP volumineux construit en mémoire (l'export
    // vers dossier streame sur disque, donc non concerné).
    if (!fsaAvailable) {
      const assessment = assessZipExport(photosToExport);
      if (assessment.message && !window.confirm(assessment.message)) {
        return;
      }
    }

    setIsExporting(true);
    setExportProgress(0);

    const options = {
      format: data.format,
      quality: data.quality,
      maxWidth: data.maxWidth,
      maxHeight: data.maxHeight,
      renamePattern: data.renamePattern || undefined,
      watermark:
        data.watermarkEnabled && data.watermarkText.trim()
          ? {
              text: data.watermarkText,
              position: data.watermarkPosition as WatermarkPosition,
              size: data.watermarkSize,
              opacity: data.watermarkOpacity,
              color: data.watermarkColor,
            }
          : undefined,
    };

    try {
      let result: { exported: number; failed: number; failedNames: string[] };
      if (fsaAvailable) {
        result = await exportPhotosToDirectory(photosToExport, options, (p) =>
          setExportProgress(p)
        );
      } else {
        const zipResult = await exportPhotosAsZip(
          photosToExport,
          options,
          (p) => setExportProgress(p)
        );
        downloadBlob(
          zipResult.blob,
          generateZipFileName(activeCollection?.name)
        );
        result = zipResult;
      }
      reportExportResult(result, fsaAvailable ? 'dossier' : 'ZIP');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error("Erreur lors de l'export");
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const handleExportByChapters = async () => {
    const data = form.getValues();
    const chapters = buildExportChapters({
      photos: allPhotos,
      collections,
      collectionOrder,
      duplicateGroups,
      rejectedPhotoIds,
      options: {
        includeRejected: data.includeRejected,
        includeDuplicates: data.includeDuplicates,
        filterMode: data.filterMode,
        minRating: data.minRating,
      },
    });

    if (chapters.length === 0) {
      toast.error('Aucun chapitre à exporter');
      return;
    }

    // P1-8 : l'export par chapitres assemble toujours un ZIP en mémoire.
    const assessment = assessZipExport(chapters.flatMap((c) => c.photos));
    if (assessment.message && !window.confirm(assessment.message)) {
      return;
    }

    const options = {
      format: data.format,
      quality: data.quality,
      maxWidth: data.maxWidth,
      maxHeight: data.maxHeight,
      renamePattern: data.renamePattern || undefined,
      watermark:
        data.watermarkEnabled && data.watermarkText.trim()
          ? {
              text: data.watermarkText,
              position: data.watermarkPosition as WatermarkPosition,
              size: data.watermarkSize,
              opacity: data.watermarkOpacity,
              color: data.watermarkColor,
            }
          : undefined,
    };

    try {
      setIsExporting(true);
      setExportProgress(0);
      const result = await exportPhotoChaptersAsZip(chapters, options, (p) =>
        setExportProgress(p)
      );
      downloadBlob(result.blob, generateZipFileName('chapitres-mariage'));
      reportExportResult(result, 'chapitres');
    } catch (error) {
      toast.error("Erreur lors de l'export par chapitres");
      console.error('Chapter export error:', error);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-bold">Exportation</h2>
        <p className="text-muted-foreground">
          Configurez et exportez vos photos triées
        </p>
      </div>

      {/* ── Presets d'export ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Presets d&apos;export</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {/* Sélecteur */}
            <select
              value={selectedPresetId}
              onChange={(e) => {
                if (e.target.value) handleLoadPreset(e.target.value);
                else setSelectedPresetId('');
              }}
              className="h-9 min-w-[160px] flex-1 rounded-lg border border-border/60 bg-background px-2 text-sm text-foreground"
            >
              <option value="">— Sélectionner un preset —</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Bouton sauvegarder */}
            {!showSaveInput ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setShowSaveInput(true);
                  setTimeout(() => saveInputRef.current?.focus(), 50);
                }}
                title="Sauvegarder la configuration actuelle comme preset"
              >
                <BookmarkPlus className="h-4 w-4" />
                Sauvegarder
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  ref={saveInputRef}
                  type="text"
                  value={savePresetName}
                  onChange={(e) => setSavePresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSavePreset();
                    if (e.key === 'Escape') {
                      setShowSaveInput(false);
                      setSavePresetName('');
                    }
                  }}
                  placeholder="Nom du preset"
                  className="h-9 w-44 rounded-lg border border-border/60 bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                />
                <Button type="button" size="sm" onClick={handleSavePreset}>
                  OK
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowSaveInput(false);
                    setSavePresetName('');
                  }}
                >
                  ✕
                </Button>
              </div>
            )}

            {/* Supprimer */}
            {selectedPresetId && !showSaveInput && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDeletePreset}
                title="Supprimer ce preset"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {presets.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Aucun preset. Configurez l&apos;export puis cliquez
              &quot;Sauvegarder&quot; pour créer un preset réutilisable.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Stats ── */}
        <Card>
          <CardHeader>
            <CardTitle>Statistiques d&apos;export</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-muted p-4 text-center">
                <div className="text-2xl font-bold">{exportStats.count}</div>
                <div className="text-sm text-muted-foreground">
                  Photos à exporter
                </div>
              </div>
              <div className="rounded-lg bg-muted p-4 text-center">
                <div className="text-2xl font-bold">
                  {formatFileSize(exportStats.totalSize)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Taille totale
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Groupes de doublons :</span>
                <Badge variant="outline">{exportStats.duplicates}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Photos rejetées :</span>
                <Badge variant="outline">{exportStats.rejected}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Base config ── */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration d&apos;export</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={form.handleSubmit(handleExport)}
              className="space-y-4"
              id="export-form"
            >
              {/* Format */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="export-format">
                  Format de sortie
                </label>
                <select
                  id="export-format"
                  {...form.register('format')}
                  className="w-full rounded-md border bg-background p-2"
                >
                  <option value="original">Original</option>
                  <option value="jpeg">JPEG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>

              {/* Quality */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="export-quality">
                  Qualité : {qualityValue}%
                </label>
                <input
                  id="export-quality"
                  type="range"
                  min="1"
                  max="100"
                  {...form.register('quality', { valueAsNumber: true })}
                  className="w-full"
                />
              </div>

              {/* Dimensions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="export-max-width"
                  >
                    Largeur max (px)
                  </label>
                  <input
                    id="export-max-width"
                    type="number"
                    min="100"
                    max="8000"
                    {...form.register('maxWidth', { valueAsNumber: true })}
                    className="w-full rounded-md border bg-background p-2"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="export-max-height"
                  >
                    Hauteur max (px)
                  </label>
                  <input
                    id="export-max-height"
                    type="number"
                    min="100"
                    max="8000"
                    {...form.register('maxHeight', { valueAsNumber: true })}
                    className="w-full rounded-md border bg-background p-2"
                  />
                </div>
              </div>

              {/* Include toggles */}
              <div className="space-y-2">
                <label
                  className="flex items-center gap-2"
                  htmlFor="export-include-rejected"
                >
                  <input
                    id="export-include-rejected"
                    type="checkbox"
                    {...form.register('includeRejected')}
                    className="rounded"
                  />
                  <span className="text-sm">Inclure les photos rejetées</span>
                </label>
                <label
                  className="flex items-center gap-2"
                  htmlFor="export-include-duplicates"
                >
                  <input
                    id="export-include-duplicates"
                    type="checkbox"
                    {...form.register('includeDuplicates')}
                    className="rounded"
                  />
                  <span className="text-sm">Inclure les doublons</span>
                </label>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Filter mode ── */}
        <Card>
          <CardHeader>
            <CardTitle>Filtre de sélection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pill presets — sélection rapide */}
            <ExportFilterBar
              mode={filterMode}
              minRating={minRatingWatch}
              includeRejected={includeRejected}
              count={exportStats.count}
              onModeChange={(mode, minRating) => {
                form.setValue('filterMode', mode);
                if (minRating !== undefined)
                  form.setValue('minRating', minRating);
              }}
              onIncludeRejectedChange={(val) =>
                form.setValue('includeRejected', val)
              }
            />

            {/* Radio buttons détaillés (toujours visibles) */}
            <div className="space-y-2 border-t border-border/50 pt-3">
              {(
                [
                  { value: 'all', label: 'Toutes les photos analysées' },
                  { value: 'picks-only', label: 'Picks uniquement 🎯' },
                  { value: 'favorites-only', label: 'Favorites uniquement' },
                  { value: 'min-rating', label: 'Note minimale ★' },
                ] as const
              ).map(({ value, label }) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <input
                    type="radio"
                    value={value}
                    {...form.register('filterMode')}
                    className="rounded"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>

            {filterMode === 'min-rating' && (
              <div className="flex items-center gap-3 pl-5">
                <span className="text-sm text-muted-foreground">
                  Note min :
                </span>
                {[1, 2, 3, 4, 5].map((r) => (
                  <label
                    key={r}
                    className="flex cursor-pointer items-center gap-1"
                  >
                    <input
                      type="radio"
                      value={r}
                      {...form.register('minRating', { valueAsNumber: true })}
                    />
                    <span className="text-sm">{r}★</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Rename pattern ── */}
        <Card>
          <CardHeader>
            <CardTitle>Renommage des fichiers</CardTitle>
          </CardHeader>
          <CardContent>
            <RenamePanel
              pattern={form.watch('renamePattern')}
              photos={activePhotos
                .filter((p) => p.analysis && !p.analysis.error)
                .slice(0, 3)}
              onPatternChange={(v) => form.setValue('renamePattern', v)}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Watermark ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Filigrane (watermark)</CardTitle>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                {...form.register('watermarkEnabled')}
                className="rounded"
              />
              <span className="text-sm font-medium">Activer</span>
            </label>
          </div>
        </CardHeader>
        {watermarkEnabled && (
          <CardContent className="space-y-4">
            {format === 'original' && (
              <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-600">
                ⚠️ Le filigrane encode l&apos;image — elle sera re-encodée en
                JPEG même si le format est &quot;Original&quot;.
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Text */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="wm-text">
                  Texte
                </label>
                <input
                  id="wm-text"
                  type="text"
                  placeholder="© Mon Studio"
                  {...form.register('watermarkText')}
                  className="w-full rounded-md border bg-background p-2 text-sm"
                />
              </div>

              {/* Position */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="wm-position">
                  Position
                </label>
                <select
                  id="wm-position"
                  {...form.register('watermarkPosition')}
                  className="w-full rounded-md border bg-background p-2 text-sm"
                >
                  <option value="bottom-left">Bas — gauche</option>
                  <option value="bottom-center">Bas — centre</option>
                  <option value="bottom-right">Bas — droite</option>
                  <option value="top-left">Haut — gauche</option>
                  <option value="top-center">Haut — centre</option>
                  <option value="top-right">Haut — droite</option>
                </select>
              </div>

              {/* Size */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="wm-size">
                  Taille : {watermarkSize}px
                </label>
                <input
                  id="wm-size"
                  type="range"
                  min="10"
                  max="200"
                  {...form.register('watermarkSize', { valueAsNumber: true })}
                  className="w-full"
                />
              </div>

              {/* Opacity */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="wm-opacity">
                  Opacité : {watermarkOpacity}%
                </label>
                <input
                  id="wm-opacity"
                  type="range"
                  min="1"
                  max="100"
                  {...form.register('watermarkOpacity', {
                    valueAsNumber: true,
                  })}
                  className="w-full"
                />
              </div>

              {/* Color */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="wm-color">
                  Couleur
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="wm-color"
                    type="color"
                    {...form.register('watermarkColor')}
                    className="h-10 w-16 cursor-pointer rounded border bg-background p-1"
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    {form.watch('watermarkColor')}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Submit ── */}
      <div className="flex justify-end gap-3">
        {!fsaAvailable && (
          <p className="self-center text-xs text-muted-foreground">
            Votre navigateur ne supporte pas le sélecteur de dossier —
            l&apos;export sera téléchargé en ZIP.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={isExporting || exportableChapterCount === 0}
          onClick={handleExportByChapters}
          className="min-w-[210px] gap-2"
          title={
            exportableChapterCount === 0
              ? 'Aucune photo exportable par chapitres avec les filtres actuels'
              : undefined
          }
        >
          <Download className="h-4 w-4" />
          Exporter par chapitres
          {exportableChapterCount > 0 ? ` (${exportableChapterCount})` : ''}
        </Button>
        <Button
          form="export-form"
          type="submit"
          disabled={isExporting || exportStats.count === 0}
          className="min-w-[220px]"
        >
          {isExporting
            ? `Export en cours… ${exportProgress}%`
            : fsaAvailable
              ? 'Choisir le dossier et exporter'
              : 'Exporter en ZIP'}
        </Button>
      </div>

      {/* ── Progress bar ── */}
      {isExporting && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progression de l&apos;export</span>
                <span>{exportProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary">
                <motion.div
                  className="h-2 rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${exportProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmationDialog
        open={overwriteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setOverwriteTarget(null);
        }}
        onConfirm={() => {
          if (overwriteTarget)
            doUpdatePreset(overwriteTarget.id, overwriteTarget.name);
          setOverwriteTarget(null);
        }}
        title="Écraser ce preset ?"
        description={`Un preset nommé « ${overwriteTarget?.name ?? ''} » existe déjà. Voulez-vous l'écraser avec les réglages actuels ?`}
        confirmText="Écraser"
        cancelText="Annuler"
        variant="destructive"
      />

      <ConfirmationDialog
        open={presetDeleteOpen}
        onOpenChange={setPresetDeleteOpen}
        onConfirm={confirmDeletePreset}
        title="Supprimer ce preset d'export ?"
        description={`Le preset « ${presetToDeleteName} » sera définitivement supprimé. Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="destructive"
      />
    </motion.div>
  );
}

export default ExportTab;
