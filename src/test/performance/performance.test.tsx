import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import { beforeEach } from 'vitest';
import App from '../../App';
import { usePhotoStore } from '../../store/photoStore';

describe('Performance Tests', () => {
  beforeEach(() => {
    usePhotoStore.getState().clearAll();
  });

  it('should render within acceptable time', () => {
    const startTime = performance.now();
    render(<App />);
    const endTime = performance.now();

    const renderTime = endTime - startTime;
    // jsdom renders are slower than a browser; allow up to 2000ms in CI/jsdom
    expect(renderTime).toBeLessThan(2000);
  });

  it('should handle rapid user interactions', async () => {
    render(<App />);

    const tabs = screen.getAllByRole('button');

    const startTime = performance.now();

    // Rapidly click tabs
    for (let i = 0; i < 100; i++) {
      fireEvent.click(tabs[i % 3]);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    // jsdom event processing is slower and noisier than a real browser.
    expect(duration).toBeLessThan(7000);
  });

  it('should handle large DOM updates efficiently', async () => {
    render(<App />);

    const { addPhotos } = usePhotoStore.getState();

    // Create many photos
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
  });

  it('should handle memory efficiently', () => {
    const initialMemory = performance.memory?.usedJSHeapSize || 0;

    render(<App />);

    const { addPhotos, clearAll } = usePhotoStore.getState();

    // Add photos
    const photos = Array.from({ length: 100 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));

    addPhotos(photos);

    // Clear photos
    clearAll();

    const finalMemory = performance.memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable
    expect(memoryIncrease).toBeLessThan(1024 * 1024); // Less than 1MB
  });

  it('should handle concurrent operations efficiently', async () => {
    render(<App />);

    const { addPhotos, setActiveTab, clearAll } = usePhotoStore.getState();

    const startTime = performance.now();

    // Perform concurrent operations
    const promises = [];

    for (let i = 0; i < 50; i++) {
      const photos = Array.from({ length: 10 }, (_, j) => ({
        id: `photo-${i}-${j}`,
        file: new File([''], `photo-${i}-${j}.jpg`),
        previewUrl: `mocked-url-${i}-${j}`,
        analysis: null,
      }));

      promises.push(Promise.resolve().then(() => addPhotos(photos)));
    }

    // Switch tabs concurrently
    promises.push(Promise.resolve().then(() => setActiveTab('triage')));
    promises.push(Promise.resolve().then(() => setActiveTab('export')));

    await Promise.all(promises);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
  });

  it('should handle animation performance', async () => {
    render(<App />);

    const tabs = screen.getAllByRole('button');

    const startTime = performance.now();

    // Trigger animations
    fireEvent.click(tabs[1]);
    fireEvent.click(tabs[2]);
    fireEvent.click(tabs[0]);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(250); // jsdom animation event handling is noisy
  });

  it('should handle scroll performance', async () => {
    render(<App />);

    const { addPhotos } = usePhotoStore.getState();

    // Add many photos to create scrollable content
    const photos = Array.from({ length: 1000 }, (_, i) => ({
      id: `photo-${i}`,
      file: new File([''], `photo-${i}.jpg`),
      previewUrl: `mocked-url-${i}`,
      analysis: null,
    }));

    addPhotos(photos);

    const startTime = performance.now();

    // Simulate scrolling
    for (let i = 0; i < 100; i++) {
      fireEvent.scroll(window, { target: { scrollY: i * 100 } });
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(200); // Should complete in less than 200ms
  });

  it('should handle resize performance', async () => {
    render(<App />);

    const startTime = performance.now();

    // Simulate window resize
    for (let i = 0; i < 50; i++) {
      Object.defineProperty(window, 'innerWidth', { value: 800 + i * 10 });
      Object.defineProperty(window, 'innerHeight', { value: 600 + i * 10 });
      fireEvent.resize(window);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(300); // Should complete in less than 300ms
  });

  it('should handle focus performance', async () => {
    render(<App />);

    const tabs = screen.getAllByRole('button');

    const startTime = performance.now();

    // Rapidly change focus
    for (let i = 0; i < 100; i++) {
      tabs[i % 3].focus();
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    // jsdom focus handling varies under full-suite load.
    expect(duration).toBeLessThan(250);
  });

  it('should handle keyboard performance', async () => {
    render(<App />);

    const tabs = screen.getAllByRole('button');
    tabs[0].focus();

    const startTime = performance.now();

    // Simulate rapid keyboard input
    for (let i = 0; i < 100; i++) {
      fireEvent.keyDown(tabs[0], { key: 'Tab' });
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(100); // Should complete in less than 100ms
  });
});

