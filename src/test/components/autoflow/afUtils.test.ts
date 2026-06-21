import { describe, it, expect } from 'vitest';
import {
  toAfPhotos,
  classifyPhoto,
  buildSuggestion,
} from '../../../components/autoflow/afUtils';
import type { Photo, DuplicateGroup, PhotoAnalysis } from '../../../types';

const makePhoto = (id: string, analysis: Partial<PhotoAnalysis> | null = {}): Photo => ({
  id,
  file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: `${id}.jpg`,
  analysis: analysis as PhotoAnalysis | null,
});

const group = (photos: Photo[], bestPhotoId: string): DuplicateGroup => ({
  id: `g-${bestPhotoId}`,
  hash: 'h',
  photos,
  bestPhotoId,
});

describe('AutoFlow classification — duplicate group invariant (P0-3)', () => {
  it('never classifies a whole duplicate group as reject', () => {
    const a = makePhoto('a', { sharpnessScore: 0.6, compositionScore: 0.6 });
    const b = makePhoto('b', { sharpnessScore: 0.6, compositionScore: 0.6 });
    const af = toAfPhotos([a, b], [group([a, b], 'a')]);
    const kept = af.filter((p) => p.cls !== 'reject');
    expect(kept.length).toBeGreaterThanOrEqual(1);
    // The designated best is never auto-rejected just for being a duplicate.
    expect(af.find((p) => p.id === 'a')!.cls).not.toBe('reject');
    // The other member is a review candidate, not an auto-reject.
    expect(af.find((p) => p.id === 'b')!.cls).toBe('review');
  });

  it('keeps the best in review even when it is blurry (group always survives)', () => {
    const a = makePhoto('a', { isBlurry: true });
    const b = makePhoto('b', { isBlurry: true });
    const af = toAfPhotos([a, b], [group([a, b], 'a')]);
    expect(af.find((p) => p.id === 'a')!.cls).toBe('review');
    expect(af.some((p) => p.cls !== 'reject')).toBe(true);
  });

  it('guarantees ≥1 survivor for a large group', () => {
    const photos = Array.from({ length: 10 }, (_, i) =>
      makePhoto(`p${i}`, { sharpnessScore: 0.3 })
    );
    const af = toAfPhotos(photos, [group(photos, 'p0')]);
    expect(af.some((p) => p.cls !== 'reject')).toBe(true);
    expect(af.find((p) => p.id === 'p0')!.cls).not.toBe('reject');
  });

  it('still respects a manual reject', () => {
    const a = makePhoto('a', { isRejected: true });
    expect(classifyPhoto(a, 90, { isDuplicate: true, isGroupBest: true })).toBe('reject');
  });
});

describe('AutoFlow suggestion is derived from metrics, not the file id (P0-4)', () => {
  it('returns undefined when there is no analysis', () => {
    expect(buildSuggestion(makePhoto('x', null))).toBeUndefined();
  });

  it('produces the SAME suggestion for different ids with the same analysis', () => {
    const analysis = { sharpnessScore: 0.9, compositionScore: 0.9 };
    const s1 = buildSuggestion(makePhoto('AAAA', { ...analysis }));
    const s2 = buildSuggestion(makePhoto('zzzz9999', { ...analysis }));
    expect(s1).toBe(s2);
    expect(s1).toContain('netteté');
  });

  it('reflects the actual metric (blur)', () => {
    expect(buildSuggestion(makePhoto('x', { isBlurry: true }))).toContain('floue');
  });
});
