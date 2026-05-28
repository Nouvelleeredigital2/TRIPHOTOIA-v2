/**
 * AutoFlow v2 — Master coordinator
 *
 * Manages the full AutoFlow flow:
 *   dashboard → swipe → gallery → dup-compare
 *
 * Receives AfPhotos from the parent and fires back mutations
 * so the parent can apply them to the store.
 */
import React, { useState, useMemo } from 'react';
import { AfPhoto, AfClass } from './afUtils';
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
  onExportPicks?: () => void;
  onClose: () => void;
}

export const AutoFlowMode: React.FC<AutoFlowModeProps> = ({
  photos,
  initialPhotoIds,
  onMutation,
  onExportPicks,
  onClose,
}) => {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [swipeQueue, setSwipeQueue] = useState<AfPhoto[]>([]);
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryEntry[]>([]);
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

  const handleSwipeDecision = (id: string, action: AutoFlowDecision) => {
    const previousPhoto = mergedPhotos.find((p) => p.id === id);
    const changes: Partial<AfPhoto> =
      action === 'reject'
        ? { isRejected: true, isPick: false, isFavorite: false, cls: 'reject' }
        : action === 'review'
          ? { isRejected: false, isPick: false, isFavorite: false, cls: 'review' }
          : action === 'favorite'
            ? { rating: 5, isPick: true, isRejected: false, isFavorite: true, cls: 'keep' }
            : { isPick: true, isRejected: false, isFavorite: false, cls: 'keep' };
    if (previousPhoto) {
      setDecisionHistory((prev) => [
        {
          id,
          name: previousPhoto.name,
          action,
          previous: snapshotDecisionState(previousPhoto),
        },
        ...prev,
      ].slice(0, 5));
    }
    applyOverride(id, changes);
  };

  const handleSwipeRating = (id: string, rating: number) => {
    applyOverride(id, { rating });
  };

  const handleUndoLastDecision = () => {
    const lastDecision = decisionHistory[0];
    if (!lastDecision) return false;

    setDecisionHistory((prev) => prev.slice(1));
    applyOverride(lastDecision.id, lastDecision.previous);
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
        onDecision={applyOverride}
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
        onDecision={applyOverride}
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
