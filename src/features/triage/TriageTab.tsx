import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePhotoStore } from '../../store/photoStore';
import { SMART_COLLECTIONS, matchesRule } from '../../store/smartCollectionsSelector';
import { FilterBar } from './components/FilterBar';
import { VirtualizedPhotoGrid } from './components/VirtualizedPhotoGrid';
import { Photo, COLOR_LABEL_KEYS, ColorLabel } from '../../types';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { FullscreenViewer } from '../../components/FullscreenViewer';
import { ComparisonView } from '../../components/ComparisonView';
import { Zap, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp';
import { BulkActionBar } from './components/BulkActionBar';
import { SessionProgress } from './components/SessionProgress';
import { AutoAdvanceToggle } from './components/AutoAdvanceToggle';
import { ConfirmationDialog } from '../../components/ui/confirmation-dialog';
import { PhotoDetailPanel } from '../../components/PhotoDetailPanel';
import { AnimatePresence } from 'framer-motion';
import { CullingView } from '../../components/CullingView';
import {
  isFavoritePhoto,
  isReviewPhoto,
  TriageFilterType,
  TriageSortKey,
} from './triageFilters';

const SORT_LABELS: Record<TriageSortKey, string> = {
  'default':        'Par défaut',
  'rating-desc':    'Note ↓',
  'rating-asc':     'Note ↑',
  'sharpness-desc': 'Netteté ↓',
  'name-asc':       'Nom A→Z',
  'name-desc':      'Nom Z→A',
  'size-desc':      'Poids ↓',
};

interface TriageTabProps {
  onOpenAutoFlow?: (photoIds?: string[]) => void;
}

function TriageTab({ onOpenAutoFlow }: TriageTabProps = {}) {
  const duplicateGroups = usePhotoStore((state) => state.duplicateGroups);
  const selectedPhotoId = usePhotoStore((state) => state.selectedPhotoId);
  const rejectedPhotoIds = usePhotoStore((state) => state.rejectedPhotoIds);
  const bestPhotoOverrides = usePhotoStore((state) => state.bestPhotoOverrides);
  const setSelectedPhotoId = usePhotoStore((state) => state.setSelectedPhotoId);
  const toggleRejectPhoto = usePhotoStore((state) => state.toggleRejectPhoto);
  const setBestInGroup = usePhotoStore((state) => state.setBestInGroup);
  const addPhotosToCollection = usePhotoStore((state) => state.addPhotosToCollection);
  const removePhotosFromCollection = usePhotoStore((state) => state.removePhotosFromCollection);
  const setCollectionPhotoIds = usePhotoStore((state) => state.setCollectionPhotoIds);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  const activeSmartCollectionId = usePhotoStore((state) => state.activeSmartCollectionId);
  const setActiveSmartCollection = usePhotoStore((state) => state.setActiveSmartCollection);
  const collections = usePhotoStore((state) => state.collections);
  const allPhotos = usePhotoStore((state) => state.photos);
  const userTags = usePhotoStore((state) => state.userTags);
  const developmentSelection = usePhotoStore((state) => state.developmentSelection);
  const toggleDevelopmentSelection = usePhotoStore((state) => state.toggleDevelopmentSelection);
  const clearDevelopmentSelection = usePhotoStore((state) => state.clearDevelopmentSelection);
  const startRetouchSession = usePhotoStore((state) => state.startRetouchSession);
  const setPhotoRating = usePhotoStore((state) => state.setPhotoRating);
  const togglePhotoPick = usePhotoStore((state) => state.togglePhotoPick);
  const togglePhotoReject = usePhotoStore((state) => state.togglePhotoReject);
  const unflagPhoto = usePhotoStore((state) => state.unflagPhoto);
  const removePhoto = usePhotoStore((state) => state.removePhoto);
  const requeueForAnalysis = usePhotoStore((state) => state.requeueForAnalysis);
  const undo = usePhotoStore((state) => state.undo);
  const setColorLabel = usePhotoStore((state) => state.setColorLabel);
  const setActiveTab = usePhotoStore((state) => state.setActiveTab);
  const pasteMetadata = usePhotoStore((state) => state.pasteMetadata);

  // Calculer les valeurs dérivées avec useMemo pour éviter les boucles infinies
  const activeCollection = useMemo(() =>
    collections[activeCollectionId],
    [collections, activeCollectionId]
  );

  const activeSC = useMemo(
    () => SMART_COLLECTIONS.find((sc) => sc.id === activeSmartCollectionId) ?? null,
    [activeSmartCollectionId],
  );

  const activePhotos = useMemo(() => {
    // Smart collection active : filtrer directement toutes les photos
    if (activeSC) {
      return allPhotos.filter((p) => matchesRule(p, activeSC.rule, { duplicateGroups, rejectedPhotoIds }));
    }
    if (!activeCollection) {
      return allPhotos;
    }
    const photoMap = new Map(allPhotos.map((photo) => [photo.id, photo]));
    return activeCollection.photoIds
      .map((id) => photoMap.get(id))
      .filter((photo): photo is Photo => Boolean(photo));
  }, [activeCollection, allPhotos, activeSC, duplicateGroups, rejectedPhotoIds]);

  const collectionPhotoIds = useMemo(() => new Set<string>(activeCollection?.photoIds ?? []), [activeCollection?.photoIds]);

  const handleToggleCollectionMembership = (photoId: string) => {
    if (!activeCollectionId) {
      return;
    }

    if (collectionPhotoIds.has(photoId)) {
      removePhotosFromCollection(activeCollectionId, [photoId]);
    } else {
      addPhotosToCollection(activeCollectionId, [photoId]);
    }
  };

  const handleToggleDevelopment = (photoId: string) => {
    toggleDevelopmentSelection(photoId);
  };

  const handleStartDevelopment = async () => {
    const photoIds = Array.from(developmentSelection);
    if (photoIds.length === 0) {
      return;
    }
    await startRetouchSession(photoIds);
  };

  const [activeFilter, setActiveFilter] = useState<TriageFilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<TriageSortKey>('default');
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [singleDeleteConfirmOpen, setSingleDeleteConfirmOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [comparisonPhotos, setComparisonPhotos] = useState<[Photo, Photo] | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [cullingOpen, setCullingOpen] = useState(false);

  // HUD de notation style Lightroom (flash d'étoiles au centre de l'écran)
  const [ratingHUD, setRatingHUD] = useState<{ rating: number; key: number } | null>(null);
  const ratingHUDTimerRef = useRef<number | null>(null);

  // Auto-avance (Caps Lock mode) — persisté en localStorage
  const [autoAdvance, setAutoAdvance] = useState<boolean>(
    () => localStorage.getItem('treephoto_autoAdvance') === 'true'
  );
  const autoAdvanceRef = useRef(autoAdvance);
  useEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);
  const autoAdvanceTimerRef = useRef<number | null>(null);

  // triggerAutoAdvance utilise une ref pour éviter les stale closures
  const triggerAutoAdvance = useCallback(() => {
    if (!autoAdvanceRef.current) return;
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    // handleNextPhoto est stable car elle lit filteredPhotos via closure au moment de l'appel
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      // Lire la sélection et les photos directement depuis le store pour être à jour
      const { photos, selectedPhotoId: curId } = usePhotoStore.getState();
      if (!curId) return;
      const visible = photos.filter((p) => p.analysis && !p.analysis.error);
      const idx = visible.findIndex((p) => p.id === curId);
      if (idx !== -1 && idx < visible.length - 1) {
        usePhotoStore.getState().setSelectedPhotoId(visible[idx + 1].id);
      }
    }, 280);
  }, []);

  // Presse-papier de métadonnées (Ctrl+Shift+C/V)
  interface MetaClipboard {
    rating?: number;
    isPick?: boolean;
    isRejected?: boolean;
    colorLabel?: import('../../types').ColorLabel | null;
  }
  const [metaClipboard, setMetaClipboard] = useState<MetaClipboard | null>(null);

  // Drag-and-drop reorder (collection mode only)
  // A-12 : la réorganisation n'a de sens que sur la collection COMPLÈTE et ordonnée.
  // Dès qu'un filtre, une recherche ou une smart collection est actif, la vue est un
  // sous-ensemble : réordonner modifierait l'ordre global de façon trompeuse. On désactive
  // donc le glisser-déposer dans ces cas.
  const canReorderCollection =
    activeFilter === 'all' && !searchTerm.trim() && !activeSmartCollectionId && !!activeCollection;
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handlePhotoDragStart = (photoId: string, e: React.DragEvent) => {
    dragIdRef.current = photoId;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handlePhotoDragOver = (photoId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (photoId !== dragIdRef.current) setDragOverId(photoId);
  };
  const handlePhotoDragLeave = () => setDragOverId(null);
  const handlePhotoDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = dragIdRef.current;
    setDragOverId(null);
    dragIdRef.current = null;
    if (!sourceId || sourceId === targetId || !activeCollectionId || !canReorderCollection) return;
    const collections = usePhotoStore.getState().collections;
    const col = collections[activeCollectionId];
    if (!col) return;
    const ids = [...col.photoIds];
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, sourceId);
    setCollectionPhotoIds(activeCollectionId, ids);
    toast.success('Ordre mis à jour');
  };
  const handlePhotoDragEnd = () => {
    dragIdRef.current = null;
    setDragOverId(null);
  };

  // Multi-sélection pour actions en lot
  const [triageMultiSelection, setTriageMultiSelection] = useState<Set<string>>(new Set());

  const handleToggleMultiSelect = (photoId: string) => {
    setTriageMultiSelection((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const handleClearMultiSelection = () => setTriageMultiSelection(new Set());

  // Actions batch
  // Persistance auto-avance
  useEffect(() => {
    localStorage.setItem('treephoto_autoAdvance', String(autoAdvance));
  }, [autoAdvance]);

  // Copier / coller métadonnées
  const handleCopyMeta = useCallback(() => {
    const photo = activePhotos.find((p) => p.id === selectedPhotoId);
    if (!photo?.analysis) { toast.error('Aucune photo sélectionnée'); return; }
    const { rating, isPick, isRejected, colorLabel } = photo.analysis;
    setMetaClipboard({ rating, isPick, isRejected, colorLabel: colorLabel ?? null });
    const parts: string[] = [];
    if (rating) parts.push(`${rating}★`);
    if (isPick) parts.push('Pick');
    if (isRejected) parts.push('Rejeté');
    if (colorLabel) parts.push(colorLabel);
    toast.success(`Copié : ${parts.length ? parts.join(' · ') : 'aucune métadonnée'}`);
  }, [activePhotos, selectedPhotoId]);

  const handlePasteMeta = useCallback(() => {
    if (!metaClipboard) { toast.error('Presse-papier vide — copiez d\'abord (Ctrl+Shift+C)'); return; }
    const targets = triageMultiSelection.size > 0
      ? Array.from(triageMultiSelection)
      : selectedPhotoId ? [selectedPhotoId] : [];
    if (targets.length === 0) { toast.error('Aucune photo ciblée'); return; }
    pasteMetadata(targets, metaClipboard);
    toast.success(`Collé sur ${targets.length} photo${targets.length > 1 ? 's' : ''}`);
  }, [metaClipboard, triageMultiSelection, selectedPhotoId, pasteMetadata]);

  const handleBulkRate = (rating: number) => {
    triageMultiSelection.forEach((id) => setPhotoRating(id, rating));
    toast.success(`Note ${rating === 0 ? 'retirée' : `${rating}★`} pour ${triageMultiSelection.size} photo(s)`);
    handleClearMultiSelection();
  };

  const handleBulkPick = () => {
    triageMultiSelection.forEach((id) => togglePhotoPick(id));
    toast.success(`Pick appliqué à ${triageMultiSelection.size} photo(s)`);
    handleClearMultiSelection();
  };

  const handleBulkReject = () => {
    triageMultiSelection.forEach((id) => togglePhotoReject(id));
    toast.success(`${triageMultiSelection.size} photo(s) rejetée(s)`);
    handleClearMultiSelection();
  };

  const handleBulkUnflag = () => {
    triageMultiSelection.forEach((id) => unflagPhoto(id));
    toast.success(`Flags retirés de ${triageMultiSelection.size} photo(s)`);
    handleClearMultiSelection();
  };

  const handleBulkColorLabel = (label: ColorLabel | null) => {
    // force=true ensures consistent apply (no toggle) across all selected photos
    const count = triageMultiSelection.size;
    triageMultiSelection.forEach((id) => setColorLabel(id, label, true));
    toast.success(
      label
        ? `Label ${label} appliqué à ${count} photo(s)`
        : `Label retiré de ${count} photo(s)`
    );
    // A-21 : cohérence avec les autres actions en lot — on vide la sélection après application.
    handleClearMultiSelection();
  };

  const handleBulkDelete = () => {
    setBulkDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = () => {
    const count = triageMultiSelection.size;
    triageMultiSelection.forEach((id) => removePhoto(id));
    handleClearMultiSelection();
    showDeletedToast(count);
  };

  // Toast « Annuler » exploitant la pile undo (A-22). Une suppression en lot empile
  // `count` actions DELETE_PHOTO ; l'annulation les rejoue toutes.
  const showDeletedToast = (count: number) => {
    toast(
      (t) => (
        <span className="flex items-center gap-3">
          {count} photo{count > 1 ? 's' : ''} supprimée{count > 1 ? 's' : ''}
          <button
            onClick={() => {
              // N'annule que les suppressions, et seulement si elles sont encore au sommet
              // de la pile (si l'utilisateur a fait d'autres actions entre-temps, on
              // n'écrase pas ces actions — voir audit).
              for (let i = 0; i < count; i++) {
                const stack = usePhotoStore.getState().undoStack;
                if (stack[stack.length - 1]?.type !== 'DELETE_PHOTO') break;
                undo();
              }
              toast.dismiss(t.id);
            }}
            className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-xs font-medium"
          >
            Annuler
          </button>
        </span>
      ),
      { duration: 6000, icon: '🗑️' },
    );
  };

  const handleBulkAddToCollection = () => {
    if (!activeCollectionId) {
      toast.error('Aucune collection active');
      return;
    }
    addPhotosToCollection(activeCollectionId, Array.from(triageMultiSelection));
    toast.success(`${triageMultiSelection.size} photo(s) ajoutée(s) à la collection`);
    handleClearMultiSelection();
  };

  const parentRef = useRef<HTMLDivElement>(null);

  // Filter photos based on active filter + search term
  const filteredPhotos = useMemo(() => {
    const analyzedPhotos = activePhotos.filter((p) => p.analysis && !p.analysis.error);

    // Filtre principal
    let result: typeof analyzedPhotos;
    if (activeFilter === 'duplicates') {
      const duplicatePhotoIds = new Set(
        duplicateGroups.flatMap((group) => group.photos.map((p) => p.id))
      );
      result = analyzedPhotos.filter((photo) => duplicatePhotoIds.has(photo.id));
    } else if (activeFilter === 'blurry') {
      result = analyzedPhotos.filter((photo) => photo.analysis?.isBlurry === true);
    } else if (activeFilter === 'picks') {
      result = analyzedPhotos.filter((photo) => photo.analysis?.isPick === true);
    } else if (activeFilter === 'favorites') {
      result = analyzedPhotos.filter(isFavoritePhoto);
    } else if (activeFilter === 'review') {
      result = analyzedPhotos.filter((photo) => isReviewPhoto(photo, rejectedPhotoIds));
    } else if (activeFilter === 'rejected') {
      result = analyzedPhotos.filter((photo) => photo.analysis?.isRejected === true || rejectedPhotoIds.has(photo.id));
    } else if (activeFilter === 'selected') {
      result = analyzedPhotos.filter((photo) => selectedPhotoId === photo.id);
    } else if (activeFilter.startsWith('color:')) {
      const label = activeFilter.slice(6) as ColorLabel;
      result = analyzedPhotos.filter((photo) => photo.analysis?.colorLabel === label);
    } else if (activeFilter.startsWith('stars:')) {
      const minStars = parseInt(activeFilter.slice(6));
      result = analyzedPhotos.filter((photo) => (photo.analysis?.rating ?? 0) >= minStars);
    } else if (activeFilter === 'errors') {
      // A-19 : les photos en erreur sont exclues de `analyzedPhotos` — on repart d'activePhotos.
      result = activePhotos.filter((photo) => !!photo.analysis?.error);
    } else {
      result = analyzedPhotos;
    }

    // Recherche full-text (nom, tags AI, tags utilisateur, EXIF)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((photo) => {
        if (photo.file.name.toLowerCase().includes(q)) return true;
        if ((photo.analysis?.tags ?? []).some((t) => t.toLowerCase().includes(q))) return true;
        if ((userTags[photo.id] ?? []).some((tag) => tag.toLowerCase().includes(q))) return true;
        // User tags (from store snapshot — accessed via photo key in state below)
        // EXIF fields: camera, lens, ISO, date, focal length
        const exif = photo.metadata?.exif as Record<string, unknown> | undefined;
        if (exif) {
          const searchable = [
            exif.Make,
            exif.Model,
            exif.LensModel,
            exif.DateTimeOriginal,
            exif.ISOSpeedRatings !== undefined ? `iso ${exif.ISOSpeedRatings}` : null,
            exif.FocalLength !== undefined ? `${exif.FocalLength}mm` : null,
          ].filter(Boolean).join(' ').toLowerCase();
          if (searchable.includes(q)) return true;
        }
        return false;
      });
    }

    if (dateFrom || dateTo) {
      result = result.filter((photo) => {
        const exif = photo.metadata?.exif as Record<string, unknown> | undefined;
        const exifDate = typeof exif?.DateTimeOriginal === 'string'
          ? exif.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
          : null;
        const timestamp = exifDate ? Date.parse(exifDate) : photo.lastModified;
        if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return false;
        if (dateFrom && timestamp < Date.parse(`${dateFrom}T00:00:00.000`)) return false;
        if (dateTo && timestamp > Date.parse(`${dateTo}T23:59:59.999`)) return false;
        return true;
      });
    }

    // Tri
    if (sortKey !== 'default') {
      result = [...result].sort((a, b) => {
        switch (sortKey) {
          case 'rating-desc': return (b.analysis?.rating ?? 0) - (a.analysis?.rating ?? 0);
          case 'rating-asc':  return (a.analysis?.rating ?? 0) - (b.analysis?.rating ?? 0);
          case 'sharpness-desc': return (b.analysis?.sharpnessScore ?? 0) - (a.analysis?.sharpnessScore ?? 0);
          case 'name-asc':    return a.file.name.localeCompare(b.file.name);
          case 'name-desc':   return b.file.name.localeCompare(a.file.name);
          case 'size-desc':   return b.file.size - a.file.size;
          default:            return 0;
        }
      });
    }

    return result;
  }, [activePhotos, duplicateGroups, rejectedPhotoIds, selectedPhotoId, activeFilter, searchTerm, sortKey, userTags, dateFrom, dateTo]);

  // A-20 : garder la sélection multiple cohérente avec la vue. Dès que la liste visible
  // change (filtre, recherche, collection, tri…), on retire de la sélection les photos qui
  // ne sont plus visibles, pour qu'une action en lot ne s'applique jamais à une photo hors vue.
  useEffect(() => {
    setTriageMultiSelection((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filteredPhotos.map((p) => p.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [filteredPhotos]);

  // A-55 : état vide contextualisé (filtre actif vs collection vide vs rien d'analysé).
  const hasActiveFilters =
    activeFilter !== 'all' || !!searchTerm.trim() || !!dateFrom || !!dateTo || !!activeSmartCollectionId;

  const resetFilters = () => {
    setActiveFilter('all');
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setActiveSmartCollection(null);
  };

  const emptyState = (() => {
    if (hasActiveFilters) {
      return {
        title: 'Aucune photo ne correspond',
        subtitle: 'Aucun résultat pour ce filtre, cette recherche ou cette collection dynamique.',
        showReset: true,
      };
    }
    const analyzedCount = activePhotos.filter((p) => p.analysis && !p.analysis.error).length;
    if (activePhotos.length === 0) {
      return { title: 'Collection vide', subtitle: 'Ajoutez des photos à cette collection pour les trier ici.', showReset: false };
    }
    if (analyzedCount === 0) {
      return { title: 'Aucune photo analysée', subtitle: "Lancez l'analyse depuis l'onglet Ingestion pour voir vos photos ici.", showReset: false };
    }
    return { title: 'Aucune photo à afficher', subtitle: '', showReset: false };
  })();

  const handleSelectPhoto = (id: string) => {
    setSelectedPhotoId(selectedPhotoId === id ? null : id);
  };

  const handleToggleRejectPhoto = (id: string) => {
    toggleRejectPhoto(id);
  };

  const handleSetBestInGroup = (groupId: string, photoId: string) => {
    setBestInGroup(groupId, photoId);
  };

  // Navigation entre photos
  const handleNextPhoto = () => {
    if (!selectedPhotoId || filteredPhotos.length === 0) return;
    const currentIndex = filteredPhotos.findIndex(p => p.id === selectedPhotoId);
    if (currentIndex < filteredPhotos.length - 1) {
      setSelectedPhotoId(filteredPhotos[currentIndex + 1].id);
    }
  };

  const handlePreviousPhoto = () => {
    if (!selectedPhotoId || filteredPhotos.length === 0) return;
    const currentIndex = filteredPhotos.findIndex(p => p.id === selectedPhotoId);
    if (currentIndex > 0) {
      setSelectedPhotoId(filteredPhotos[currentIndex - 1].id);
    }
  };

  // Gestion plein écran et comparaison
  const handleOpenFullscreen = () => {
    if (selectedPhotoId) {
      setFullscreenOpen(true);
    }
  };

  const handleOpenComparison = () => {
    if (developmentSelection.size >= 2) {
      const selectedPhotos = Array.from(developmentSelection)
        .map(id => filteredPhotos.find(p => p.id === id))
        .filter((p): p is Photo => p !== undefined);

      if (selectedPhotos.length >= 2) {
        setComparisonPhotos([selectedPhotos[0], selectedPhotos[1]]);
        setComparisonOpen(true);
      }
    } else if (selectedPhotoId && filteredPhotos.length >= 2) {
      const currentIndex = filteredPhotos.findIndex(p => p.id === selectedPhotoId);
      const nextIndex = currentIndex < filteredPhotos.length - 1 ? currentIndex + 1 : 0;
      setComparisonPhotos([filteredPhotos[currentIndex], filteredPhotos[nextIndex]]);
      setComparisonOpen(true);
    } else {
      toast.error('Sélectionnez au moins 2 photos pour comparer');
    }
  };

  // Raccourcis clavier Lightroom
  useKeyboardShortcuts({
    onRating: (rating) => {
      if (selectedPhotoId && !fullscreenOpen && !comparisonOpen) {
        setPhotoRating(selectedPhotoId, rating);
        // HUD style Lightroom — flash d'étoiles au centre de l'écran
        if (ratingHUDTimerRef.current) clearTimeout(ratingHUDTimerRef.current);
        setRatingHUD({ rating, key: Date.now() });
        ratingHUDTimerRef.current = window.setTimeout(() => setRatingHUD(null), 1200);
        triggerAutoAdvance();
      }
    },
    onPick: () => {
      if (selectedPhotoId && !fullscreenOpen && !comparisonOpen) {
        togglePhotoPick(selectedPhotoId);
        const photo = filteredPhotos.find(p => p.id === selectedPhotoId);
        const isPick = !photo?.analysis?.isPick;
        toast.success(isPick ? '🎯 Marqué comme Pick' : 'Pick retiré');
        triggerAutoAdvance();
      }
    },
    onReject: () => {
      if (selectedPhotoId && !fullscreenOpen && !comparisonOpen) {
        togglePhotoReject(selectedPhotoId);
        const photo = filteredPhotos.find(p => p.id === selectedPhotoId);
        const isRejected = !photo?.analysis?.isRejected;
        toast.success(isRejected ? '❌ Photo rejetée' : 'Reject retiré');
        triggerAutoAdvance();
      }
    },
    onUnflag: () => {
      if (selectedPhotoId && !fullscreenOpen && !comparisonOpen) {
        unflagPhoto(selectedPhotoId);
        toast.success('⚪ Flags retirés');
        triggerAutoAdvance();
      }
    },
    onNext: handleNextPhoto,
    onPrevious: handlePreviousPhoto,
    onFullscreen: handleOpenFullscreen,
    onCompare: handleOpenComparison,
    onDevelop: () => {
      if (selectedPhotoId) {
        toggleDevelopmentSelection(selectedPhotoId);
        toast.success('Ajouté à la sélection développement');
      }
    },
    onExport: () => {
      setActiveTab('export');
    },
    onDelete: () => {
      if (selectedPhotoId && !fullscreenOpen && !comparisonOpen) {
        setSingleDeleteConfirmOpen(true);
      }
    },
    onColorLabel: (index) => {
      if (selectedPhotoId && !fullscreenOpen && !comparisonOpen) {
        const label = COLOR_LABEL_KEYS[index];
        if (label) setColorLabel(selectedPhotoId, label);
      }
    },
    onSelectAll: () => {
      setTriageMultiSelection(new Set(filteredPhotos.map((p) => p.id)));
      toast.success(`${filteredPhotos.length} photo${filteredPhotos.length > 1 ? 's' : ''} sélectionnée${filteredPhotos.length > 1 ? 's' : ''}`);
    },
    onHelpToggle: () => {
      setHelpOpen((prev) => !prev);
    },
    onCopyMeta:  handleCopyMeta,
    onPasteMeta: handlePasteMeta,
    onCulling: () => {
      if (filteredPhotos.length > 0) {
        if (!selectedPhotoId) setSelectedPhotoId(filteredPhotos[0].id);
        setCullingOpen(true);
      } else {
        toast.error('Aucune photo à parcourir');
      }
    },
  }, !fullscreenOpen && !comparisonOpen && !helpOpen && !singleDeleteConfirmOpen && !bulkDeleteConfirmOpen && !cullingOpen);

  const stats = useMemo(() => {
    const analyzedPhotos = activePhotos.filter((p) => p.analysis && !p.analysis.error);
    const picksPhotos = analyzedPhotos.filter((p) => p.analysis?.isPick === true);
    const favoritesPhotos = analyzedPhotos.filter(isFavoritePhoto);
    const reviewPhotos = analyzedPhotos.filter((p) => isReviewPhoto(p, rejectedPhotoIds));
    const rejectedPhotos = analyzedPhotos.filter((p) => p.analysis?.isRejected === true || rejectedPhotoIds.has(p.id));
    const colorCounts = Object.fromEntries(
      COLOR_LABEL_KEYS.map((c) => [c, analyzedPhotos.filter((p) => p.analysis?.colorLabel === c).length])
    ) as Record<ColorLabel, number>;

    return {
      total: analyzedPhotos.length,
      duplicates: duplicateGroups.length,
      blurry: analyzedPhotos.filter((p) => p.analysis?.isBlurry === true).length,
      picks: picksPhotos.length,
      favorites: favoritesPhotos.length,
      review: reviewPhotos.length,
      rejected: rejectedPhotos.length,
      selected: selectedPhotoId ? 1 : 0,
      errors: activePhotos.filter((p) => !!p.analysis?.error).length,
      colorCounts,
    };
  }, [activePhotos, duplicateGroups, rejectedPhotoIds, selectedPhotoId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 h-full flex flex-col"
    >
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Triage des Photos</h2>
        <p className="text-muted-foreground">
          Examinez et organisez vos photos analysées
        </p>
      </div>

      {/* Progression de session */}
      <SessionProgress photos={activePhotos} />

      {/* Bannière Smart Collection active */}
      {activeSC && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
          <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {activeSC.icon} {activeSC.name}
          </span>
          <span className="text-muted-foreground">—</span>
          <span className="text-muted-foreground">
            {activePhotos.length} photo{activePhotos.length > 1 ? 's' : ''}
          </span>
          <span className="text-xs text-muted-foreground italic">— collection dynamique, lecture seule</span>
          <button
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setActiveSmartCollection(null)}
          >
            <X className="w-3 h-3" />
            Quitter
          </button>
        </div>
      )}

      {/* A-19 : bandeau de réanalyse quand le filtre « Erreurs » est actif */}
      {activeFilter === 'errors' && filteredPhotos.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
          <span className="font-medium text-destructive">
            {filteredPhotos.length} photo{filteredPhotos.length > 1 ? 's' : ''} en échec d'analyse
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-1"
            onClick={() => {
              requeueForAnalysis(filteredPhotos.map((p) => p.id));
              toast.success('Réanalyse lancée');
              setActiveFilter('all');
            }}
          >
            Réanalyser
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <FilterBar
              totalPhotos={stats.total}
              duplicateGroups={stats.duplicates}
              blurryCount={stats.blurry}
              picksCount={stats.picks}
              favoritesCount={stats.favorites}
              reviewCount={stats.review}
              rejectedCount={stats.rejected}
              selectedCount={stats.selected}
              errorsCount={stats.errors}
              colorCounts={stats.colorCounts}
              activeFilter={activeFilter}
              searchTerm={searchTerm}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onFilterChange={(f) => setActiveFilter(f as TriageFilterType)}
              onSearchChange={setSearchTerm}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
          </div>
          {/* Sort control */}
          <div className="shrink-0 pt-1">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as TriageSortKey)}
              className="h-8 rounded-lg border border-border/60 bg-background text-xs px-2 text-foreground cursor-pointer"
              title="Trier les photos"
            >
              {(Object.keys(SORT_LABELS) as TriageSortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {/* Auto-avance */}
          <div className="shrink-0 pt-1">
            <AutoAdvanceToggle
              enabled={autoAdvance}
              onToggle={() => setAutoAdvance((v) => !v)}
            />
          </div>

          {/* Indicateur presse-papier */}
          {metaClipboard && (
            <div
              className="shrink-0 pt-1 flex items-center gap-1 px-2 py-1 rounded-lg border border-border/40 bg-background/60 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
              title="Ctrl+Shift+V pour coller"
              onClick={handlePasteMeta}
            >
              📋
              {metaClipboard.rating ? `${metaClipboard.rating}★ ` : ''}
              {metaClipboard.isPick ? '🎯 ' : ''}
              {metaClipboard.isRejected ? '❌ ' : ''}
              {metaClipboard.colorLabel ?? ''}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm">
            <span>Sélection développement :</span>
            <Badge variant={developmentSelection.size > 0 ? 'default' : 'outline'}>
              {developmentSelection.size}
            </Badge>
            {developmentSelection.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={clearDevelopmentSelection}
              >
                Effacer
              </Button>
            )}
          </div>
          <Button
            onClick={handleStartDevelopment}
            disabled={developmentSelection.size === 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            Développer les photos sélectionnées
          </Button>
          {onOpenAutoFlow && (
            <Button
              onClick={() => onOpenAutoFlow(filteredPhotos.map((photo) => photo.id))}
              disabled={filteredPhotos.length === 0}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              title="Ouvrir AutoFlow avec les photos actuellement visibles"
            >
              <Zap className="w-4 h-4" />
              AutoFlow filtre
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {filteredPhotos.length}
              </Badge>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
        {/* Grille principale */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {filteredPhotos.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm">
                <p className="text-sm font-semibold text-foreground">{emptyState.title}</p>
                {emptyState.subtitle && (
                  <p className="mt-1 text-xs text-muted-foreground">{emptyState.subtitle}</p>
                )}
                {emptyState.showReset && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
                    Réinitialiser les filtres
                  </Button>
                )}
              </div>
            </div>
          ) : (
          <VirtualizedPhotoGrid
            photos={filteredPhotos}
            selectedPhotoId={selectedPhotoId}
            rejectedPhotoIds={rejectedPhotoIds}
            bestPhotoOverrides={bestPhotoOverrides}
            duplicateGroups={duplicateGroups}
            onSelectPhoto={handleSelectPhoto}
            onToggleRejectPhoto={handleToggleRejectPhoto}
            onSetBestInGroup={handleSetBestInGroup}
            parentRef={parentRef}
            collectionPhotoIds={collectionPhotoIds}
            onToggleCollection={handleToggleCollectionMembership}
            developmentSelection={developmentSelection}
            onToggleDevelopment={handleToggleDevelopment}
            multiSelection={triageMultiSelection}
            onToggleMultiSelect={handleToggleMultiSelect}
            draggablePhotoIds={canReorderCollection ? new Set(activeCollection!.photoIds) : undefined}
            dragOverPhotoId={dragOverId}
            onPhotoDragStart={handlePhotoDragStart}
            onPhotoDragOver={handlePhotoDragOver}
            onPhotoDragLeave={handlePhotoDragLeave}
            onPhotoDrop={handlePhotoDrop}
            onPhotoDragEnd={handlePhotoDragEnd}
          />
          )}

          {/* Barre d'actions en lot */}
          <BulkActionBar
            count={triageMultiSelection.size}
            onRate={handleBulkRate}
            onPick={handleBulkPick}
            onReject={handleBulkReject}
            onUnflag={handleBulkUnflag}
            onDelete={handleBulkDelete}
            onColorLabel={handleBulkColorLabel}
            onAddToCollection={activeCollectionId ? handleBulkAddToCollection : undefined}
            onClearSelection={handleClearMultiSelection}
          />
        </div>

        {/* Panneau détail photo */}
        <AnimatePresence>
          {selectedPhotoId && !fullscreenOpen && !comparisonOpen && (() => {
            const detailPhoto = filteredPhotos.find((p) => p.id === selectedPhotoId);
            return detailPhoto ? (
              <PhotoDetailPanel
                key={selectedPhotoId}
                photo={detailPhoto}
                onClose={() => setSelectedPhotoId(null)}
              />
            ) : null;
          })()}
        </AnimatePresence>
      </div>

      {/* Mode plein écran */}
      {selectedPhotoId && fullscreenOpen && (
        <FullscreenViewer
          photo={filteredPhotos.find(p => p.id === selectedPhotoId)!}
          photos={filteredPhotos}
          open={fullscreenOpen}
          onClose={() => setFullscreenOpen(false)}
          onNext={handleNextPhoto}
          onPrevious={handlePreviousPhoto}
        />
      )}

      {/* Mode comparaison A/B */}
      {comparisonPhotos && (
        <ComparisonView
          photoA={comparisonPhotos[0]}
          photoB={comparisonPhotos[1]}
          photos={filteredPhotos}
          open={comparisonOpen}
          onClose={() => setComparisonOpen(false)}
          onSelectWinner={(winnerId) => {
            setSelectedPhotoId(winnerId);
          }}
        />
      )}

      {/* Panneau aide raccourcis clavier */}
      <KeyboardShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />

      {/* Confirmation suppression en lot */}
      <ConfirmationDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        onConfirm={confirmBulkDelete}
        title="Supprimer les photos sélectionnées ?"
        description={`${triageMultiSelection.size} photo${triageMultiSelection.size > 1 ? 's' : ''} seront retirées du catalogue et de leurs collections. Vous pourrez annuler juste après (jusqu'au rechargement de la page).`}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="destructive"
      />

      {/* Confirmation suppression photo unique (touche Del) */}
      <ConfirmationDialog
        open={singleDeleteConfirmOpen}
        onOpenChange={setSingleDeleteConfirmOpen}
        onConfirm={() => {
          if (selectedPhotoId) {
            removePhoto(selectedPhotoId);
            showDeletedToast(1);
          }
        }}
        title="Supprimer cette photo ?"
        description="La photo sera retirée du catalogue et de ses collections. Vous pourrez annuler juste après (jusqu'au rechargement de la page)."
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="destructive"
      />

      {/* ——— Mode culling plein écran ——— */}
      <CullingView
        photos={filteredPhotos}
        currentId={selectedPhotoId}
        open={cullingOpen}
        autoAdvance={autoAdvance}
        onClose={() => setCullingOpen(false)}
        onSelectPhoto={(id) => setSelectedPhotoId(id)}
      />

      {/* ——— HUD de notation style Lightroom ——— */}
      <AnimatePresence>
        {ratingHUD && (
          <motion.div
            key={ratingHUD.key}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] pointer-events-none select-none"
          >
            <div className="bg-black/80 backdrop-blur-md rounded-2xl px-8 py-5 flex flex-col items-center gap-2 shadow-2xl border border-white/10">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.04, duration: 0.15 }}
                    className={`text-4xl leading-none ${
                      i <= ratingHUD.rating ? 'text-yellow-400' : 'text-white/15'
                    }`}
                  >
                    ★
                  </motion.span>
                ))}
              </div>
              <span className="text-white/60 text-xs font-medium tracking-widest uppercase">
                {ratingHUD.rating === 0 ? 'Note retirée' : `${ratingHUD.rating} étoile${ratingHUD.rating > 1 ? 's' : ''}`}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default TriageTab;
