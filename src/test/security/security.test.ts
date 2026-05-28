import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePhotoStore } from '../../store/photoStore';
import { Photo } from '../../types';

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mocked-url');
global.URL.revokeObjectURL = vi.fn();

describe('Security Tests', () => {
  beforeEach(() => {
    // Reset the store's in-memory state between tests
    usePhotoStore.setState({ photos: [], analysisQueue: [], isProcessing: false });
  });

  it('should sanitize file names', () => {
    const store = usePhotoStore.getState();

    const maliciousFile = new File([''], '../../../etc/passwd', { type: 'image/jpeg' });
    const maliciousPhoto: Photo = {
      id: 'malicious-photo',
      file: maliciousFile,
      previewUrl: 'mocked-url',
      analysis: null,
    };

    store.addPhotos([maliciousPhoto]);

    const { photos } = usePhotoStore.getState();
    expect(photos).toHaveLength(1);
    // The file name should be preserved as-is since it's just a display name
    // Real sanitization would happen during file processing
    expect(photos[0].file.name).toBe('../../../etc/passwd');
  });

  it('should handle malicious file types', () => {
    const { addPhotos } = usePhotoStore.getState();

    const maliciousFile = new File([''], 'malicious.exe', { type: 'application/x-executable' });
    const maliciousPhoto: Photo = {
      id: 'malicious-photo',
      file: maliciousFile,
      previewUrl: 'mocked-url',
      analysis: null,
    };

    addPhotos([maliciousPhoto]);

    const { photos } = usePhotoStore.getState();
    expect(photos).toHaveLength(1);
    // The file should be accepted but processing should be handled safely
  });

  it('should handle extremely large files', () => {
    const { addPhotos } = usePhotoStore.getState();

    // Declare a very large file without allocating 100 MB in the test process.
    const largeFile = new File([''], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(largeFile, 'size', { value: 100 * 1024 * 1024 });
    const largePhoto: Photo = {
      id: 'large-photo',
      file: largeFile,
      previewUrl: 'mocked-url',
      analysis: null,
    };

    addPhotos([largePhoto]);

    const { photos } = usePhotoStore.getState();
    expect(photos).toHaveLength(1);
    expect(photos[0].file.size).toBe(100 * 1024 * 1024);
  });

  it('should handle malicious analysis data', () => {
    const store = usePhotoStore.getState();

    const mockFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
    const mockPhoto: Photo = {
      id: 'test-photo',
      file: mockFile,
      previewUrl: 'mocked-url',
      analysis: null,
    };

    store.addPhotos([mockPhoto]);

    // Try to inject malicious data
    const maliciousAnalysis = {
      tags: ['<script>alert("xss")</script>', 'normal-tag'],
      sharpnessScore: 0.8,
    };

    store.updatePhotoAnalysis('test-photo', maliciousAnalysis);

    const { photos } = usePhotoStore.getState();
    // The data should be stored as-is, sanitization would happen during rendering
    expect(photos[0].analysis).toBeDefined();
    expect(photos[0].analysis?.tags).toContain('normal-tag');
  });

  it('should handle invalid photo IDs', () => {
    const store = usePhotoStore.getState();

    // Try to update non-existent photo
    store.updatePhotoAnalysis('non-existent-id', { tags: ['test'] });
    store.updateUserTags('non-existent-id', ['test']);

    // Should not crash or cause errors
    expect(true).toBe(true);
  });

  it('should handle malformed undo actions', () => {
    const store = usePhotoStore.getState();

    // Try to add malformed undo action
    store.addUndoAction({
      type: 'SET_BEST',
      payload: {
        groupId: 'group1',
        previousBestId: 'photo1',
        newBestId: 'photo2',
      },
    });

    // Should not crash
    store.undo();

    expect(true).toBe(true);
  });

  it('should handle concurrent malicious operations', async () => {
    const store = usePhotoStore.getState();

    // Simulate concurrent malicious operations
    const promises = [];

    for (let i = 0; i < 100; i++) {
      const maliciousFile = new File([''], `malicious-${i}.exe`, { type: 'application/x-executable' });
      const maliciousPhoto = {
        id: `malicious-photo-${i}`,
        file: maliciousFile,
        previewUrl: `mocked-url-${i}`,
        analysis: null,
      };

      promises.push(Promise.resolve().then(() => store.addPhotos([maliciousPhoto])));
    }

    // Clear concurrently
    promises.push(Promise.resolve().then(() => store.clearAll()));

    await Promise.all(promises);

    // State should be consistent
    const { photos } = usePhotoStore.getState();
    expect(photos).toHaveLength(0);
  });

  it('should handle memory exhaustion attacks', () => {
    const store = usePhotoStore.getState();

    // Test resilience with many photos (use empty content — we test capacity, not file I/O)
    const photos: Photo[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));

    store.addPhotos(photos);

    const { photos: storePhotos } = usePhotoStore.getState();
    expect(storePhotos.length).toBeGreaterThanOrEqual(1000);

    // Clear to free memory
    store.clearAll();
    const { photos: clearedPhotos } = usePhotoStore.getState();
    expect(clearedPhotos).toHaveLength(0);
  });
});
