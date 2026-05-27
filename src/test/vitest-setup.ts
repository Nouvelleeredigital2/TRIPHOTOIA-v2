// Polyfills et configuration globale pour les tests Vitest
import { vi } from 'vitest';

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

// ── IndexedDB ─────────────────────────────────────────────────────────────────
// jsdom a une implémentation partielle — on s'assure qu'elle existe
if (!globalThis.indexedDB) {
  Object.defineProperty(globalThis, 'indexedDB', {
    writable: true,
    value: undefined,
  });
}

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
