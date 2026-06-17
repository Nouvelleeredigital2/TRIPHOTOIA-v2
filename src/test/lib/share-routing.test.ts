import { describe, it, expect } from 'vitest';
import { parseShareToken } from '@/lib/share-routing';

// P2 : prise en compte de `#/share/<token>` (routing hash sans rechargement).

describe('parseShareToken (P2 — routing hash partage)', () => {
  it('extrait un token hexadécimal valide', () => {
    expect(parseShareToken('#/share/a1b2c3d4e5f6')).toBe('a1b2c3d4e5f6');
  });

  it('retourne null hors d’une route de partage', () => {
    expect(parseShareToken('')).toBeNull();
    expect(parseShareToken('#/triage')).toBeNull();
    expect(parseShareToken('#/share/')).toBeNull();
  });

  it('rejette un token non hexadécimal ou avec segment surnuméraire', () => {
    expect(parseShareToken('#/share/XYZ')).toBeNull();
    expect(parseShareToken('#/share/a1b2/extra')).toBeNull();
    expect(parseShareToken('#/share/a1b2?x=1')).toBeNull();
  });
});
