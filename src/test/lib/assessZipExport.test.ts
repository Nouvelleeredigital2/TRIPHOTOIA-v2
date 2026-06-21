import { describe, it, expect } from 'vitest';
import { assessZipExport } from '../../lib/export-utils';

const photos = (count: number, sizeEach: number) =>
  Array.from({ length: count }, () => ({ file: { size: sizeEach } }));

describe('assessZipExport (P1-8)', () => {
  it('returns ok (no message) for small exports', () => {
    const a = assessZipExport(photos(10, 5 * 1024 * 1024)); // 10 × 5 Mo
    expect(a.level).toBe('ok');
    expect(a.message).toBeUndefined();
    expect(a.count).toBe(10);
  });

  it('warns past ~1 Go', () => {
    const a = assessZipExport(photos(20, 80 * 1024 * 1024)); // ~1.56 Go
    expect(a.level).toBe('warn');
    expect(a.message).toContain('Continuer');
  });

  it('warns past 300 photos even if light', () => {
    const a = assessZipExport(photos(301, 1024));
    expect(a.level).toBe('warn');
  });

  it('flags high past 2 Go (recommends folder export)', () => {
    const a = assessZipExport(photos(50, 50 * 1024 * 1024)); // ~2.44 Go
    expect(a.level).toBe('high');
    expect(a.message).toMatch(/dossier/i);
  });

  it('tolerates missing file sizes', () => {
    const a = assessZipExport([{ file: {} }, {}]);
    expect(a.totalBytes).toBe(0);
    expect(a.level).toBe('ok');
  });
});
