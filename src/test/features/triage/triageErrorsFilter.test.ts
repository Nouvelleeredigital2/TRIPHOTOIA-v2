import { describe, it, expect } from 'vitest';
import { filterTriagePhotos } from '../../../features/triage/triageFilters';
import type { Photo } from '../../../types';

const mk = (id: string, analysis: Photo['analysis']): Photo => ({
  id,
  file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: `${id}`,
  analysis,
});

describe("filtre 'errors' (A-19)", () => {
  const photos = [
    mk('ok', { sharpnessScore: 0.8 }),
    mk('err1', { error: 'Analysis failed' }),
    mk('err2', { error: 'No analysis result' }),
  ];
  const base = {
    photos,
    duplicateGroups: [],
    rejectedPhotoIds: new Set<string>(),
    selectedPhotoId: null,
    searchTerm: '',
    sortKey: 'default' as const,
  };

  it('ne renvoie que les photos en erreur', () => {
    const res = filterTriagePhotos({ ...base, activeFilter: 'errors' });
    expect(res.map((p) => p.id).sort()).toEqual(['err1', 'err2']);
  });

  it("exclut les photos en erreur des autres filtres", () => {
    const res = filterTriagePhotos({ ...base, activeFilter: 'all' });
    expect(res.map((p) => p.id)).toEqual(['ok']);
  });
});
