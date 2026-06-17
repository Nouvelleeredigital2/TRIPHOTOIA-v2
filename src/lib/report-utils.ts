import {
  Photo,
  DuplicateGroup,
  PhotoCollection,
  ColorLabel,
  COLOR_LABEL_KEYS,
} from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnalysisReport {
  generatedAt: string;
  summary: {
    total: number;
    analyzed: number;
    withErrors: number;
    pending: number;
  };
  quality: {
    blurry: number;
    sharp: number;
    averageSharpness: number;
    averageRating: number;
    ratingDistribution: Record<number, number>;
  };
  flags: {
    picks: number;
    rejected: number;
    unflagged: number;
  };
  duplicates: {
    groups: number;
    affectedPhotos: number;
  };
  collections: {
    count: number;
    names: string[];
  };
  tags: Array<{ tag: string; count: number }>;
  colorLabels: Partial<Record<ColorLabel, number>>;
  fileStats: {
    totalSizeMB: number;
    averageSizeMB: number;
    formats: Record<string, number>;
  };
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildReport(
  photos: Photo[],
  duplicateGroups: DuplicateGroup[],
  collections: Record<string, PhotoCollection>
): AnalysisReport {
  const analyzed = photos.filter((p) => p.analysis && !p.analysis.error);
  const withErrors = photos.filter((p) => p.analysis?.error);
  const pending = photos.filter((p) => !p.analysis);

  // Quality
  const sharpnessValues = analyzed
    .map((p) => p.analysis!.sharpnessScore ?? 0)
    .filter((v) => v > 0);
  const averageSharpness =
    sharpnessValues.length > 0
      ? sharpnessValues.reduce((a, b) => a + b, 0) / sharpnessValues.length
      : 0;

  const ratings = analyzed.map((p) => p.analysis!.rating ?? 0);
  const averageRating =
    ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;

  const ratingDistribution: Record<number, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  ratings.forEach((r) => {
    ratingDistribution[r] = (ratingDistribution[r] ?? 0) + 1;
  });

  // Flags
  const picks = analyzed.filter((p) => p.analysis!.isPick).length;
  const rejected = analyzed.filter((p) => p.analysis!.isRejected).length;
  const unflagged = analyzed.length - picks - rejected;

  // Duplicates
  const affectedPhotoIds = new Set(
    duplicateGroups.flatMap((g) => g.photos.map((p) => p.id))
  );

  // Tags
  const tagCounts: Record<string, number> = {};
  analyzed.forEach((p) => {
    (p.analysis!.tags ?? []).forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    });
  });
  const tags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, count]) => ({ tag, count }));

  // Color labels
  const colorLabels: Partial<Record<ColorLabel, number>> = {};
  COLOR_LABEL_KEYS.forEach((c) => {
    const count = analyzed.filter((p) => p.analysis!.colorLabel === c).length;
    if (count > 0) colorLabels[c] = count;
  });

  // File stats
  const totalSizeBytes = photos.reduce(
    (sum, p) => sum + (p.file?.size ?? 0),
    0
  );
  const formats: Record<string, number> = {};
  photos.forEach((p) => {
    const ext =
      (p.file?.name ?? '').split('.').pop()?.toUpperCase() ?? 'UNKNOWN';
    formats[ext] = (formats[ext] ?? 0) + 1;
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: photos.length,
      analyzed: analyzed.length,
      withErrors: withErrors.length,
      pending: pending.length,
    },
    quality: {
      blurry: analyzed.filter((p) => p.analysis!.isBlurry).length,
      sharp: analyzed.filter((p) => (p.analysis!.sharpnessScore ?? 0) >= 0.7)
        .length,
      averageSharpness: Math.round(averageSharpness * 100) / 100,
      averageRating: Math.round(averageRating * 10) / 10,
      ratingDistribution,
    },
    flags: { picks, rejected, unflagged },
    duplicates: {
      groups: duplicateGroups.length,
      affectedPhotos: affectedPhotoIds.size,
    },
    collections: {
      count: Object.keys(collections).length,
      names: Object.values(collections).map((c) => c.name),
    },
    tags,
    colorLabels,
    fileStats: {
      totalSizeMB: Math.round((totalSizeBytes / 1024 / 1024) * 10) / 10,
      averageSizeMB:
        photos.length > 0
          ? Math.round((totalSizeBytes / photos.length / 1024 / 1024) * 10) / 10
          : 0,
      formats,
    },
  };
}

// ── Exports ──────────────────────────────────────────────────────────────────

