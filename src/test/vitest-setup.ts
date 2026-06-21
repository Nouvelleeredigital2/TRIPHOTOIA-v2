// Polyfills et configuration globale pour les tests Vitest
import { vi } from 'vitest';
import { configure } from '@testing-library/react';

// Le refacto act() rend <App/> via un act async (résolution du Suspense lazy),
// ce qui rallonge légèrement chaque rendu. Sous charge parallèle de la suite
// complète, les findBy/waitFor par défaut (1000ms) peuvent expirer. On élargit
// la fenêtre pour absorber la contention CPU.
configure({ asyncUtilTimeout: 5000 });
// jsdom n'implémente pas IndexedDB — fake-indexeddb fournit une implémentation
// complète et conforme, ce qui évite les erreurs loadFullCatalogue dans les tests.
import 'fake-indexeddb/auto';

// ── window.matchMedia ──────────────────────────────────────────────────────────
// jsdom ne l'implémente pas — requis par useTheme et tout code lisant prefers-color-scheme
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ── URL.createObjectURL / revokeObjectURL ──────────────────────────────────────
// jsdom ne les implémente pas — requis pour les previews de fichiers
if (!window.URL.createObjectURL) {
  Object.defineProperty(window.URL, 'createObjectURL', {
    writable: true,
    value: vi.fn(() => 'blob:mock-url'),
  });
}
if (!window.URL.revokeObjectURL) {
  Object.defineProperty(window.URL, 'revokeObjectURL', {
    writable: true,
    value: vi.fn(),
  });
}

// ── HTMLCanvasElement.getContext ───────────────────────────────────────────────
// jsdom ne supporte pas WebGL/Canvas — mock minimal pour éviter les crashes
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  translate: vi.fn(),
  transform: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  closePath: vi.fn(),
  arc: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  fillText: vi.fn(),
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// ── Web Workers ────────────────────────────────────────────────────────────────
// jsdom n'implémente pas Worker — mock pour les services d'analyse
if (typeof Worker === 'undefined') {
  const WorkerMock = vi.fn().mockImplementation(() => ({
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onmessage: null,
    onerror: null,
  }));
  Object.defineProperty(globalThis, 'Worker', {
    writable: true,
    value: WorkerMock,
  });
}

// ── Blob/File.arrayBuffer ───────────────────────────────────────────────────
// jsdom n'implémente pas Blob.prototype.arrayBuffer — requis par la persistance
// du catalogue (catalogue-persistence lit file.arrayBuffer()).
if (
  typeof Blob !== 'undefined' &&
  typeof Blob.prototype.arrayBuffer !== 'function'
) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// IndexedDB est fourni par `fake-indexeddb/auto` importé en tête de fichier.

// ── ResizeObserver ────────────────────────────────────────────────────────────
if (typeof ResizeObserver === 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  });
}

// ── IntersectionObserver ──────────────────────────────────────────────────────
if (typeof IntersectionObserver === 'undefined') {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  });
}
