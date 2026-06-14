import React, { Suspense, lazy, useMemo, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { UserMenu } from './components/auth/UserMenu';
import { ShareView } from './components/ShareView';
import { ShareDialog } from './components/ShareDialog';
import { useAuthStore } from './store/authStore';
import { useCloudSync } from './hooks/useCloudSync';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import { CollectionSidebar } from './components/CollectionSidebar';
import { Onboarding } from './components/Onboarding';
import { usePhotoStore } from './store/photoStore';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { ConfirmationDialog } from './components/ui/confirmation-dialog';
import { PerformanceDebugDialog } from './components/performance/PerformanceDebugDialog';
import { AnalysisReportDialog } from './components/AnalysisReportDialog';
import { BarChart2, Sun, Moon, Trash2, HelpCircle, Menu, Palette, Share2 } from 'lucide-react';
import { useAiErrorNotifications } from './hooks/useAiErrorNotifications';
import { useCataloguePersistence } from './hooks/useCataloguePersistence';
import { clearFullCatalogue } from './lib/catalogue-persistence';
import { useTheme } from './hooks/useTheme';
import { useAccentColor } from './hooks/useAccentColor';
import { PhotoGridSkeleton } from './components/PhotoGridSkeleton';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { Photo } from './types';
import toast from 'react-hot-toast';
import { AutoFlowMode } from './components/autoflow/AutoFlowMode';
import { AutoFlowAnalyzing } from './components/autoflow/AutoFlowAnalyzing';
import { toAfPhotos } from './components/autoflow/afUtils';
import type { AfPhoto } from './components/autoflow/afUtils';
import { useCloudProjectStore } from './store/cloudProjectStore';
import {
  persistCloudAutoFlowDecision,
  persistCloudAutoFlowRating,
  type CloudAutoFlowDecision,
} from './features/cloud-projects/cloudDecisions';

// Lazy load tabs for better performance
const IngestionTab = lazy(() => import('./features/ingestion/IngestionTab'));
const TriageTab = lazy(() => import('./features/triage/TriageTab'));
const ExportTab = lazy(() => import('./features/export/ExportTab'));
// Développement/Retouche : ouvert en overlay plein écran (déclenché par
// startRetouchSession depuis le Triage), pas comme onglet permanent.
const DevelopmentTab = lazy(() => import('./features/development/DevelopmentTab'));

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});


