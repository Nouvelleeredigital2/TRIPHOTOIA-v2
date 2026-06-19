import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePhotoStore } from '../../store/photoStore';
import { Photo } from '../../types';

// Mock File constructor
global.File = class MockFile {
  name: string;
  size: number;
  type: string;
  lastModified: number;

  constructor(name: string, size: number, type: string = 'image/jpeg') {
    this.name = name;
    this.size = size;
    this.type = type;
    this.lastModified = Date.now();
  }
} as unknown as typeof File;

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mocked-url');
global.URL.revokeObjectURL = vi.fn();

describe('PhotoStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePhotoStore.getState().clearAll();
  });

  it('should add photos correctly', () => {
    const { addPhotos } = usePhotoStore.getState();
    const mockFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
    const mockPhoto: Photo = {
      id: 'test-photo',
      file: mockFile,
      previewUrl: 'mocked-url',
      analysis: null,
    };

    addPhotos([mockPhoto]);

    const { photos } = usePhotoStore.getState();
    expect(photos).toHaveLength(1);
    expect(photos[0]).toEqual(mockPhoto);
  });

  it('should update photo analysis', () => {
    const { addPhotos, updatePhotoAnalysis } = usePhotoStore.getState();
    const mockFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
    const mockPhoto: Photo = {
      id: 'test-photo',
      file: mockFile,
      previewUrl: 'mocked-url',
      analysis: null,
    };

    addPhotos([mockPhoto]);
    updatePhotoAnalysis('test-photo', { tags: ['nature'], sharpnessScore: 0.8 });

    const { photos } = usePhotoStore.getState();
    expect(photos[0].analysis).toEqual({ tags: ['nature'], sharpnessScore: 0.8 });
  });

  it('should manage analysis queue', () => {
    const { addToAnalysisQueue, removeFromAnalysisQueue } = usePhotoStore.getState();

    addToAnalysisQueue(['photo1', 'photo2', 'photo3']);
    expect(usePhotoStore.getState().analysisQueue).toEqual(['photo1', 'photo2', 'photo3']);

    removeFromAnalysisQueue(['photo1']);
    expect(usePhotoStore.getState().analysisQueue).toEqual(['photo2', 'photo3']);
  });

  it('should handle undo actions', () => {
    const { addUndoAction, undo } = usePhotoStore.getState();

    // Add an undo action
    addUndoAction({
      type: 'SET_BEST',
      payload: { groupId: 'group1', previousBestId: 'photo1', newBestId: 'photo2' },
    });

    expect(usePhotoStore.getState().undoStack).toHaveLength(1);

    // Undo the action
    undo();
    expect(usePhotoStore.getState().undoStack).toHaveLength(0);
  });

  it('should clear all state', () => {
    const { addPhotos, setActiveTab, clearAll } = usePhotoStore.getState();
    const mockFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
    const mockPhoto: Photo = {
      id: 'test-photo',
      file: mockFile,
      previewUrl: 'mocked-url',
      analysis: null,
    };

    addPhotos([mockPhoto]);
    setActiveTab('triage');

    clearAll();

    const state = usePhotoStore.getState();
    expect(state.photos).toHaveLength(0);
    expect(state.activeTab).toBe('ingestion');
    expect(state.analysisQueue).toHaveLength(0);
  });

  it('should apply the wedding workflow template once', () => {
    const { applyWeddingTemplate } = usePhotoStore.getState();

    const createdIds = applyWeddingTemplate();
    const firstState = usePhotoStore.getState();

    expect(createdIds).toHaveLength(11);
    expect(firstState.collectionOrder.map((id) => firstState.collections[id]?.name)).toEqual([
      'Collection principale',
      'Préparatifs',
      'Cérémonie',
      'Couple',
      'Famille',
      'Groupes',
      'Cocktail',
      'Détails',
      'Soirée',
      'Best of',
      'Album',
      'Client',
    ]);

    expect(applyWeddingTemplate()).toEqual([]);
    expect(usePhotoStore.getState().collectionOrder).toHaveLength(12);
  });
});
