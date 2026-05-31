import React from 'react';
import { describe, it, beforeEach, afterEach, expect, vi, type Mock } from 'vitest';
import { render } from '@testing-library/react';
import { act, waitFor } from '@testing-library/react';

import { usePhotoAnalysis } from '../../hooks/usePhotoAnalysis';
import { usePhotoStore } from '../../store/photoStore';
import { useAiErrorStore } from '../../store/aiErrorStore';
import { Photo } from '../../types';

// usePhotoAnalysis.ts imports from '../../../services/geminiService' (root-level services/)
vi.mock('../../../services/geminiService', () => ({
  analyzePhotosBatch: vi.fn(),
}));

vi.mock('../../lib/analysis-queue-persistence', () => ({
  loadAnalysisState: vi.fn().mockResolvedValue({ photos: [], queue: [] }),
  saveAnalysisState: vi.fn().mockResolvedValue(undefined),
  clearAnalysisState: vi.fn().mockResolvedValue(undefined),
}));

const { analyzePhotosBatch } = await import('../../../services/geminiService');
const persistence = await import('../../lib/analysis-queue-persistence');

const createMockPhoto = (overrides?: Partial<Photo>): Photo => {
  const file = new File([''], overrides?.file?.name ?? 'photo.jpg', { type: 'image/jpeg' });
  return {
    id: overrides?.id ?? 'photo-1',
    file,
    previewUrl: overrides?.previewUrl ?? 'mock-preview-url',
    analysis: overrides?.analysis ?? null,
    ...overrides,
  };
};

const TestHarness: React.FC = () => {
  usePhotoAnalysis();
  return null;
};

describe('usePhotoAnalysis integration', () => {
  beforeEach(() => {
    // shouldAdvanceTime: true lets fake timers advance with real wall-clock time,
    // so waitFor polling (which uses setTimeout) still works.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.resetAllMocks();

    usePhotoStore.getState().clearAll();
    useAiErrorStore.getState().clearAll();

    (persistence.loadAnalysisState as Mock).mockResolvedValue({ photos: [], queue: [] });
    (persistence.saveAnalysisState as Mock).mockResolvedValue(undefined);
    (persistence.clearAnalysisState as Mock).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Reset store to prevent state leaking between tests
    await act(async () => {
      usePhotoStore.setState({
        stopProcessing: false,
        isProcessing: false,
        analysisQueue: [],
        photos: [],
      });
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  it('stops processing and clears persistence when stopProcessing is triggered', async () => {
    (analyzePhotosBatch as Mock).mockResolvedValue([{ tags: ['ok'] }]);

    const photo = createMockPhoto();
    const { addPhotos, addToAnalysisQueue, setIsProcessing } = usePhotoStore.getState();
    act(() => {
      addPhotos([photo]);
      addToAnalysisQueue([photo.id]);
      setIsProcessing(true);
    });

    render(<TestHarness />);

    await act(async () => {
      usePhotoStore.getState().setStopProcessing(true);
      vi.advanceTimersByTime(600);
    });

    await waitFor(
      () => {
        expect(usePhotoStore.getState().analysisQueue).toHaveLength(0);
      },
      { timeout: 10000 },
    );

    expect(usePhotoStore.getState().isProcessing).toBe(false);
    expect(persistence.clearAnalysisState).toHaveBeenCalled();
  }, 15000);

  it('reports and resolves analysis errors via AiErrorStore', async () => {
    // Hard-reset the store state to guarantee a clean slate for this test,
    // regardless of any leftover effects from the previous test.
    usePhotoStore.setState({
      photos: [],
      analysisQueue: [],
      analyzingPhotoIds: new Set(),
      isProcessing: false,
      stopProcessing: false,
      processedCount: 0,
    });
    useAiErrorStore.getState().clearAll();

    const photo = createMockPhoto({ id: 'photo-error' });

    (analyzePhotosBatch as Mock).mockResolvedValue([null]);

    act(() => {
      usePhotoStore.getState().addPhotos([photo]);
      usePhotoStore.getState().addToAnalysisQueue([photo.id]);
      usePhotoStore.getState().setIsProcessing(true);
    });

    render(<TestHarness />);

    // Advance past throttle and wait for error to be pushed
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(
      () => {
        const errors = useAiErrorStore.getState().errors;
        // pushError sets status to 'new' by default; markAsNotified is called by UI components,
        // not by the hook — so we check for 'new' or 'notified' (any non-resolved state).
        expect(errors.some((error) => error.photoId === photo.id && error.status !== 'resolved')).toBe(true);
      },
      { timeout: 10000 },
    );

    const warningError = useAiErrorStore
      .getState()
      .errors.find((error) => error.photoId === photo.id && error.status !== 'resolved');
    expect(warningError?.severity).toBe('warning');

    (analyzePhotosBatch as Mock).mockResolvedValue([{ tags: ['retry'] }]);

    act(() => {
      usePhotoStore.getState().addToAnalysisQueue([photo.id]);
      usePhotoStore.getState().setIsProcessing(true);
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(
      () => {
        const resolved = useAiErrorStore
          .getState()
          .errors.find((error) => error.photoId === photo.id && error.status === 'resolved');
        expect(resolved).toBeDefined();
      },
      { timeout: 10000 },
    );
  }, 15000);
});
