/**
 * Bench P1-4 — runner NODE. Démarre Vite, ouvre la page de bench dans un vrai
 * Chromium (Playwright), injecte un dossier de photos réelles dans le champ
 * fichier, attend la mesure du chemin d'analyse réel, et imprime un rapport
 * chiffré. AUCUN chiffre inventé : sans dossier de vraies photos, il s'arrête.
 *
 * ── Prérequis (dépendance optionnelle, NON installée par défaut) ─────────────
 *   pnpm add -D playwright
 *   npx playwright install chromium
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   BENCH_DIR=./samples pnpm bench:analysis
 *   # ou un dossier absolu :
 *   BENCH_DIR=/chemin/vers/mes/photos pnpm bench:analysis
 *
 * Variables : BENCH_DIR (dossier d'images), BENCH_PORT (port Vite, défaut 5234).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const BENCH_DIR = process.env.BENCH_DIR ?? './samples';
const PORT = Number(process.env.BENCH_PORT ?? 5234);
const IMAGE_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
]);

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(port: number, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      // 200 ou 404 → le serveur répond.
      if (res.status > 0) return true;
    } catch {
      // pas encore prêt
    }
    await delay(400);
  }
  return false;
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : 'n/a';
}

function printReport(report: Record<string, unknown>, dir: string): void {
  const r = report as {
    count: number;
    ok: number;
    failed: number;
    poolSize: number;
    hardwareConcurrency: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    minMs: number;
    maxMs: number;
    batchMs: number;
    batchThroughputPerSec: number;
    mbPerSec: number;
  };
  console.log('\n=== TreePhoto · bench analyse pixel (chemin réel) ===');
  console.log(`dossier            : ${dir}`);
  console.log(`images             : ${r.count} (ok=${r.ok}, échec=${r.failed})`);
  console.log(
    `pool workers       : ${r.poolSize} (hardwareConcurrency=${r.hardwareConcurrency})`
  );
  console.log('--- latence séquentielle (1 image à la fois) ---');
  console.log(`moyenne            : ${fmt(r.meanMs)} ms`);
  console.log(`p50 / p95          : ${fmt(r.p50Ms)} / ${fmt(r.p95Ms)} ms`);
  console.log(`min / max          : ${fmt(r.minMs)} / ${fmt(r.maxMs)} ms`);
  console.log('--- débit du pool (lot complet) ---');
  console.log(`durée lot          : ${fmt(r.batchMs)} ms`);
  console.log(`débit              : ${fmt(r.batchThroughputPerSec)} img/s`);
  console.log(`débit données      : ${fmt(r.mbPerSec)} Mo/s`);
  console.log('====================================================\n');
}

async function main(): Promise<void> {
  // Import dynamique : dépendance optionnelle, message clair si absente.
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('[bench] Playwright manquant. Installez-le :');
    console.error('  pnpm add -D playwright && npx playwright install chromium');
    process.exit(2);
    return;
  }

  const dirAbs = path.resolve(BENCH_DIR);
  let files: string[];
  try {
    const entries = await readdir(dirAbs);
    files = entries
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(dirAbs, f));
  } catch {
    console.error(`[bench] Dossier introuvable : ${dirAbs}`);
    console.error('  Fournissez vos photos via BENCH_DIR=/chemin/vers/photos');
    process.exit(2);
    return;
  }
  if (files.length === 0) {
    console.error(
      `[bench] Aucune image dans ${dirAbs} (extensions: ${[...IMAGE_EXT].join(', ')})`
    );
    process.exit(2);
    return;
  }

  // 1) Démarrer Vite pour servir la page + résoudre les imports src/worker.
  const isWin = process.platform === 'win32';
  const npx = isWin ? 'npx.cmd' : 'npx';
  const vite: ChildProcess = spawn(
    npx,
    ['vite', '--port', String(PORT), '--strictPort'],
    // `shell: true` requis sous Windows pour spawn un `.cmd` (sinon EINVAL).
    { stdio: ['ignore', 'inherit', 'inherit'], env: process.env, shell: isWin }
  );

  const stop = () => {
    try {
      vite.kill();
    } catch {
      // déjà arrêté
    }
  };

  const ready = await waitForServer(PORT);
  if (!ready) {
    console.error('[bench] Vite n’a pas démarré à temps.');
    stop();
    process.exit(1);
    return;
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const url = `http://localhost:${PORT}/scripts/bench/index.html`;
    await page.goto(url, { waitUntil: 'load' });
    await page.setInputFiles('#files', files);

    // Attente généreuse : gros lots possibles.
    await page.waitForFunction(
      () =>
        Boolean(window.__BENCH_RESULT__) || Boolean(window.__BENCH_ERROR__),
      undefined,
      { timeout: 10 * 60_000 }
    );

    const pageError = await page.evaluate(() => window.__BENCH_ERROR__);
    if (pageError) {
      console.error('[bench] Erreur dans la page :', pageError);
      process.exitCode = 1;
      return;
    }

    const report = await page.evaluate(() => window.__BENCH_RESULT__);
    if (!report) {
      console.error('[bench] Aucun résultat retourné par la page.');
      process.exitCode = 1;
      return;
    }
    printReport(report as Record<string, unknown>, dirAbs);
  } finally {
    await browser.close();
    stop();
  }
}

void main();
