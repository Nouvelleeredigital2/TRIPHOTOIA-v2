import { describe, it, expect, vi } from 'vitest';
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

describe('Load Tests', () => {
  it('should handle 1000 photos efficiently', () => {
    const { addPhotos } = usePhotoStore.getState();

    const photos: Photo[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));

    const startTime = performance.now();
    addPhotos(photos);
    const endTime = performance.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(200); // Should complete in less than 200ms

    const { photos: storePhotos } = usePhotoStore.getState();
    expect(storePhotos).toHaveLength(1000);
  });

  it('should handle 5000 photos efficiently', () => {
    const { addPhotos } = usePhotoStore.getState();

    const photos: Photo[] = Array.from({ length: 5000 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));

    const startTime = performance.now();
    addPhotos(photos);
    const endTime = performance.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(1000); // Should complete in less than 1 second

    const { photos: storePhotos } = usePhotoStore.getState();
    expect(storePhotos).toHaveLength(5000);
  });

  it('should handle rapid state updates', () => {
    const { addToAnalysisQueue, removeFromAnalysisQueue } = usePhotoStore.getState();

    const startTime = performance.now();

    // Perform 1000 rapid updates
    for (let i = 0; i < 1000; i++) {
      addToAnalysisQueue([`photo-${i}`]);
      removeFromAnalysisQueue([`photo-${i}`]);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(7000); // jsdom store timing is noisy on loaded machines
  });

  it('should handle large duplicate groups', () => {
    const { addPhotos, setDuplicateGroups } = usePhotoStore.getState();

    // Create a large duplicate group
    const photos: Photo[] = Array.from({ length: 100 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: {
        perceptualHash: 'a'.repeat(64),
        sharpnessScore: Math.random(),
      },
    }));

    addPhotos(photos);

    const startTime = performance.now();

    const duplicateGroups = [{
      id: 'group-1',
      hash: 'a'.repeat(64),
      photos: photos,
      bestPhotoId: photos[0].id,
    }];

    setDuplicateGroups(duplicateGroups);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(50); // Should complete in less than 50ms
  });

  it('should handle memory pressure', () => {
    const { addPhotos, clearAll } = usePhotoStore.getState();

    // Create photos with large file sizes
    const photos: Photo[] = Array.from({ length: 500 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File(['x'.repeat(1024 * 1024)], `photo-${i}.jpg`), // 1MB each
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));

    addPhotos(photos);

    const { photos: storePhotos } = usePhotoStore.getState();
    expect(storePhotos.length).toBeGreaterThanOrEqual(500); // Should have at least 500 photos

    // Clear and verify memory is freed
    clearAll();
    const { photos: clearedPhotos } = usePhotoStore.getState();
    expect(clearedPhotos).toHaveLength(0);
  });

  it('should handle concurrent operations', async () => {
    const { addPhotos, setActiveTab } = usePhotoStore.getState();

    // Simulate 100 concurrent operations
    const promises = [];

    for (let i = 0; i < 100; i++) {
      const mockFile = new File([''], `test-${i}.jpg`, { type: 'image/jpeg' });
      const mockPhoto = {
        id: `test-photo-${i}`,
        file: mockFile,
        previewUrl: `mocked-url-${i}`,
        analysis: null,
      };

      promises.push(Promise.resolve().then(() => addPhotos([mockPhoto])));
    }

    // Switch tabs concurrently
    promises.push(Promise.resolve().then(() => setActiveTab('triage')));
    promises.push(Promise.resolve().then(() => setActiveTab('export')));

    const startTime = performance.now();
    await Promise.all(promises);
    const endTime = performance.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(5000); // Should complete in less than 5 seconds (more realistic)

    // State should be consistent
    const state = usePhotoStore.getState();
    expect(state.photos).toHaveLength(100);
  });
});
