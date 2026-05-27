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

type Screen =
  | 'dashboard'
  | 'swipe'
  | { type: 'gallery'; cls: AfClass; title: string }
  | 'dup-compare';

interface AutoFlowModeProps {
  photos: AfPhoto[];
  onMutation: (id: string, changes: Partial<AfPhoto>) => void;
  onClose: () => void;
}

export const AutoFlowMode: React.FC<AutoFlowModeProps> = ({ photos, onMutation, onClose }) => {
  const [screen, setScreen] = useState<Screen>('dashboard');
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

  /** Only review-class photos go into swipe mode */
  const swipePhotos = useMemo(
    () => mergedPhotos.filter((p) => p.cls === 'review'),
    [mergedPhotos]
  );

  const handleSwipeDecision = (id: string, action: 'pick' | 'reject' | 'star') => {
    const changes: Partial<AfPhoto> =
      action === 'reject'
        ? { isRejected: true, isPick: false, cls: 'reject' }
        : action === 'pick'
          ? { isPick: true, isRejected: false, cls: 'keep' }
          : { rating: 5, isPick: true, cls: 'keep' };
    applyOverride(id, changes);
  };

  if (screen === 'swipe') {
    return (
      <SwipeMode
        photos={swipePhotos}
        onDecision={handleSwipeDecision}
        onDone={() => setScreen('dashboard')}
      />
    );
  }

  if (screen === 'dup-compare') {
    return (
      <AutoFlowDupCompare
        photos={mergedPhotos}
        onDecision={applyOverride}
        onBack={() => setScreen('dashboard')}
      />
    );
  }

  if (typeof screen === 'object' && screen.type === 'gallery') {
    const galleryPhotos = mergedPhotos.filter((p) => p.cls === screen.cls);
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
      photos={mergedPhotos}
      onStartSwipe={() => setScreen('swipe')}
      onGrid={(cls) => {
        const titles: Record<AfClass, string> = {
          keep:   'Picks automatiques',
          review: 'A revoir',
          reject: 'Rejets IA',
        };
        setScreen({ type: 'gallery', cls, title: titles[cls] });
      }}
      onDupCompare={() => setScreen('dup-compare')}
      onClose={onClose}
      onPhotoOpen={() => {}}
    />
  );
};
