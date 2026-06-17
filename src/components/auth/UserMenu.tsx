import React, { useState, useRef, useEffect } from 'react';
import {
  Cloud,
  CloudOff,
  RefreshCw,
  LogOut,
  User,
  BarChart2,
  FolderKanban,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { isSupabaseConfigured } from '../../lib/supabase';
import { AuthModal } from './AuthModal';
import { AnalyticsDashboard } from '../AnalyticsDashboard';
import { CloudProjectsDashboard } from '../../features/cloud-projects/CloudProjectsDashboard';
import { useCloudProjectStore } from '../../store/cloudProjectStore';
import { usePhotoStore } from '../../store/photoStore';
import { clearFullCatalogue } from '../../lib/catalogue-persistence';
import { Button } from '../ui/button';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

const SYNC_ICONS = {
  idle: { icon: Cloud, color: 'text-muted-foreground', title: 'Sync cloud' },
  syncing: {
    icon: RefreshCw,
    color: 'text-primary animate-spin',
    title: 'Synchronisation…',
  },
  synced: { icon: Cloud, color: 'text-green-500', title: 'Synchronisé' },
  error: { icon: CloudOff, color: 'text-red-500', title: 'Erreur de sync' },
  offline: {
    icon: CloudOff,
    color: 'text-muted-foreground',
    title: 'Hors ligne',
  },
};

export function UserMenu() {
  const { user, syncStatus, signOut, loading } = useAuthStore();
  const activeCloudProject = useCloudProjectStore(
    (state) => state.activeProject
  );
  const clearActiveProject = useCloudProjectStore(
    (state) => state.clearActiveProject
  );
  const clearLocalCatalogue = usePhotoStore((state) => state.clearAll);
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // A-51 : déconnexion simple vs déconnexion + effacement des données locales
  // (catalogue, collections, IDB) — important sur un poste partagé.
  const handleLogout = async (clearLocal: boolean) => {
    setLoggingOut(true);
    try {
      if (clearLocal) {
        clearLocalCatalogue();
        await clearFullCatalogue();
        clearActiveProject();
      }
      await signOut();
      toast.success(
        clearLocal ? 'Déconnecté — données locales effacées.' : 'Déconnecté.'
      );
    } catch {
      toast.error('Échec de la déconnexion.');
    } finally {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
  };

  // Fermer le menu en cliquant à l'extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (loading) return null;

  const SyncIcon = SYNC_ICONS[syncStatus].icon;

  if (!user) {
    return (
      <>
        <button
          onClick={() => setAuthOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-border hover:text-foreground"
          title={
            isSupabaseConfigured
              ? 'Se connecter au cloud'
              : 'Cloud (non configuré)'
          }
        >
          <Cloud className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Cloud</span>
        </button>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </>
    );
  }

  // Utilisateur connecté
  const initials = user.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/5"
          title={user.email ?? ''}
        >
          {/* Sync indicator */}
          <span
            title={SYNC_ICONS[syncStatus].title}
            aria-label={SYNC_ICONS[syncStatus].title}
          >
            <SyncIcon
              className={`h-3.5 w-3.5 ${SYNC_ICONS[syncStatus].color}`}
            />
          </span>
          {/* Avatar */}
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-[10px] font-bold text-primary">
            {initials}
          </div>
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 min-w-[200px] rounded-xl border border-border bg-card py-1 shadow-xl">
            {/* User info */}
            <div className="border-b border-border/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/60">
                <Cloud className="h-3 w-3" />
                {activeCloudProject
                  ? activeCloudProject.name
                  : SYNC_ICONS[syncStatus].title}
              </div>
            </div>

            {/* Analytics */}
            <button
              onClick={() => {
                setMenuOpen(false);
                setProjectsOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
            >
              <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
              Projets cloud
            </button>

            <button
              onClick={() => {
                setMenuOpen(false);
                setAnalyticsOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
            >
              <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
              Tableau de bord analytics
            </button>

            {/* Déconnexion */}
            <button
              onClick={() => {
                setMenuOpen(false);
                setLogoutOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-500 transition-colors hover:bg-muted"
            >
              <LogOut className="h-3.5 w-3.5" />
              Se déconnecter
            </button>
          </div>
        )}
      </div>

      <Dialog open={projectsOpen} onOpenChange={setProjectsOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Projets cloud</DialogTitle>
            <DialogDescription>
              Créez ou rouvrez un projet Supabase sans quitter le mode local.
            </DialogDescription>
          </DialogHeader>
          <CloudProjectsDashboard userId={user.id} />
        </DialogContent>
      </Dialog>
      <AnalyticsDashboard
        open={analyticsOpen}
        onClose={() => setAnalyticsOpen(false)}
      />

      <Dialog
        open={logoutOpen}
        onOpenChange={(o) => {
          if (!loggingOut) setLogoutOpen(o);
        }}
      >
        <DialogContent description="Choisissez le type de déconnexion.">
          <DialogHeader>
            <DialogTitle>Se déconnecter</DialogTitle>
            <DialogDescription>
              Vos photos et métadonnées locales restent sur cet appareil après
              déconnexion. Sur un poste partagé, vous pouvez aussi les effacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
            <Button
              variant="outline"
              disabled={loggingOut}
              onClick={() => handleLogout(false)}
            >
              Se déconnecter seulement
            </Button>
            <Button
              variant="destructive"
              disabled={loggingOut}
              onClick={() => handleLogout(true)}
            >
              Se déconnecter et effacer les données locales
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
