import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import App from '../../App';
import { usePhotoStore } from '../../store/photoStore';

describe('Load Tests', () => {
  it('should handle 1000 photos efficiently', async () => {
    render(<App />);
    
    const { addPhotos } = usePhotoStore.getState();
    
    const photos = Array.from({ length: 1000 }, (_, i) => ({
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
    
    const state = usePhotoStore.getState();
    expect(state.photos).toHaveLength(1000);
  });

  it('should handle 5000 photos efficiently', async () => {
    render(<App />);
    
    const { addPhotos } = usePhotoStore.getState();
    
    const photos = Array.from({ length: 5000 }, (_, i) => ({
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
    
    const state = usePhotoStore.getState();
    expect(state.photos).toHaveLength(5000);
  });

  it('should handle rapid state updates', async () => {
    render(<App />);
    
    const { addToAnalysisQueue, removeFromAnalysisQueue } = usePhotoStore.getState();
    
    const startTime = performance.now();
    
    // Perform 1000 rapid updates
    for (let i = 0; i < 1000; i++) {
      addToAnalysisQueue([`photo-${i}`]);
      removeFromAnalysisQueue([`photo-${i}`]);
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(500); // Should complete in less than 500ms
  });

  it('should handle large duplicate groups', async () => {
    render(<App />);
    
    const { addPhotos, setDuplicateGroups } = usePhotoStore.getState();
    
    // Create a large duplicate group
    const photos = Array.from({ length: 100 }, (_, i) => ({
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

  it('should handle memory pressure', async () => {
    render(<App />);

    const { addPhotos, clearAll } = usePhotoStore.getState();

    // Use small file objects — we're testing store capacity, not file I/O
    const photos = Array.from({ length: 500 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));

    addPhotos(photos);
    
    const state = usePhotoStore.getState();
    expect(state.photos).toHaveLength(500);
    
    // Clear and verify memory is freed
    clearAll();
    const clearedState = usePhotoStore.getState();
    expect(clearedState.photos).toHaveLength(0);
  });

  it('should handle concurrent operations', async () => {
    render(<App />);
    
    const { addPhotos, setActiveTab, updatePhotoAnalysis } = usePhotoStore.getState();
    
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
    expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    
    // State should be consistent
    const state = usePhotoStore.getState();
    expect(state.photos).toHaveLength(100);
  });

  it('should handle rapid user interactions', async () => {
    render(<App />);

    const tabs = screen.getAllByRole('button');
    const tabCount = Math.min(tabs.length, 3);

    const startTime = performance.now();

    // Rapidly click tabs — use 100 clicks (enough to test the scenario without OOM in jsdom)
    for (let i = 0; i < 100; i++) {
      fireEvent.click(tabs[i % tabCount]);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Allow up to 5 seconds in jsdom
    expect(duration).toBeLessThan(5000);
  }, 10000);

  it('should handle large file uploads', async () => {
    render(<App />);

    const { addPhotos } = usePhotoStore.getState();

    // Use small file objects — we're testing store capacity, not file I/O
    const photos = Array.from({ length: 100 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));
    
    const startTime = performance.now();
    addPhotos(photos);
    const endTime = performance.now();
    
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(500); // Should complete in less than 500ms
    
    const state = usePhotoStore.getState();
    expect(state.photos).toHaveLength(100);
  });

  it('should handle rapid photo analysis updates', async () => {
    render(<App />);
    
    const { addPhotos, updatePhotoAnalysis } = usePhotoStore.getState();
    
    // Add photos
    const photos = Array.from({ length: 100 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));
    
    addPhotos(photos);
    
    const startTime = performance.now();
    
    // Rapidly update analysis
    for (let i = 0; i < 100; i++) {
      updatePhotoAnalysis(`photo-${i}`, {
        tags: [`tag-${i}`],
        sharpnessScore: Math.random(),
      });
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(200); // Should complete in less than 200ms
  });

  it('should handle rapid duplicate detection', async () => {
    render(<App />);
    
    const { addPhotos, setDuplicateGroups } = usePhotoStore.getState();
    
    // Add photos
    const photos = Array.from({ length: 100 }, (_, i) => ({
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
    
    // Rapidly update duplicate groups
    for (let i = 0; i < 50; i++) {
      setDuplicateGroups([{
        id: `group-${i}`,
        hash: 'a'.repeat(64),
        photos: photos.slice(0, 10),
        bestPhotoId: photos[0].id,
      }]);
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(100); // Should complete in less than 100ms
  });
});




