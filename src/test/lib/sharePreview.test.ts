import { describe, it, expect, vi } from 'vitest';
import { buildSharePreview } from '../../lib/sync-utils';

global.URL.createObjectURL = vi.fn(() => 'blob:x');
global.URL.revokeObjectURL = vi.fn();

describe('buildSharePreview (P1-1)', () => {
  it('falls back to the original file when image decoding is unavailable (never throws)', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    // jsdom n'a pas createImageBitmap → repli déterministe sur l'original.
    const out = await buildSharePreview(file);
    expect(out).toBe(file);
  });

  it('falls back instead of throwing when decoding fails', async () => {
    const original = (
      globalThis as { createImageBitmap?: unknown }
    ).createImageBitmap;
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = vi
      .fn()
      .mockRejectedValue(new Error('boom'));
    try {
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      await expect(buildSharePreview(file)).resolves.toBe(file);
    } finally {
      (globalThis as { createImageBitmap?: unknown }).createImageBitmap =
        original;
    }
  });
});