/** Détecte si l'URL est une page de partage (#/share/TOKEN) */
function getShareToken(): string | null {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const match = hash.match(/^#\/share\/([a-f0-9]+)$/);
  return match ? match[1] : null;
}

function App() {
  useAiErrorNotifications();
  useCloudSync();
  const { lastSavedAt } = useCataloguePersistence();

  // Init auth store (subscribe to Supabase session)
  const initAuth = useAuthStore((s) => s._init);
  useEffect(() => { return initAuth(); }, [initAuth]);

  // Share page routing (hash-based, no React Router needed)
  const [shareToken] = useState<string | null>(getShareToken);

  const { theme, toggleTheme } = useTheme();
  const { accentId, setAccentId, options: accentOptions } = useAccentColor();
  const [accentPickerOpen, setAccentPickerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [autoFlowOpen, setAutoFlowOpen] = useState(false);
  const [autoFlowPhotoIds, setAutoFlowPhotoIds] = useState<string[] | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Raccourci global '?' pour la cheat sheet — fonctionne depuis n'importe quel onglet
  useEffect(() => {
    const handleGlobalHelp = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        const inInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable;
        if (!inInput) {
          e.preventDefault();
          setHelpOpen((v) => !v);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalHelp);
    return () => window.removeEventListener('keydown', handleGlobalHelp);
  }, []);

  const {
    activeTab,
    setActiveTab,
    photos,
    isProcessing,
    analyzingPhotoIds,
    setStopProcessing,
    undoStack,
    undo,
    clearAll,
  } = usePhotoStore();

  // A-53/54 : synchroniser l'onglet actif avec le hash de l'URL (deep link + bouton
  // retour navigateur), sans React Router. Préserve la page de partage #/share/:token.
  useEffect(() => {
    if (shareToken) return;
    const TABS = ['ingestion', 'triage', 'export'] as const;
    const applyHash = () => {
      const h = window.location.hash.replace(/^#\//, '');
      if ((TABS as readonly string[]).includes(h)) {
        setActiveTab(h as typeof activeTab);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [shareToken]);

  useEffect(() => {
    if (shareToken) return;
    const TABS = ['ingestion', 'triage', 'export'];
    if (!TABS.includes(activeTab)) return; // 'development' = overlay, pas de route
    const target = `#/${activeTab}`;
    if (window.location.hash !== target) {
      // pushState pour que le bouton retour navigue entre onglets (ne déclenche pas hashchange)
      window.history.pushState(null, '', target);
    }
  }, [activeTab, shareToken]);

  // A-52 : avertir si le catalogue est modifié dans un autre onglet (pas de fusion auto).
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('treephoto');
    const tabId = Math.random().toString(36).slice(2);
    const onSave = () => channel.postMessage({ type: 'catalogue-saved', tabId });
    window.addEventListener('treephoto:catalogue-saved', onSave);
    channel.onmessage = (e) => {
      if (e.data?.type === 'catalogue-saved' && e.data.tabId !== tabId) {
        toast('Catalogue modifié dans un autre onglet — rechargez pour voir les changements.', {
          icon: '🔄',
          id: 'multi-tab',
          duration: 6000,
        });
      }
    };
    return () => {
      window.removeEventListener('treephoto:catalogue-saved', onSave);
      channel.close();
    };
  }, []);

  // Ctrl+Z / Cmd+Z global — Annuler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const target = e.target as HTMLElement;
        const inInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable;
        if (!inInput) {
          e.preventDefault();
          undo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo]);

  // Sélecteurs optimisés pour éviter les boucles infinies
  const collections = usePhotoStore((state) => state.collections);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  // Session de retouche active → overlay Développement plein écran
  const retouchSessionPhotoIds = usePhotoStore((state) => state.retouchSessionPhotoIds);

  // Calculer les valeurs dérivées avec useMemo
  const activeCollection = useMemo(() =>
    collections[activeCollectionId],
    [collections, activeCollectionId]
  );

  const activePhotos = useMemo(() => {
    if (!activeCollection) {
      return photos;
    }
    const photoMap = new Map(photos.map((photo) => [photo.id, photo]));
    return activeCollection.photoIds
      .map((id) => photoMap.get(id))
      .filter((photo): photo is Photo => Boolean(photo));
  }, [activeCollection, photos]);

  // Cache les valeurs calculées pour éviter les boucles infinies
  const activePhotosCount = useMemo(() =>
    activeCollection?.photoIds.length ?? activePhotos.length,
    [activeCollection?.photoIds.length, activePhotos.length]
  );

  const analyzedInActive = useMemo(() => {
    if (!Array.isArray(activePhotos)) {
      return 0;
    }
    return activePhotos.filter((photo) => photo.analysis && !photo.analysis.error).length;
  }, [activePhotos]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'ingestion':
        return <IngestionTab />;
      case 'triage':
        return <TriageTab onOpenAutoFlow={openAutoFlow} />;
      case 'export':
        return <ExportTab />;
      default:
        return null;
    }
  };

  const canUndo = undoStack.length > 0;

  /** AutoFlow: derived AfPhoto[] from store — recomputed when photos or duplicates change */
  const duplicateGroups = usePhotoStore((state) => state.duplicateGroups);
  const afPhotos = useMemo<AfPhoto[]>(
    () => toAfPhotos(photos, duplicateGroups),
    [photos, duplicateGroups]
  );
  const analyzedCount = photos.filter((p) => p.analysis && !p.analysis.error).length;

  const openAutoFlow = (photoIds?: string[]) => {
    setAutoFlowPhotoIds(photoIds && photoIds.length > 0 ? photoIds : null);
    setAutoFlowOpen(true);
  };

  const openExportFromAutoFlow = () => {
    usePhotoStore.getState().setPendingExportFilterMode('picks-only');
    setAutoFlowOpen(false);
    setAutoFlowPhotoIds(null);
    setActiveTab('export');
  };

  /** Apply an AutoFlow mutation back to the store */
  const handleAfMutation = (id: string, changes: Partial<AfPhoto>) => {
    const { togglePhotoPick, togglePhotoReject, setPhotoRating } = usePhotoStore.getState();
    const photo = usePhotoStore.getState().photos.find((p) => p.id === id);
    if (!photo) return;
    if ('isPick' in changes) {
      const wantPick = !!changes.isPick;
      if (wantPick !== !!photo.analysis?.isPick) togglePhotoPick(id);
    }
    if ('isRejected' in changes) {
      const wantRej = !!changes.isRejected;
      if (wantRej !== !!photo.analysis?.isRejected) togglePhotoReject(id);
    }
    if ('rating' in changes && typeof changes.rating === 'number') {
      setPhotoRating(id, changes.rating);
    }
  };

  const handleAfDecision = (
    id: string,
    decision: CloudAutoFlowDecision,
    previous: Partial<AfPhoto>,
  ) => {
    const cloudState = useCloudProjectStore.getState();

    void persistCloudAutoFlowDecision({
      localPhotoId: id,
      decision,
      previous,
      activeProject: cloudState.activeProject,
      getCloudPhotoId: cloudState.getCloudPhotoId,
      onPersisted: (projectId) =>
        queryClient.invalidateQueries({ queryKey: ['cloud-project-photos', projectId] }),
      onRollback: handleAfMutation,
      onError: (message) => toast.error(message),
    });
  };

  const handleAfRating = (id: string, rating: number, previous: Partial<AfPhoto>) => {
    const cloudState = useCloudProjectStore.getState();

    void persistCloudAutoFlowRating({
      localPhotoId: id,
      rating,
      previous,
      activeProject: cloudState.activeProject,
      getCloudPhotoId: cloudState.getCloudPhotoId,
      onPersisted: (projectId) =>
        queryClient.invalidateQueries({ queryKey: ['cloud-project-photos', projectId] }),
      onRollback: handleAfMutation,
      onError: (message) => toast.error(message),
    });
  };

  const globalStats = useMemo(() => {
    const analyzed = photos.filter((p) => p.analysis && !p.analysis.error);
    return {
      picks: analyzed.filter((p) => p.analysis!.isPick).length,
      rejected: analyzed.filter((p) => p.analysis!.isRejected).length,
    };
  }, [photos]);

  if (shareToken) {
    return <ShareView token={shareToken} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <div className="bg-background text-foreground min-h-screen flex font-sans antialiased">
          {/* Sidebar façon Notion */}
          <CollectionSidebar
            mobileOpen={sidebarOpen}
            onMobileClose={() => setSidebarOpen(false)}
          />

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* ── AutoFlow v2 TopBar ── */}
            <header style={{
              // A-58 : chrome volontairement sombre (marque AutoFlow v2), cohérent dans
              // les deux thèmes — le texte clair reste lisible. Le contenu principal, lui,
              // respecte clair/sombre. (Conversion complète = refonte graphique, hors scope.)
              background: 'rgba(7,7,12,0.92)',
              backdropFilter: 'blur(14px)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              position: 'sticky', top: 0, zIndex: 30,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              {/* Row 1: Logo + Stepper + Actions */}
              <div style={{
                padding: '10px 20px', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                {/* Left: Hamburger + Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Hamburger — mobile only */}
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 w-8 p-0 lg:hidden"
                    onClick={() => setSidebarOpen(true)}
                    title="Ouvrir les collections"
                  >
                    <Menu className="w-5 h-5" />
                  </Button>

                  {/* v2 Logo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} data-testid="logo">
                    <div style={{
                      width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                      background: 'linear-gradient(135deg, #f59e0b, #fca5a5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#000" />
                      </svg>
                    </div>
                    <div>
                      <div style={{
                        fontSize: 13, fontWeight: 800, letterSpacing: '0.04em',
                        color: '#f0f0f7', lineHeight: 1,
                      }}>Tree Photo IA</div>
                      <div style={{
                        fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
                        color: '#f59e0b', textTransform: 'uppercase', lineHeight: 1.4,
                      }}>AUTOFLOW v2</div>
                    </div>
                  </div>
                </div>

                {/* Center: 3-step stepper */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {[
                    { key: 'ingestion' as const, label: 'Import', ariaLabel: 'Ingestion', n: 1 },
                    { key: 'triage'    as const, label: 'Triage', ariaLabel: 'Triage', n: 2 },
                    { key: 'export'    as const, label: 'Export', ariaLabel: 'Exportation', n: 3 },
                  ].map((step, i, arr) => {
                    const isActive = activeTab === step.key;
                    const isPast = arr.findIndex((s) => s.key === activeTab) > i;
                    return (
                      <React.Fragment key={step.key}>
                        <button
                          aria-label={step.ariaLabel}
                          onClick={() => setActiveTab(step.key)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 12px', borderRadius: 20,
                            cursor: 'pointer', outline: 'none', transition: 'all 0.15s',
                            background: isActive
                              ? 'rgba(245,158,11,0.12)'
                              : 'transparent',
                            border: isActive
                              ? '1px solid rgba(245,158,11,0.3)'
                              : '1px solid transparent',
                          }}
                        >
                          <span style={{
                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700,
                            background: isActive
                              ? '#f59e0b'
                              : isPast
                                ? 'rgba(134,239,172,0.8)'
                                : 'rgba(255,255,255,0.08)',
                            color: (isActive || isPast) ? '#000' : 'rgba(255,255,255,0.3)',
                          }}>{isPast ? '✓' : step.n}</span>
                          <span style={{
                            fontSize: 12, fontWeight: isActive ? 700 : 500,
                            color: isActive
                              ? '#f59e0b'
                              : isPast
                                ? 'rgba(134,239,172,0.8)'
                                : 'rgba(255,255,255,0.3)',
                          }}>{step.label}</span>
                        </button>
                        {i < arr.length - 1 && (
                          <div style={{
                            width: 20, height: 1,
                            background: isPast
                              ? 'rgba(134,239,172,0.4)'
                              : 'rgba(255,255,255,0.08)',
                          }} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Right: live counters + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Live counters — shown when photos exist */}
                  {photos.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.5)',
                      }}>{photos.length} photos</div>
                      {globalStats.picks > 0 && (
                        <div style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: 'rgba(134,239,172,0.08)', border: '1px solid rgba(134,239,172,0.2)',
                          color: 'var(--af-pick)',
                        }}>{globalStats.picks} picks</div>
                      )}
                      {globalStats.rejected > 0 && (
                        <div style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: 'rgba(252,165,165,0.08)', border: '1px solid rgba(252,165,165,0.2)',
                          color: 'var(--af-reject)',
                        }}>{globalStats.rejected} rejetées</div>
                      )}
                    </div>
                  )}

                  {/* ⚡ AutoFlow CTA */}
                  {analyzedCount > 0 && (
                    <button
                      onClick={() => openAutoFlow()}
                      title="Ouvrir AutoFlow v2"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(252,165,165,0.1))',
                        border: '1px solid rgba(245,158,11,0.35)',
                        fontSize: 12, fontWeight: 700, color: '#f59e0b',
                        outline: 'none', transition: 'all 0.15s',
                      }}
                    >
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="#f59e0b">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                      AutoFlow
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        color: 'rgba(245,158,11,0.6)',
                      }}>{analyzedCount}</span>
                    </button>
                  )}

                  {/* Accent picker */}
                  <div className="relative">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                      onClick={() => setAccentPickerOpen((v) => !v)} title="Couleur d'accent">
                      <Palette className="w-4 h-4" />
                    </Button>
                    {accentPickerOpen && (
                      <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border/60 rounded-xl shadow-xl p-3 flex flex-col gap-2 min-w-[160px]"
                        onMouseLeave={() => setAccentPickerOpen(false)}>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Couleur d'accent</p>
                        {accentOptions.map((opt) => (
                          <button key={opt.id}
                            onClick={() => { setAccentId(opt.id); setAccentPickerOpen(false); }}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-muted ${accentId === opt.id ? 'bg-muted font-semibold' : ''}`}>
                            <span className="w-4 h-4 rounded-full shrink-0 border border-white/20"
                              style={{ backgroundColor: opt.hex }} />
                            {opt.label}
                            {accentId === opt.id && <span className="ml-auto text-xs">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Theme toggle */}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={toggleTheme}
                    title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}>
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </Button>

                  {/* Help */}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                    onClick={() => setHelpOpen(true)} title="Raccourcis clavier (?)">
                    <HelpCircle className="w-4 h-4" />
                  </Button>

                  {/* Partager */}
                  {photos.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                      onClick={() => setShareDialogOpen(true)} title="Partager avec un client">
                      <Share2 className="w-4 h-4" />
                    </Button>
                  )}

                  {/* User menu / cloud */}
                  <UserMenu />

                  <PerformanceDebugDialog />

                  {/* Undo */}
                  {canUndo && (
                    <Button variant="ghost" size="sm" onClick={undo}
                      className="text-sm font-medium gap-1"
                      title={`${undoStack.length} action${undoStack.length > 1 ? 's' : ''} annulable${undoStack.length > 1 ? 's' : ''}`}>
                      Annuler
                      {undoStack.length > 1 && (
                        <Badge variant="secondary" className="text-xs h-4 px-1">{undoStack.length}</Badge>
                      )}
                    </Button>
                  )}

                  {/* Clear all */}
                  {photos.length > 0 && !isProcessing && (
                    <Button variant="ghost" size="sm"
                      onClick={() => setClearConfirmOpen(true)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      title="Effacer tout le catalogue">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}

                  {/* Stop processing */}
                  {isProcessing && (
                    <Button variant="destructive" size="sm"
                      onClick={() => setStopProcessing(true)}
                      className="text-sm font-medium">
                      Arrêter
                    </Button>
                  )}
                </div>
              </div>

              {/* Row 2: Collection indicator (optional) */}
              {activeCollection && (
                <div style={{
                  padding: '0 20px 8px',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Collection :</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>
                    {activeCollection.name}
                  </span>
                  <span style={{
                    padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)',
                  }}>{activeCollection.photoIds.length}</span>
                </div>
              )}
            </header>

            <main className="flex-grow px-6 py-8 overflow-hidden">
              {/* PAS d'AnimatePresence ici. Dans ce setup (React 19 + StrictMode +
                  framer-motion v11), le cycle exit d'AnimatePresence ne se termine
                  jamais (onExitComplete ne se déclenche pas) : avec mode="wait" le
                  changement d'onglet se fige, sans mode les motion.div s'accumulent.
                  Un motion.div keyé SANS AnimatePresence laisse React démonter/monter
                  proprement à chaque changement de clé ; l'animation d'entrée joue,
                  aucun suivi d'exit n'est requis. Suspense par onglet à l'intérieur. */}
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="h-full"
              >
                <Suspense
                  fallback={
                    <div className="pt-4">
                      <PhotoGridSkeleton count={12} label="Chargement…" />
                    </div>
                  }
                >
                  {renderTabContent()}
                </Suspense>
              </motion.div>
            </main>

            {/* Status Bar minimaliste */}
            <footer className="bg-card/50 backdrop-blur-sm border-t border-border/50 px-6 py-4">
            <div className="container mx-auto flex items-center justify-between text-sm">
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">{activePhotosCount}</span>
                  photo{activePhotosCount > 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">{analyzedInActive}</span>
                  analysée{analyzedInActive > 1 ? 's' : ''}
                </span>
                {globalStats.picks > 0 && (
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    🎯 {globalStats.picks}
                  </span>
                )}
                {globalStats.rejected > 0 && (
                  <span className="flex items-center gap-1 text-red-500 font-medium">
                    ❌ {globalStats.rejected}
                  </span>
                )}
                {isProcessing && (
                  <span className="flex items-center gap-2 text-primary">
                    <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    {analyzingPhotoIds.size} en cours
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Save indicator */}
                {lastSavedAt && (
                  <span
                    className="text-xs text-muted-foreground/60 flex items-center gap-1"
                    title={`Dernière sauvegarde : ${lastSavedAt.toLocaleTimeString('fr-FR')}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Sauvegardé
                  </span>
                )}

                {photos.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setReportOpen(true)}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    Rapport
                  </Button>
                )}
                <span className="text-muted-foreground font-medium">
                  {activeTab === 'ingestion' && 'Importez vos photos'}
                  {activeTab === 'triage' && 'Organisez votre sélection'}
                  {activeTab === 'export' && 'Exportez vos photos'}
                </span>
              </div>
            </div>
            </footer>
          </div>
        </div>
        <ToastProvider />
        <Onboarding />
        <ShareDialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} />
        <AnalysisReportDialog open={reportOpen} onOpenChange={setReportOpen} />
        <KeyboardShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
        <ConfirmationDialog
          open={clearConfirmOpen}
          onOpenChange={setClearConfirmOpen}
          onConfirm={async () => {
            clearAll();
            const ok = await clearFullCatalogue();
            if (ok) {
              toast.success('Catalogue effacé');
            } else {
              toast.error("Échec de l'effacement du stockage local. Vos données peuvent réapparaître au rechargement — réessayez.");
            }
          }}
          title="Effacer tout le catalogue ?"
          description={`Cette action supprimera définitivement les ${photos.length} photo${photos.length > 1 ? 's' : ''} et toutes les données associées (analyses, collections, tags). Irréversible.`}
          confirmText="Tout effacer"
          cancelText="Annuler"
          variant="destructive"
        />

        {/* AutoFlow analyzing overlay — shown during AI processing */}
        {isProcessing && photos.length > 0 && !autoFlowOpen && (
          <AutoFlowAnalyzing
            total={photos.length}
            processed={analyzedCount}
          />
        )}

        {/* AutoFlow v2 overlay */}
        {autoFlowOpen && (
          <AutoFlowMode
            photos={afPhotos}
            initialPhotoIds={autoFlowPhotoIds ?? undefined}
            onMutation={handleAfMutation}
            onDecision={handleAfDecision}
            onRating={handleAfRating}
            onExportPicks={openExportFromAutoFlow}
            onClose={() => {
              setAutoFlowOpen(false);
              setAutoFlowPhotoIds(null);
            }}
          />
        )}

        {/* Overlay Développement / Retouche — déclenché par startRetouchSession
            (bouton « Développer » du Triage). Se ferme via endRetouchSession,
            qui vide retouchSessionPhotoIds et démonte l'overlay. */}
        {retouchSessionPhotoIds.length > 0 && (
          <div className="fixed inset-0 z-[200] overflow-auto bg-background p-6">
            <Suspense
              fallback={
                <div className="pt-4">
                  <PhotoGridSkeleton count={8} label="Chargement de l'atelier…" />
                </div>
              }
            >
              <DevelopmentTab />
            </Suspense>
          </div>
        )}
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;

