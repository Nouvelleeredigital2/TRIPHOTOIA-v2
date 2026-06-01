/**
 * AutoFlow v2 — Master coordinator
 *
 * Manages the full AutoFlow flow:
 *   dashboard → swipe → gallery → dup-compare
 *
 * Receives AfPhotos from the parent and fires back mutations
 * so the parent can apply them to the store.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { AfPhoto, AfClass } from './afUtils';
import { useCloudProjectStore } from '../../store/cloudProjectStore';
import { AutoFlowDashboard } from './AutoFlowDashboard';
import { SwipeMode } from './SwipeMode';
import { AutoFlowGallery } from './AutoFlowGallery';
import { AutoFlowDupCompare } from './AutoFlowDupCompare';

type AutoFlowDecision = 'pick' | 'reject' | 'favorite' | 'review';

interface DecisionHistoryEntry {
  id: string;
  name: string;
  action: AutoFlowDecision;
  previous: Partial<AfPhoto>;
  current: Partial<AfPhoto>;
}

type Screen =
  | 'dashboard'
  | 'swipe'
  | { type: 'gallery'; cls: AfClass; title: string }
  | 'dup-compare';

interface AutoFlowModeProps {
  photos: AfPhoto[];
  initialPhotoIds?: string[];
  onMutation: (id: string, changes: Partial<AfPhoto>) => void;
  onDecision?: (id: string, decision: AutoFlowDecision, previous: Partial<AfPhoto>) => void;
  onRating?: (id: string, rating: number, previous: Partial<AfPhoto>) => void;
  onExportPicks?: () => void;
  onClose: () => void;
}

export const AutoFlowMode: React.FC<AutoFlowModeProps> = ({
  photos,
  initialPhotoIds,
  onMutation,
  onDecision,
  onRating,
  onExportPicks,
  onClose,
}) => {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [swipeQueue, setSwipeQueue] = useState<AfPhoto[]>([]);
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryEntry[]>([]);

  // A-38 : revalider les ids reçus (certaines photos ont pu être supprimées depuis le
  // filtrage) + A-37 : informer une fois si les décisions ne sont pas synchronisées au cloud.
  const openInfoShownRef = useRef(false);
  useEffect(() => {
    if (openInfoShownRef.current) return;
    openInfoShownRef.current = true;
    if (initialPhotoIds && initialPhotoIds.length > 0) {
      const available = new Set(photos.map((p) => p.id));
      const openable = initialPhotoIds.filter((id) => available.has(id)).length;
      const missing = initialPhotoIds.length - openable;
      if (missing > 0) {
        toast(`AutoFlow ouvert sur ${openable} photo(s) — ${missing} non disponible(s).`, { icon: 'ℹ️' });
      }
    }
    if (!useCloudProjectStore.getState().activeProject) {
      toast('Décisions enregistrées en local (aucun projet cloud actif).', { icon: '💾', id: 'autoflow-local' });
    }
  }, [initialPhotoIds, photos]);
  /** Local overrides — merged on top of incoming photos */
  const [overrides, setOverrides] = useState<Map<string, Partial<AfPhoto>>>(new Map());

  const applyOverride = (id: string, changes: Partial<AfPhoto>) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, { ...(prev.get(id) ?? {}), ...changes });
      return next;
    });
    onMutation(id, changes);
  };

  /** Merged view: incoming photos + local overrides */
  const mergedPhotos = useMemo<AfPhoto[]>(() =>
    photos.map((p) => {
      const ov = overrides.get(p.id);
      return ov ? { ...p, ...ov } : p;
    }),
  [photos, overrides]);

  const sessionPhotos = useMemo(() => {
    if (!initialPhotoIds || initialPhotoIds.length === 0) {
      return mergedPhotos;
    }
    const ids = new Set(initialPhotoIds);
    return mergedPhotos.filter((photo) => ids.has(photo.id));
  }, [initialPhotoIds, mergedPhotos]);

  const orderedSwipePhotos = useMemo(() => {
    const order: Record<AfClass, number> = { review: 0, keep: 1, reject: 2 };
    return [...sessionPhotos].sort((a, b) => {
      const byClass = order[a.cls] - order[b.cls];
      return byClass !== 0 ? byClass : b.score - a.score;
    });
  }, [sessionPhotos]);

  const startSwipe = () => {
    setSwipeQueue(orderedSwipePhotos);
    setScreen('swipe');
  };

  const snapshotDecisionState = (photo: AfPhoto): Partial<AfPhoto> => ({
    cls: photo.cls,
    isPick: photo.isPick,
    isRejected: photo.isRejected,
    isFavorite: photo.isFavorite,
    rating: photo.rating,
  });

  const inferDecisionFromState = (state: Partial<AfPhoto>): AutoFlowDecision | null => {
    if (state.isRejected === true || state.cls === 'reject') return 'reject';
    if (state.isFavorite === true) return 'favorite';
    if (state.isPick === true || state.cls === 'keep') return 'pick';
    if (state.cls === 'review') return 'review';
    return null;
  };

  const handleSwipeDecision = (id: string, action: AutoFlowDecision) => {
    const previousPhoto = mergedPhotos.find((p) => p.id === id);
    const previous = previousPhoto ? snapshotDecisionState(previousPhoto) : {};
    const changes: Partial<AfPhoto> =
      action === 'reject'
        ? { isRejected: true, isPick: false, isFavorite: false, cls: 'reject' }
        : action === 'review'
          ? { isRejected: false, isPick: false, isFavorite: false, cls: 'review' }
          : action === 'favorite'
            ? { rating: 5, isPick: true, isRejected: false, isFavorite: true, cls: 'keep' }
            : { isPick: true, isRejected: false, isFavorite: false, cls: 'keep' };
    if (previousPhoto) {
      const current = snapshotDecisionState({ ...previousPhoto, ...changes });
      setDecisionHistory((prev) => [
        {
          id,
          name: previousPhoto.name,
          action,
          previous,
          current,
        },
        ...prev,
      ].slice(0, 5));
    }
    applyOverride(id, changes);
    onDecision?.(id, action, previous);
  };

  const handleSwipeRating = (id: string, rating: number) => {
    const previousPhoto = mergedPhotos.find((p) => p.id === id);
    const previous = previousPhoto ? snapshotDecisionState(previousPhoto) : {};
    applyOverride(id, { rating });
    onRating?.(id, rating, previous);
  };

  const inferDecisionFromChanges = (changes: Partial<AfPhoto>): AutoFlowDecision | null => {
    if (changes.isRejected === true || changes.cls === 'reject') return 'reject';
    if (changes.isFavorite === true) return 'favorite';
    if (changes.isPick === true || changes.cls === 'keep') return 'pick';
    if (changes.isPick === false && changes.isRejected === false) return 'review';
    if (changes.cls === 'review') return 'review';
    return null;
  };

  const handleDirectDecisionMutation = (id: string, changes: Partial<AfPhoto>) => {
    const previousPhoto = mergedPhotos.find((p) => p.id === id);
    const previous = previousPhoto ? snapshotDecisionState(previousPhoto) : {};
    applyOverride(id, changes);

    const decision = inferDecisionFromChanges(changes);
    if (decision) {
      onDecision?.(id, decision, previous);
    }
  };

  const handleUndoLastDecision = () => {
    const lastDecision = decisionHistory[0];
    if (!lastDecision) return false;

    setDecisionHistory((prev) => prev.slice(1));
    applyOverride(lastDecision.id, lastDecision.previous);
    const restoredDecision = inferDecisionFromState(lastDecision.previous);
    if (restoredDecision) {
      onDecision?.(lastDecision.id, restoredDecision, lastDecision.current);
    }
    if (
      typeof lastDecision.previous.rating === 'number' &&
      lastDecision.previous.rating !== lastDecision.current.rating
    ) {
      onRating?.(lastDecision.id, lastDecision.previous.rating, lastDecision.current);
    }
    return true;
  };

  if (screen === 'swipe') {
    return (
      <SwipeMode
        photos={swipeQueue}
        onDecision={handleSwipeDecision}
        onRate={handleSwipeRating}
        onUndoLast={handleUndoLastDecision}
        decisionHistory={decisionHistory}
        onDone={() => setScreen('dashboard')}
      />
    );
  }

  if (screen === 'dup-compare') {
    return (
      <AutoFlowDupCompare
        photos={sessionPhotos}
        onDecision={handleDirectDecisionMutation}
        onBack={() => setScreen('dashboard')}
      />
    );
  }

  if (typeof screen === 'object' && screen.type === 'gallery') {
    const galleryPhotos = sessionPhotos.filter((p) => p.cls === screen.cls);
    return (
      <AutoFlowGallery
        photos={galleryPhotos}
        title={screen.title}
        cls={screen.cls}
        onBack={() => setScreen('dashboard')}
        onDecision={handleDirectDecisionMutation}
      />
    );
  }

  // Default: dashboard
  return (
    <AutoFlowDashboard
      photos={sessionPhotos}
      onStartSwipe={startSwipe}
      onGrid={(cls) => {
        const titles: Record<AfClass, string> = {
          keep:   'Picks automatiques',
          review: 'A revoir',
          reject: 'Rejets IA',
        };
        setScreen({ type: 'gallery', cls, title: titles[cls] });
      }}
      onDupCompare={() => setScreen('dup-compare')}
      onExportPicks={onExportPicks}
      onClose={onClose}
      onPhotoOpen={() => {}}
    />
  );
};
