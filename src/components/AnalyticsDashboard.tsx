import React, { useEffect, useState } from 'react';
import {
  BarChart2,
  Camera,
  Star,
  ThumbsUp,
  ThumbsDown,
  Share2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { loadSessionStats, getUserShareLinks } from '../lib/sync-utils';

interface SessionStat {
  session_date: string;
  photos_imported: number;
  photos_rated: number;
  picks_count: number;
  rejects_count: number;
  exports_count: number;
}

interface AnalyticsDashboardProps {
  open: boolean;
  onClose: () => void;
}

export function AnalyticsDashboard({ open, onClose }: AnalyticsDashboardProps) {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<SessionStat[]>([]);
  const [shareCount, setShareCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    setError(null);

    Promise.all([loadSessionStats(user.id, 30), getUserShareLinks(user.id)])
      .then(([sessionStats, shareLinks]) => {
        setStats(sessionStats as SessionStat[]);
        setShareCount(shareLinks.length);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      })
      .finally(() => setLoading(false));
  }, [open, user]);

  if (!open) return null;

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const totalImported = stats.reduce((sum, s) => sum + s.photos_imported, 0);
  const totalPicks = stats.reduce((sum, s) => sum + s.picks_count, 0);
  const totalRejects = stats.reduce((sum, s) => sum + s.rejects_count, 0);
  const totalRated = stats.reduce((sum, s) => sum + s.photos_rated, 0);
  const pickRate =
    totalRated > 0 ? Math.round((totalPicks / totalRated) * 100) : 0;
  const bestSession = stats.reduce(
    (best, s) => (s.photos_imported > (best?.photos_imported ?? 0) ? s : best),
    null as SessionStat | null
  );

  // ── Bar chart : 7 derniers jours ──────────────────────────────────────────────
  const last7 = stats.slice(-7);
  const maxImported = Math.max(...last7.map((s) => s.photos_imported), 1);

  return (
    // Backdrop de modale : fermeture au clic extérieur (le clavier ferme via Escape).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">
              Analytics cloud — 30 derniers jours
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[80vh] space-y-5 overflow-y-auto p-5">
          {!user && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Connectez-vous pour accéder aux statistiques cloud.
            </p>
          )}

          {user && loading && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Chargement des statistiques…
            </p>
          )}

          {user && error && (
            <p className="py-4 text-center text-xs text-destructive">{error}</p>
          )}

          {user && !loading && !error && (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard
                  icon={<Camera className="h-3.5 w-3.5" />}
                  label="Photos importées"
                  value={totalImported}
                  color="text-blue-400"
                />
                <KpiCard
                  icon={<ThumbsUp className="h-3.5 w-3.5" />}
                  label="Picks"
                  value={totalPicks}
                  color="text-green-400"
                />
                <KpiCard
                  icon={<ThumbsDown className="h-3.5 w-3.5" />}
                  label="Rejetées"
                  value={totalRejects}
                  color="text-red-400"
                />
                <KpiCard
                  icon={<Star className="h-3.5 w-3.5" />}
                  label="Taux de sélection"
                  value={`${pickRate}%`}
                  color="text-yellow-400"
                />
              </div>

              {/* Row 2 : best session + share links */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Meilleure session
                  </div>
                  {bestSession ? (
                    <>
                      <div className="text-xl font-semibold">
                        {bestSession.photos_imported}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(bestSession.session_date).toLocaleDateString(
                          'fr-FR'
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">—</div>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Share2 className="h-3.5 w-3.5" />
                    Liens de partage actifs
                  </div>
                  <div className="text-xl font-semibold">{shareCount}</div>
                </div>
              </div>

              {/* Bar chart : 7 derniers jours */}
              {last7.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Photos importées — 7 derniers jours
                  </p>
                  <div className="flex h-24 items-end gap-2">
                    {last7.map((s) => {
                      const pct = Math.round(
                        (s.photos_imported / maxImported) * 100
                      );
                      return (
                        <div
                          key={s.session_date}
                          className="flex flex-1 flex-col items-center gap-1"
                        >
                          <div
                            className="flex w-full items-end justify-center"
                            style={{ height: '72px' }}
                          >
                            <div
                              className="w-full rounded-t bg-primary/70 transition-all"
                              style={{ height: `${Math.max(pct, 2)}%` }}
                              title={`${s.photos_imported} photos`}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(s.session_date).toLocaleDateString(
                              'fr-FR',
                              { day: '2-digit', month: '2-digit' }
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Detail table : last 30 days */}
              {stats.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Détail par session
                  </p>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            Date
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Importées
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Picks
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Rejetées
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...stats].reverse().map((s) => (
                          <tr
                            key={s.session_date}
                            className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                          >
                            <td className="px-3 py-2">
                              {new Date(s.session_date).toLocaleDateString(
                                'fr-FR'
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {s.photos_imported}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-green-500">
                              {s.picks_count}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-red-400">
                              {s.rejects_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {stats.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Aucune session enregistrée. Importez des photos pour démarrer
                  le suivi.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <div
        className={`mb-1 flex items-center gap-1.5 text-xs text-muted-foreground ${color}`}
      >
        {icon}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
