import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePhotoStore } from '../../store/photoStore';
import type { Photo } from '../../types';

global.URL.createObjectURL = vi.fn(() => 'mocked-url');
global.URL.revokeObjectURL = vi.fn();

const mk = (id: string, analysis: Photo['analysis']): Photo => ({
  id,
  file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: 'mocked-url',
  analysis,
});

describe('requeueForAnalysis (A-17/A-19)', () => {
  beforeEach(() => usePhotoStore.getState().clearAll());

  it('réinitialise l\'erreur, garde le fileHash, remet en file et relance', () => {
    usePhotoStore.getState().addPhotos([mk('p1', { error: 'Analysis failed', fileHash: 'h1' })]);
    // addPhotos a déjà mis p1 dans la file ; on vide pour simuler un état post-arrêt.
    usePhotoStore.setState((s) => ({ ...s, analysisQueue: [], isProcessing: false }));

    usePhotoStore.getState().requeueForAnalysis(['p1']);

    const s = usePhotoStore.getState();
    expect(s.analysisQueue).toContain('p1');
    expect(s.isProcessing).toBe(true);
    expect(s.stopProcessing).toBe(false);
    const p1 = s.photos.find((p) => p.id === 'p1');
    expect(p1?.analysis?.error).toBeUndefined();
    expect(p1?.analysis?.fileHash).toBe('h1');
  });

  it('ignore les ids inconnus', () => {
    usePhotoStore.getState().requeueForAnalysis(['nope']);
    expect(usePhotoStore.getState().analysisQueue).not.toContain('nope');
  });
});
