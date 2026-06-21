import { describe, it, expect } from 'vitest';
import { AnalysisCache, PerformanceTracker } from '../../lib/performance-tracker';

const makeFile = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

describe('P1-3 — bounded caches', () => {
  it('AnalysisCache never exceeds maxSize (LRU eviction)', () => {
    const cache = new AnalysisCache();
    const max = cache.getStats().maxSize;
    for (let i = 0; i < max + 50; i++) {
      cache.set(makeFile(`f${i}.jpg`), { score: i });
    }
    expect(cache.getStats().size).toBeLessThanOrEqual(max);
  });

  it('AnalysisCache evicts the oldest, keeps the most recent', () => {
    const cache = new AnalysisCache();
    const max = cache.getStats().maxSize;
    // Réutiliser les MÊMES instances File (la clé de cache dépend de lastModified).
    const files = Array.from({ length: max + 10 }, (_, i) => makeFile(`f${i}.jpg`));
    files.forEach((f, i) => cache.set(f, { score: i }));
    // The very first inserted entry must have been evicted.
    expect(cache.has(files[0])).toBe(false);
    // A recent one is still present.
    expect(cache.has(files[files.length - 1])).toBe(true);
  });

  it('PerformanceTracker.metrics is capped', () => {
    const tracker = new PerformanceTracker();
    for (let i = 0; i < 700; i++) {
      const id = tracker.startOperation(`op-${i}`);
      tracker.endOperation(id, true);
    }
    expect(tracker.getMetricsSnapshot().length).toBeLessThanOrEqual(500);
  });
});
