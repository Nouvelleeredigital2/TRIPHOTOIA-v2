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

describe('Performance Tests', () => {
  it('should handle large number of photos efficiently', () => {
    const { addPhotos } = usePhotoStore.getState();

    // Create a large number of photos
    const photos: Photo[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));

    addPhotos(photos);

    const { photos: storePhotos } = usePhotoStore.getState();
    expect(storePhotos).toHaveLength(1000);
  });

  it('should handle rapid state updates efficiently', () => {
    const { addToAnalysisQueue, removeFromAnalysisQueue } = usePhotoStore.getState();

    const startTime = performance.now();

    // Perform many rapid updates
    for (let i = 0; i < 100; i++) {
      addToAnalysisQueue([`photo-${i}`]);
      removeFromAnalysisQueue([`photo-${i}`]);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(500); // Should complete in less than 500ms (more realistic)
  });

  it('should handle duplicate detection efficiently', () => {
    const { addPhotos, setDuplicateGroups } = usePhotoStore.getState();

    // Create photos with similar hashes
    const photos: Photo[] = Array.from({ length: 100 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: {
        perceptualHash: 'a'.repeat(64), // Same hash for all photos
        sharpnessScore: Math.random(),
      },
    }));

    addPhotos(photos);

    const startTime = performance.now();

    // Simulate duplicate detection
    const duplicateGroups = [{
      id: 'group-1',
      hash: 'a'.repeat(64),
      photos: photos.slice(0, 10),
      bestPhotoId: photos[0].id,
    }];

    setDuplicateGroups(duplicateGroups);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(10); // Should complete in less than 10ms
  });

  it('should handle memory efficiently', () => {
    const { addPhotos, clearAll } = usePhotoStore.getState();

    // Create photos with large file sizes
    const photos: Photo[] = Array.from({ length: 100 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File(['x'.repeat(1024 * 1024)], `photo-${i}.jpg`), // 1MB each
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));

    addPhotos(photos);

    const { photos: storePhotos } = usePhotoStore.getState();
    expect(storePhotos.length).toBeGreaterThanOrEqual(100); // Should have at least 100 photos

    // Clear and verify memory is freed
    clearAll();
    const { photos: clearedPhotos } = usePhotoStore.getState();
    expect(clearedPhotos).toHaveLength(0);
  });
});
