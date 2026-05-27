import React, { useState, useRef, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, LogOut, User, BarChart2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { isSupabaseConfigured } from '../../lib/supabase';
import { AuthModal } from './AuthModal';
import { AnalyticsDashboard } from '../AnalyticsDashboard';

const SYNC_ICONS = {
  idle:    { icon: Cloud,      color: 'text-muted-foreground', title: 'Sync cloud' },
  syncing: { icon: RefreshCw, color: 'text-primary animate-spin', title: 'Synchronisation…' },
  synced:  { icon: Cloud,      color: 'text-green-500', title: 'Synchronisé' },
  error:   { icon: CloudOff,   color: 'text-red-500', title: 'Erreur de sync' },
  offline: { icon: CloudOff,   color: 'text-muted-foreground', title: 'Hors ligne' },
};

export function UserMenu() {
  const { user, syncStatus, signOut, loading } = useAuthStore();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 hover:border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
          title={isSupabaseConfigured ? 'Se connecter au cloud' : 'Cloud (non configuré)'}
        >
          <Cloud className="w-3.5 h-3.5" />
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
          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
          title={user.email ?? ''}
        >
          {/* Sync indicator */}
          <span title={SYNC_ICONS[syncStatus].title} aria-label={SYNC_ICONS[syncStatus].title}>
            <SyncIcon className={`w-3.5 h-3.5 ${SYNC_ICONS[syncStatus].color}`} />
          </span>
          {/* Avatar */}
          <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
            {initials}
          </div>
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[200px]">
            {/* User info */}
            <div className="px-3 py-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <Cloud className="w-3 h-3" />
                {SYNC_ICONS[syncStatus].title}
              </div>
            </div>

            {/* Analytics */}
            <button
              onClick={() => { setMenuOpen(false); setAnalyticsOpen(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
            >
              <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
              Tableau de bord analytics
            </button>

            {/* Déconnexion */}
            <button
              onClick={() => { setMenuOpen(false); signOut(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left text-red-500"
            >
              <LogOut className="w-3.5 h-3.5" />
              Se déconnecter
            </button>
          </div>
        )}
      </div>

      <AnalyticsDashboard open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
    </>
  );
}
