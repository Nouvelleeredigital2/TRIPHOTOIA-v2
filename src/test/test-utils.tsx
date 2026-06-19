import React, { ReactElement } from 'react';
import { render, RenderOptions, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, beforeEach, afterEach } from 'vitest';

// Mock the store
export const mockStore = {
  // ── State ─────────────────────────────────────────────────────────────────
  photos: [],
  analysisQueue: [],
  analyzingPhotoIds: new Set<string>(),
  isProcessing: false,
  stopProcessing: false,
  processedCount: 0,
  activeTab: 'ingestion' as 'ingestion' | 'triage' | 'export',
  pendingExportFilterMode: null as 'all' | 'picks-only' | 'favorites-only' | 'min-rating' | null,
  selectedPhotoId: null,
  userTags: {},
  bestPhotoOverrides: {},
  rejectedPhotoIds: new Set<string>(),
  duplicateGroups: [],
  undoStack: [],
  // Collections
  collections: {},
  collectionOrder: [],
  activeCollectionId: 'collection-default',
  activeSmartCollectionId: null,
  // Development / retouch
  developmentSelection: [] as string[],
  retouchSessionPhotoIds: [],
  retouchActivePhotoId: null,
  retouchProcessingIds: new Set<string>(),
  isAutoRetouchComputing: false,
  autoRetouchError: null,

  // ── Actions ───────────────────────────────────────────────────────────────
  addPhotos: vi.fn((newPhotos: unknown[]) => {
    mockStore.photos = [...mockStore.photos, ...newPhotos];
  }),
  setAnalysisQueue: vi.fn(),
  addToAnalysisQueue: vi.fn(),
  removeFromAnalysisQueue: vi.fn(),
  setAnalyzingPhotoIds: vi.fn(),
  addAnalyzingPhotoIds: vi.fn(),
  removeAnalyzingPhotoIds: vi.fn(),
  setIsProcessing: vi.fn(),
  setStopProcessing: vi.fn(),
  setProcessedCount: vi.fn(),
  incrementProcessedCount: vi.fn(),
  setActiveTab: vi.fn((tab: 'ingestion' | 'triage' | 'export') => {
    mockStore.activeTab = tab;
  }),
  setPendingExportFilterMode: vi.fn((mode: 'all' | 'picks-only' | 'favorites-only' | 'min-rating' | null) => {
    mockStore.pendingExportFilterMode = mode;
  }),
  setSelectedPhotoId: vi.fn(),
  updatePhotoAnalysis: vi.fn((id: string, analysis: unknown) => {
    const idx = mockStore.photos.findIndex((p: { id: string }) => p.id === id);
    if (idx !== -1) { (mockStore.photos[idx] as { analysis?: unknown }).analysis = analysis; }
  }),
  updateUserTags: vi.fn(),
  setBestInGroup: vi.fn(),
  toggleRejectPhoto: vi.fn(),
  setDuplicateGroups: vi.fn(),
  addUndoAction: vi.fn(),
  undo: vi.fn(),
  clearAll: vi.fn(() => {
    mockStore.photos = [];
    mockStore.analysisQueue = [];
    mockStore.isProcessing = false;
    mockStore.processedCount = 0;
  }),
  removePhoto: vi.fn(),
  // Flags & rating
  setPhotoRating: vi.fn(),
  togglePhotoPick: vi.fn(),
  togglePhotoReject: vi.fn(),
  unflagPhoto: vi.fn(),
  setColorLabel: vi.fn(),
  // Collections
  createCollection: vi.fn(),
  applyWeddingTemplate: vi.fn(() => []),
  deleteCollection: vi.fn(),
  renameCollection: vi.fn(),
  addPhotosToCollection: vi.fn(),
  removePhotosFromCollection: vi.fn(),
  setActiveCollection: vi.fn(),
  setActiveSmartCollection: vi.fn(),
  // Development
  toggleDevelopmentSelection: vi.fn(),
  clearDevelopmentSelection: vi.fn(),
  setDevelopmentSelection: vi.fn(),
  startRetouchSession: vi.fn(),
  endRetouchSession: vi.fn(),
  setActiveRetouchPhoto: vi.fn(),
  updateRetouchOption: vi.fn(),
  resetRetouchOptions: vi.fn(),
  syncRetouchSettings: vi.fn(),
  getRetouchOptions: vi.fn().mockReturnValue({}),
  getRetouchedPreviewUrl: vi.fn().mockReturnValue(null),
  refreshRetouchPreview: vi.fn(),
  computeAutoRetouchPreset: vi.fn(),
  clearAutoRetouchState: vi.fn(),
};

// Reset mutable mockStore state before each test to prevent cross-test contamination
beforeEach(() => {
  mockStore.photos = [];
  mockStore.analysisQueue = [];
  mockStore.isProcessing = false;
  mockStore.processedCount = 0;
  mockStore.activeTab = 'ingestion';
  mockStore.pendingExportFilterMode = null;
  // Réinitialiser le hash : le routing App (#/<tab>) persiste sinon entre tests jsdom
  // et écraserait l'activeTab fixé programmatiquement par un test.
  if (typeof window !== 'undefined') {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
});

afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
  });
});

// usePhotoStore.getState() is called in App.tsx for imperative mutations
const usePhotoStoreMock = (selector?: (state: typeof mockStore) => unknown) => {
  if (typeof selector === 'function') return selector(mockStore);
  return mockStore;
};
usePhotoStoreMock.getState = () => mockStore;

vi.mock('../store/photoStore', () => ({
  // Support selector pattern usePhotoStore(sel), full store, and static .getState()
  usePhotoStore: usePhotoStoreMock,
}));

// Mock the hooks
vi.mock('../hooks/usePhotoAnalysis', () => ({
  usePhotoAnalysis: () => ({
    isProcessing: false,
    processedCount: 0,
    analyzingPhotoIds: new Set(),
    stopProcessingPhotos: vi.fn(),
  }),
}));

// Mock the services
vi.mock('../services/geminiService', () => ({
  analyzePhotosBatch: vi.fn().mockResolvedValue([]),
}));

// Mock the icon component
vi.mock('../components/IconComponents', () => ({
  LogoIcon: () => <div data-testid="logo">Logo</div>,
}));

// Mock the lazy components
vi.mock('../features/ingestion/IngestionTab', () => ({
  default: () => <div>Ingestion Tab</div>,
}));

vi.mock('../features/triage/TriageTab', () => ({
  default: ({ onOpenAutoFlow }: { onOpenAutoFlow?: (photoIds?: string[]) => void }) => (
    <div>
      Triage Tab
      <button onClick={() => onOpenAutoFlow?.(['visible-1'])}>Open filtered AutoFlow</button>
    </div>
  ),
}));

vi.mock('../features/export/ExportTab', () => ({
  default: () => <div>Export Tab</div>,
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { queryClient = createTestQueryClient(), ...renderOptions }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient };
}

// App lazy-loads its tab components via React.lazy/Suspense. Rendering it and
// asserting synchronously makes the lazy promises resolve outside act(), which
// floods tests with act() warnings. renderApp wraps the render in an async act so
// the Suspense resolution is flushed inside act. Use `await renderApp()` instead
// of `render(<App />)`.
export async function renderApp(options: CustomRenderOptions = {}) {
  const { default: App } = await import('../App');
  let result: ReturnType<typeof renderWithProviders> | undefined;
  await act(async () => {
    result = renderWithProviders(<App />, options);
  });
  return result!;
}

export * from '@testing-library/react';
export { renderWithProviders as render };
