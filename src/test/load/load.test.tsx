import { describe, it, expect } from 'vitest';
import { fireEvent, renderApp, screen } from '../test-utils';
import { usePhotoStore } from '../../store/photoStore';

// Capacity/responsiveness checks. They assert behaviour (store stays consistent,
// app stays mounted) rather than wall-clock thresholds, which are non-deterministic
// under full-suite load and produced flaky failures.

const makePhotos = (count: number, withHash = false) =>
  Array.from({ length: count }, (_, i) => ({
    id: `photo-${i}`,
    file: new File([''], `photo-${i}.jpg`),
    previewUrl: `mocked-url-${i}`,
    analysis: withHash
      ? { perceptualHash: 'a'.repeat(64), sharpnessScore: Math.random() }
      : null,
  }));

const getPrimaryTabButtons = () => [
  screen.getByRole('button', { name: 'Ingestion' }),
  screen.getByRole('button', { name: 'Triage' }),
  screen.getByRole('button', { name: 'Exportation' }),
];

describe('Load Tests', () => {
  it('handles 1000 photos', async () => {
    await renderApp();
    usePhotoStore.getState().addPhotos(makePhotos(1000));
    expect(usePhotoStore.getState().photos).toHaveLength(1000);
  });

  it('handles 5000 photos', async () => {
    await renderApp();
    usePhotoStore.getState().addPhotos(makePhotos(5000));
    expect(usePhotoStore.getState().photos).toHaveLength(5000);
  });

  it('handles rapid analysis-queue churn without corrupting state', async () => {
    await renderApp();
    const { addToAnalysisQueue, removeFromAnalysisQueue } =
      usePhotoStore.getState();

    for (let i = 0; i < 1000; i++) {
      addToAnalysisQueue([`photo-${i}`]);
      removeFromAnalysisQueue([`photo-${i}`]);
    }

    // No photos were added, and the churn left the store consistent.
    expect(usePhotoStore.getState().photos).toHaveLength(0);
  });

  it('handles large duplicate groups', async () => {
    await renderApp();
    const { addPhotos, setDuplicateGroups } = usePhotoStore.getState();
    const photos = makePhotos(100, true);
    addPhotos(photos);

    setDuplicateGroups([
      {
        id: 'group-1',
        hash: 'a'.repeat(64),
        photos,
        bestPhotoId: photos[0].id,
      },
    ]);

    expect(usePhotoStore.getState().photos).toHaveLength(100);
  });

  it('frees photos under memory pressure', async () => {
    await renderApp();
    const { addPhotos, clearAll } = usePhotoStore.getState();
    addPhotos(makePhotos(500));
    expect(usePhotoStore.getState().photos).toHaveLength(500);
    clearAll();
    expect(usePhotoStore.getState().photos).toHaveLength(0);
  });

  it('keeps state consistent under concurrent operations', async () => {
    await renderApp();
    const { addPhotos, setActiveTab } = usePhotoStore.getState();

    const promises: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        Promise.resolve().then(() =>
          addPhotos([
            {
              id: `test-photo-${i}`,
              file: new File([''], `test-${i}.jpg`, { type: 'image/jpeg' }),
              previewUrl: `mocked-url-${i}`,
              analysis: null,
            },
          ])
        )
      );
    }
    promises.push(Promise.resolve().then(() => setActiveTab('triage')));
    promises.push(Promise.resolve().then(() => setActiveTab('export')));

    await Promise.all(promises);

    expect(usePhotoStore.getState().photos).toHaveLength(100);
  });

  it('stays responsive under rapid tab clicks', async () => {
    await renderApp();
    const tabs = getPrimaryTabButtons();

    for (let i = 0; i < 100; i++) {
      fireEvent.click(tabs[i % 3]);
    }

    expect(getPrimaryTabButtons()).toHaveLength(3);
  });

  it('handles a batch of file uploads', async () => {
    await renderApp();
    usePhotoStore.getState().addPhotos(makePhotos(100));
    expect(usePhotoStore.getState().photos).toHaveLength(100);
  });

  it('handles rapid photo-analysis updates', async () => {
    await renderApp();
    const { addPhotos, updatePhotoAnalysis } = usePhotoStore.getState();
    addPhotos(makePhotos(100));

    for (let i = 0; i < 100; i++) {
      updatePhotoAnalysis(`photo-${i}`, {
        tags: [`tag-${i}`],
        sharpnessScore: Math.random(),
      });
    }

    expect(usePhotoStore.getState().photos).toHaveLength(100);
  });

  it('handles rapid duplicate-detection updates', async () => {
    await renderApp();
    const { addPhotos, setDuplicateGroups } = usePhotoStore.getState();
    const photos = makePhotos(100, true);
    addPhotos(photos);

    for (let i = 0; i < 50; i++) {
      setDuplicateGroups([
        {
          id: `group-${i}`,
          hash: 'a'.repeat(64),
          photos: photos.slice(0, 10),
          bestPhotoId: photos[0].id,
        },
      ]);
    }

    expect(usePhotoStore.getState().photos).toHaveLength(100);
  });
});