export function downloadReportJSON(report: AnalysisReport): void {
  const json = JSON.stringify(report, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `treephoto-rapport-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printReportHTML(report: AnalysisReport): void {
  const { summary, quality, flags, duplicates, tags, fileStats } = report;
  const date = new Date(report.generatedAt).toLocaleString('fr-FR');

  const ratingRows = [5, 4, 3, 2, 1, 0]
    .map((r) => {
      const count = quality.ratingDistribution[r] ?? 0;
      const pct =
        summary.analyzed > 0 ? Math.round((count / summary.analyzed) * 100) : 0;
      const label = r === 0 ? 'Sans note' : `${r}★`;
      return `<tr>
        <td>${label}</td>
        <td>${count}</td>
        <td>
          <div style="background:#e5e7eb;border-radius:4px;height:10px;width:100%">
            <div style="background:#6366f1;height:10px;border-radius:4px;width:${pct}%"></div>
          </div>
        </td>
        <td style="color:#6b7280">${pct}%</td>
      </tr>`;
    })
    .join('');

  const tagRows = tags
    .map(
      ({ tag, count }) =>
        `<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:99px;font-size:12px;margin:2px">${tag} (${count})</span>`
    )
    .join(' ');

  const formatRows = Object.entries(fileStats.formats)
    .sort((a, b) => b[1] - a[1])
    .map(([ext, count]) => `<tr><td>${ext}</td><td>${count}</td></tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Rapport Tree Photo IA — ${date}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #fff; padding: 40px; max-width: 960px; margin: auto; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
    h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 28px; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
    .stat { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
    .stat-value { font-size: 28px; font-weight: 700; color: #111; }
    .stat-label { font-size: 13px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { padding: 5px 8px; vertical-align: middle; }
    tr:nth-child(even) td { background: #f9fafb; }
    .tags { line-height: 2; }
    @media print { .card { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>Rapport d'analyse — Tree Photo IA</h1>
  <p class="subtitle">Généré le ${date}</p>

  <div class="grid">
    <!-- Résumé -->
    <div class="card">
      <h2>Résumé</h2>
      <div class="stat"><span class="stat-value">${summary.total}</span><span class="stat-label">photos au total</span></div>
      <div class="stat"><span class="stat-value">${summary.analyzed}</span><span class="stat-label">analysées</span></div>
      ${summary.withErrors > 0 ? `<div class="stat"><span class="stat-value" style="color:#dc2626">${summary.withErrors}</span><span class="stat-label">erreurs d'analyse</span></div>` : ''}
      ${summary.pending > 0 ? `<div class="stat"><span class="stat-value" style="color:#d97706">${summary.pending}</span><span class="stat-label">en attente</span></div>` : ''}
    </div>

    <!-- Qualité -->
    <div class="card">
      <h2>Qualité</h2>
      <div class="stat"><span class="stat-value">${Math.round(quality.averageSharpness * 100)}%</span><span class="stat-label">netteté moyenne</span></div>
      <div class="stat"><span class="stat-value">${quality.blurry}</span><span class="stat-label">photos floues</span></div>
      <div class="stat"><span class="stat-value">${quality.sharp}</span><span class="stat-label">photos nettes (>70%)</span></div>
      <div class="stat"><span class="stat-value">${quality.averageRating}★</span><span class="stat-label">note moyenne</span></div>
    </div>

    <!-- Flags -->
    <div class="card">
      <h2>Flags & Doublons</h2>
      <div class="stat"><span class="stat-value" style="color:#16a34a">${flags.picks}</span><span class="stat-label">picks</span></div>
      <div class="stat"><span class="stat-value" style="color:#dc2626">${flags.rejected}</span><span class="stat-label">rejetées</span></div>
      <div class="stat"><span class="stat-value">${duplicates.groups}</span><span class="stat-label">groupe(s) de doublons (${duplicates.affectedPhotos} photos)</span></div>
    </div>

    <!-- Fichiers -->
    <div class="card">
      <h2>Fichiers</h2>
      <div class="stat"><span class="stat-value">${fileStats.totalSizeMB} Mo</span><span class="stat-label">taille totale</span></div>
      <div class="stat"><span class="stat-value">${fileStats.averageSizeMB} Mo</span><span class="stat-label">taille moyenne</span></div>
      <table style="margin-top:8px">
        ${formatRows}
      </table>
    </div>
  </div>

  <!-- Distribution des notes -->
  <div class="card" style="margin-bottom:24px">
    <h2>Distribution des notes</h2>
    <table>
      <thead><tr><th style="text-align:left">Note</th><th style="text-align:left">Photos</th><th style="text-align:left;width:50%">Distribution</th><th></th></tr></thead>
      <tbody>${ratingRows}</tbody>
    </table>
  </div>

  <!-- Tags -->
  ${
    tags.length > 0
      ? `<div class="card">
    <h2>Tags les plus fréquents</h2>
    <div class="tags">${tagRows}</div>
  </div>`
      : ''
  }
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) win.focus();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
