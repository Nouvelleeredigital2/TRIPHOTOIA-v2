import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  performanceTracker,
  PerformanceMetric,
} from '../../lib/performance-tracker';
import toast from 'react-hot-toast';

const METRICS_REFRESH_INTERVAL = 1000; // ms
const MAX_RECENT_METRICS = 50;

const formatDuration = (duration?: number) =>
  typeof duration === 'number' ? `${duration.toFixed(2)} ms` : '—';

const formatSuccessRate = (value: number) => `${(value * 100).toFixed(1)} %`;

const formatTimestamp = (performanceTime: number) =>
  `${performanceTime.toFixed(0)} ms`;

export const PerformanceDebugDialog: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [activeOperations, setActiveOperations] = useState<PerformanceMetric[]>(
    []
  );

  // `metrics` est un déclencheur de recalcul volontaire : il est mis à jour à
  // chaque tick de polling pour rafraîchir les stats (lues depuis le tracker).
  /* eslint-disable react-hooks/exhaustive-deps */
  const stats = useMemo(
    () => performanceTracker.getPerformanceStats(),
    [metrics]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const updateSnapshots = () => {
      const snapshot = performanceTracker.getMetricsSnapshot();
      const activeSnapshot = performanceTracker.getActiveOperationsSnapshot();
      setMetrics(snapshot.slice(-MAX_RECENT_METRICS).reverse());
      setActiveOperations(activeSnapshot);
    };

    updateSnapshots();
    const intervalId = window.setInterval(
      updateSnapshots,
      METRICS_REFRESH_INTERVAL
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open]);

  const handleExportJson = useCallback(async () => {
    try {
      const payload = {
        generatedAt: new Date().toISOString(),
        stats,
        metrics: performanceTracker.getMetricsSnapshot(),
        activeOperations: performanceTracker.getActiveOperationsSnapshot(),
      };
      const json = JSON.stringify(payload, null, 2);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        toast.success('Métriques copiées dans le presse-papiers');
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `performance-metrics-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.success('Fichier JSON exporté');
      }
    } catch (error) {
      console.error('[PerformanceDebugDialog] Export JSON failed', error);
      toast.error("Impossible d'exporter les métriques");
    }
  }, [stats]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Debug Perf
          <Badge variant="secondary">Bêta</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Performance Tracker</DialogTitle>
          <DialogDescription>
            Statistiques temps réel sur les opérations critiques (analyse,
            retouche, import, etc.).
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-3 overflow-y-auto pr-1">
          <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/30 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Synthèse
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <StatCard
                label="Opérations (5 min)"
                value={stats.totalOperations}
              />
              <StatCard
                label="Durée moyenne"
                value={formatDuration(stats.averageDuration)}
              />
              <StatCard
                label="Taux de réussite"
                value={formatSuccessRate(stats.successRate)}
              />
              <StatCard
                label="Opérations actives"
                value={activeOperations.length}
              />
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Opérations par type
              </h3>
              <span className="text-xs text-muted-foreground">
                Glissant 5 minutes
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto rounded border border-border/40 bg-background/80">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-background/95">
                  <tr className="text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Opération</th>
                    <th className="px-3 py-2 font-medium">Compteur</th>
                    <th className="px-3 py-2 font-medium">Durée moy.</th>
                    <th className="px-3 py-2 font-medium">Réussite</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.operationsByType).map(
                    ([operation, data]) => (
                      <tr key={operation} className="border-t border-border/40">
                        <td className="px-3 py-2 font-medium text-foreground">
                          {operation}
                        </td>
                        <td className="px-3 py-2">{data.count}</td>
                        <td className="px-3 py-2">
                          {formatDuration(data.avgDuration)}
                        </td>
                        <td className="px-3 py-2">
                          {formatSuccessRate(data.successRate)}
                        </td>
                      </tr>
                    )
                  )}
                  {Object.keys(stats.operationsByType).length === 0 && (
                    <tr>
                      <td
                        className="px-3 py-3 text-center text-muted-foreground"
                        colSpan={4}
                      >
                        Aucune donnée pour le moment
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/10 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Opérations actives
            </h3>
            <div className="grid gap-2 text-xs">
              {activeOperations.length === 0 && (
                <p className="rounded border border-border/40 bg-background/70 p-3 text-muted-foreground">
                  Aucune opération en cours.
                </p>
              )}
              {activeOperations.map((operation) => (
                <div
                  key={operation.id}
                  className="rounded border border-border/40 bg-background/70 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {operation.operation}
                    </span>
                    <Badge variant="secondary">En cours</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Début</span>
                    <span>{formatTimestamp(operation.startTime)}</span>
                    {operation.metadata && (
                      <span className="text-muted-foreground">Metadata</span>
                    )}
                    {operation.metadata && (
                      <pre className="col-span-2 overflow-x-auto rounded bg-muted/30 p-2 text-[10px] leading-tight">
                        {JSON.stringify(operation.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Dernières opérations
              </h3>
              <span className="text-xs text-muted-foreground">
                {metrics.length} affichées
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto rounded border border-border/40 bg-background/80">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-background/95">
                  <tr className="text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Opération</th>
                    <th className="px-3 py-2 font-medium">Début</th>
                    <th className="px-3 py-2 font-medium">Durée</th>
                    <th className="px-3 py-2 font-medium">Statut</th>
                    <th className="px-3 py-2 font-medium">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((metric) => (
                    <tr key={metric.id} className="border-t border-border/40">
                      <td className="px-3 py-2 font-medium text-foreground">
                        {metric.operation}
                      </td>
                      <td className="px-3 py-2">
                        {formatTimestamp(metric.startTime)}
                      </td>
                      <td className="px-3 py-2">
                        {formatDuration(metric.duration)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={metric.success ? 'secondary' : 'destructive'}
                        >
                          {metric.success ? 'Succès' : 'Erreur'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {metric.metadata ? (
                          <details>
                            <summary className="cursor-pointer text-muted-foreground">
                              Voir
                            </summary>
                            <pre className="mt-2 max-h-32 overflow-x-auto overflow-y-auto rounded bg-muted/30 p-2 text-[10px] leading-tight">
                              {JSON.stringify(metric.metadata, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {metrics.length === 0 && (
                    <tr>
                      <td
                        className="px-3 py-3 text-center text-muted-foreground"
                        colSpan={5}
                      >
                        Aucune mesure disponible pour le moment
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <DialogFooter className="pt-4">
          <Button variant="outline" size="sm" onClick={handleExportJson}>
            Exporter en JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type StatCardProps = {
  label: string;
  value: React.ReactNode;
};

const StatCard: React.FC<StatCardProps> = ({ label, value }) => (
  <div className="rounded border border-border/40 bg-background/80 p-3 shadow-sm">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
  </div>
);
