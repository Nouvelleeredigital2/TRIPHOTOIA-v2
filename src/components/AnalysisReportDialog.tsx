import React, { useMemo } from 'react';
import {
  FileJson,
  Printer,
  TrendingUp,
  Images,
  Flag,
  Copy,
  Circle,
  PieChart,
} from 'lucide-react';
import { COLOR_LABEL_META, COLOR_LABEL_KEYS } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { usePhotoStore } from '../store/photoStore';
import {
  buildReport,
  downloadReportJSON,
  printReportHTML,
} from '../lib/report-utils';
import toast from 'react-hot-toast';

// ── Donut chart SVG ──────────────────────────────────────────────────────────

interface DonutSlice {
  value: number;
  color: string;
  label: string;
}

function DonutChart({
  slices,
  size = 120,
}: {
  slices: DonutSlice[];
  size?: number;
}) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return null;
  const r = 38;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const paths = slices.map((sl) => {
    const pct = sl.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const el = (
      <circle
        key={sl.label}
        r={r}
        cx={cx}
        cy={cy}
        fill="none"
        stroke={sl.color}
        strokeWidth={18}
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-offset}
        style={{
          transform: 'rotate(-90deg)',
          transformOrigin: `${cx}px ${cy}px`,
        }}
      />
    );
    offset += dash;
    return el;
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0">
        <circle
          r={r}
          cx={cx}
          cy={cy}
          fill="none"
          stroke="currentColor"
          strokeWidth={18}
          className="text-muted/30"
        />
        {paths}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-foreground text-xs font-bold"
          fontSize={18}
          fontWeight="700"
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={10}
        >
          photos
        </text>
      </svg>
      <div className="space-y-1.5">
        {slices
          .filter((sl) => sl.value > 0)
          .map((sl) => (
            <div key={sl.label} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: sl.color }}
              />
              <span className="text-muted-foreground">{sl.label}</span>
              <span className="ml-auto pl-4 font-semibold">{sl.value}</span>
              <span className="w-8 text-muted-foreground">
                ({Math.round((sl.value / total) * 100)}%)
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Mini bar-chart ────────────────────────────────────────────────────────────

function MiniBar({
  value,
  max,
  color = 'bg-primary',
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-muted/30 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={`text-3xl font-bold ${color ?? 'text-foreground'}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ── Dialog ───────────────────────────────────────────────────────────────────

interface AnalysisReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnalysisReportDialog({
  open,
  onOpenChange,
}: AnalysisReportDialogProps) {
  const photos = usePhotoStore((state) => state.photos);
  const duplicateGroups = usePhotoStore((state) => state.duplicateGroups);
  const collections = usePhotoStore((state) => state.collections);

  const report = useMemo(
    () => buildReport(photos, duplicateGroups, collections),
    [photos, duplicateGroups, collections]
  );

  const { summary, quality, flags, duplicates, tags, colorLabels, fileStats } =
    report;

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast.success('JSON copié dans le presse-papier');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        description="Rapport détaillé de l'analyse qualité des photos."
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-xl font-bold">
              Rapport d'analyse
            </DialogTitle>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={handleCopyJSON}
              >
                <Copy className="h-3.5 w-3.5" />
                Copier JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => downloadReportJSON(report)}
              >
                <FileJson className="h-3.5 w-3.5" />
                JSON
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => printReportHTML(report)}
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimer / PDF
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Généré le {new Date(report.generatedAt).toLocaleString('fr-FR')}
          </p>
        </DialogHeader>

        <div className="mt-2 space-y-6">
          {/* ── Résumé ── */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Images className="h-4 w-4" /> Résumé
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Total" value={summary.total} />
              <StatCard
                label="Analysées"
                value={summary.analyzed}
                color="text-green-600"
              />
              {summary.withErrors > 0 && (
                <StatCard
                  label="Erreurs"
                  value={summary.withErrors}
                  color="text-red-500"
                />
              )}
              {summary.pending > 0 && (
                <StatCard
                  label="En attente"
                  value={summary.pending}
                  color="text-amber-500"
                />
              )}
            </div>
          </section>

          {/* ── Répartition flags (donut) ── */}
          {summary.analyzed > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <PieChart className="h-4 w-4" /> Répartition
              </h3>
              <div className="rounded-xl border border-border/40 bg-muted/30 p-4">
                <DonutChart
                  slices={[
                    { label: 'Picks 🎯', value: flags.picks, color: '#22c55e' },
                    {
                      label: 'Rejetées ❌',
                      value: flags.rejected,
                      color: '#ef4444',
                    },
                    {
                      label: 'Non flaggées',
                      value: flags.unflagged,
                      color: '#94a3b8',
                    },
                  ]}
                />
              </div>
            </section>
          )}

          {/* ── Qualité ── */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Qualité
            </h3>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                label="Netteté moy."
                value={`${Math.round(quality.averageSharpness * 100)}%`}
              />
              <StatCard
                label="Floues"
                value={quality.blurry}
                color={
                  quality.blurry > 0 ? 'text-amber-500' : 'text-foreground'
                }
              />
              <StatCard label="Note moy." value={`${quality.averageRating}★`} />
            </div>

            {/* Distribution des notes */}
            <div className="space-y-2 rounded-xl border border-border/40 bg-muted/30 p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                Distribution des notes
              </p>
              {[5, 4, 3, 2, 1, 0].map((r) => {
                const count = quality.ratingDistribution[r] ?? 0;
                return (
                  <div key={r} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
                      {r === 0 ? 'Sans' : `${r}★`}
                    </span>
                    <MiniBar value={count} max={summary.analyzed} />
                    <span className="w-8 shrink-0 text-right text-xs font-medium">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Flags & Doublons ── */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Flag className="h-4 w-4" /> Flags & Doublons
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Picks"
                value={flags.picks}
                color="text-green-600"
                sub="🎯"
              />
              <StatCard
                label="Rejetées"
                value={flags.rejected}
                color="text-red-500"
                sub="❌"
              />
              <StatCard label="Non flaggées" value={flags.unflagged} />
              <StatCard
                label="Groupes doublons"
                value={duplicates.groups}
                sub={`${duplicates.affectedPhotos} photos`}
                color={
                  duplicates.groups > 0 ? 'text-amber-500' : 'text-foreground'
                }
              />
            </div>
          </section>

          {/* ── Fichiers ── */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Fichiers
            </h3>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <StatCard
                label="Taille totale"
                value={`${fileStats.totalSizeMB} Mo`}
              />
              <StatCard
                label="Taille moyenne"
                value={`${fileStats.averageSizeMB} Mo`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(fileStats.formats)
                .sort((a, b) => b[1] - a[1])
                .map(([ext, count]) => (
                  <Badge
                    key={ext}
                    variant="secondary"
                    className="text-xs font-semibold"
                  >
                    {ext} — {count}
                  </Badge>
                ))}
            </div>
          </section>

          {/* ── Labels couleur ── */}
          {Object.keys(colorLabels).length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Circle className="h-4 w-4" /> Labels couleur
              </h3>
              <div className="flex flex-wrap gap-2">
                {COLOR_LABEL_KEYS.filter((c) => colorLabels[c]).map((c) => (
                  <div
                    key={c}
                    className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: COLOR_LABEL_META[c].dot }}
                    />
                    <span className="text-sm font-medium">
                      {COLOR_LABEL_META[c].label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {colorLabels[c]}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Tags ── */}
          {tags.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Tags fréquents
              </h3>
              <div className="space-y-2 rounded-xl border border-border/40 bg-muted/30 p-4">
                {tags.map(({ tag, count }) => (
                  <div key={tag} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                      {tag}
                    </span>
                    <MiniBar
                      value={count}
                      max={tags[0].count}
                      color="bg-indigo-400"
                    />
                    <span className="w-6 shrink-0 text-right text-xs font-medium">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
