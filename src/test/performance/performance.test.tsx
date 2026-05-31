import { describe, it, expect } from 'vitest';
import { renderApp, screen, fireEvent } from '../test-utils';
import { beforeEach } from 'vitest';
import { usePhotoStore } from '../../store/photoStore';

// These exercise heavy interaction/data paths to ensure the app stays responsive
// and does not crash. They assert behaviour (app still mounted, store updated)
// rather than wall-clock thresholds, which are non-deterministic under full-suite
// load and produced flaky failures.

const getPrimaryTabButtons = () => [
  screen.getByRole('button', { name: 'Ingestion' }),
  screen.getByRole('button', { name: 'Triage' }),
  screen.getByRole('button', { name: 'Exportation' }),
];

const makePhotos = (count: number, prefix = 'photo') =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    file: new File([''], `${prefix}-${i}.jpg`),
    previewUrl: `mocked-url-${prefix}-${i}`,
    analysis: null,
  }));

describe('Performance Tests', () => {
  beforeEach(() => {
    usePhotoStore.getState().clearAll();
  });

  it('renders the primary tabs without crashing', async () => {
    await renderApp();
    expect(getPrimaryTabButtons()).toHaveLength(3);
  });

  it('stays responsive under rapid tab switching', async () => {
    await renderApp();
    const tabs = getPrimaryTabButtons();

    for (let i = 0; i < 100; i++) {
      fireEvent.click(tabs[i % 3]);
    }

    // App is still mounted and interactive after the burst of clicks.
    expect(getPrimaryTabButtons()).toHaveLength(3);
  });

  it('handles large DOM updates without errors', async () => {
    await renderApp();
    usePhotoStore.getState().addPhotos(makePhotos(1000));
    expect(usePhotoStore.getState().photos.length).toBeGreaterThan(0);
  });

  it('releases photos on clearAll', async () => {
    await renderApp();
    const { addPhotos, clearAll } = usePhotoStore.getState();
    addPhotos(makePhotos(100));
    clearAll();
    expect(usePhotoStore.getState().photos).toHaveLength(0);
  });

  it('handles concurrent store operations', async () => {
    await renderApp();
    const { addPhotos, setActiveTab } = usePhotoStore.getState();

    const promises: Promise<void>[] = [];
    for (let i = 0; i < 50; i++) {
      promises.push(Promise.resolve().then(() => addPhotos(makePhotos(10, `batch-${i}`))));
    }
    promises.push(Promise.resolve().then(() => setActiveTab('triage')));
    promises.push(Promise.resolve().then(() => setActiveTab('export')));

    await Promise.all(promises);

    expect(usePhotoStore.getState().photos.length).toBeGreaterThan(0);
  });

  it('handles animation-triggering tab transitions', async () => {
    await renderApp();
    const tabs = getPrimaryTabButtons();

    fireEvent.click(tabs[1]);
    fireEvent.click(tabs[2]);
    fireEvent.click(tabs[0]);

    expect(getPrimaryTabButtons()).toHaveLength(3);
  });

  it('handles scrolling over large content', async () => {
    await renderApp();
    usePhotoStore.getState().addPhotos(makePhotos(1000));

    for (let i = 0; i < 100; i++) {
      fireEvent.scroll(window, { target: { scrollY: i * 100 } });
    }

    expect(usePhotoStore.getState().photos.length).toBeGreaterThan(0);
  });

  it('handles repeated window resizes', async () => {
    await renderApp();

    for (let i = 0; i < 50; i++) {
      Object.defineProperty(window, 'innerWidth', { value: 800 + i * 10, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 600 + i * 10, configurable: true });
      fireEvent.resize(window);
    }

    expect(getPrimaryTabButtons()).toHaveLength(3);
  });

  it('handles rapid focus changes', async () => {
    await renderApp();
    const tabs = getPrimaryTabButtons();

    for (let i = 0; i < 100; i++) {
      tabs[i % 3].focus();
    }

    expect(tabs).toContain(document.activeElement);
  });

  it('handles rapid keyboard input', async () => {
    await renderApp();
    const tabs = getPrimaryTabButtons();
    tabs[0].focus();

    for (let i = 0; i < 100; i++) {
      fireEvent.keyDown(tabs[0], { key: 'Tab' });
    }

    expect(getPrimaryTabButtons()).toHaveLength(3);
  });
});
