/**
 * Bench P1-4 — entrée NAVIGATEUR. Exécute le VRAI service d'analyse de l'app
 * (WorkerAnalysisService → Web Worker → OffscreenCanvas), exactement le même
 * code que l'import de photos. Aucun score fabriqué : on mesure le chemin réel
 * sur de vraies images sélectionnées par l'utilisateur (ou injectées par
 * Playwright via le champ fichier).
 *
 * Le résultat est posé sur window.__BENCH_RESULT__ (ou __BENCH_ERROR__) pour
 * que le runner Node (run-bench.mts) le récupère.
 */
import { WorkerAnalysisService } from '../../src/services/workerAnalysisService';

interface BenchTiming {
  name: string;
  bytes: number;
  ms: number;
  ok: boolean;
}

interface BenchReport {
  count: number;
  ok: number;
  failed: number;
  poolSize: number;
  hardwareConcurrency: number;
  // Latence séquentielle (une image à la fois) :
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  // Débit du pool borné (tout le lot d'un coup) :
  batchMs: number;
  batchThroughputPerSec: number;
  totalBytes: number;
  mbPerSec: number;
  timings: BenchTiming[];
}

declare global {
  interface Window {
    __BENCH_RESULT__?: BenchReport;
    __BENCH_ERROR__?: string;
  }
}

const out = document.getElementById('out') as HTMLPreElement;
const input = document.getElementById('files') as HTMLInputElement;

const percentile = (sortedAsc: number[], p: number): number => {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank));
  return sortedAsc[idx];
};

const isError = (r: unknown): boolean =>
  typeof r === 'object' && r !== null && 'error' in r;

async function run(files: File[]): Promise<void> {
  out.textContent = `running on ${files.length} image(s)…`;

  // Service réel (pool borné identique à l'app).
  const service = new WorkerAnalysisService();
  const poolSize = service.getStats().totalWorkers;

  try {
    // 1) Latence séquentielle : une image à la fois → distribution propre.
    const timings: BenchTiming[] = [];
    for (const file of files) {
      const t0 = performance.now();
      const [result] = await service.analyzePhotosBatch([file]);
      const ms = performance.now() - t0;
      timings.push({
        name: file.name,
        bytes: file.size,
        ms,
        ok: !isError(result),
      });
    }

    // 2) Débit du pool : tout le lot d'un coup (réaliste pour un import en masse).
    const batchStart = performance.now();
    const batchResults = await service.analyzePhotosBatch(files);
    const batchMs = performance.now() - batchStart;

    const okCount = batchResults.filter((r) => !isError(r)).length;
    const sortedMs = timings.map((t) => t.ms).sort((a, b) => a - b);
    const sum = sortedMs.reduce((a, b) => a + b, 0);
    const totalBytes = files.reduce((a, f) => a + f.size, 0);

    const report: BenchReport = {
      count: files.length,
      ok: okCount,
      failed: files.length - okCount,
      poolSize,
      hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
      meanMs: sortedMs.length ? sum / sortedMs.length : 0,
      p50Ms: percentile(sortedMs, 50),
      p95Ms: percentile(sortedMs, 95),
      minMs: sortedMs[0] ?? 0,
      maxMs: sortedMs[sortedMs.length - 1] ?? 0,
      batchMs,
      batchThroughputPerSec: batchMs > 0 ? (files.length / batchMs) * 1000 : 0,
      totalBytes,
      mbPerSec: batchMs > 0 ? totalBytes / (1024 * 1024) / (batchMs / 1000) : 0,
      timings,
    };

    out.textContent = JSON.stringify(report, null, 2);
    window.__BENCH_RESULT__ = report;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    out.textContent = `ERROR: ${message}`;
    window.__BENCH_ERROR__ = message;
  } finally {
    service.dispose();
  }
}

input.addEventListener('change', () => {
  const files = Array.from(input.files ?? []);
  if (files.length > 0) void run(files);
});
