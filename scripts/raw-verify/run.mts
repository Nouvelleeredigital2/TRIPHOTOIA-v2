/**
 * Vérification RAW (navigateur réel via Playwright) : décode de vrais fichiers
 * RAW dans une page isolée (pas l'app React, pour éviter les quirks du graphe de
 * modules en dev) et imprime dimensions, échantillon de pixels, et la détection
 * de visages sur l'image décodée. Aucun chiffre inventé.
 *
 *   npx tsx scripts/raw-verify/run.mts <fichier RAW> […]
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const PORT = Number(process.env.RAW_VERIFY_PORT ?? 5239);
const files = process.argv.slice(2).map((f) => path.resolve(f));
if (files.length === 0) {
  console.error('Usage: npx tsx scripts/raw-verify/run.mts <fichier RAW> […]');
  process.exit(2);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitForServer(port: number, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.status > 0) return true;
    } catch {
      /* pas prêt */
    }
    await delay(400);
  }
  return false;
}

async function main() {
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error(
      '[raw-verify] Playwright manquant: pnpm add -D playwright && npx playwright install chromium'
    );
    process.exit(2);
    return;
  }

  const isWin = process.platform === 'win32';
  const vite: ChildProcess = spawn(
    isWin ? 'npx.cmd' : 'npx',
    ['vite', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'inherit', 'inherit'], env: process.env, shell: isWin }
  );
  const stop = () => {
    try {
      vite.kill();
    } catch {
      /* déjà arrêté */
    }
  };

  if (!(await waitForServer(PORT))) {
    console.error('[raw-verify] Vite n’a pas démarré.');
    stop();
    process.exit(1);
    return;
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('console', (m) => {
      const t = m.text();
      if (/error|fail|abort/i.test(t)) console.error('  [page]', t);
    });
    await page.goto(`http://localhost:${PORT}/scripts/raw-verify/index.html`, {
      waitUntil: 'load',
    });
    await page.waitForFunction(() => window.__RAW_READY__ === true, undefined, {
      timeout: 30_000,
    });
    await page.setInputFiles('#files', files);
    await page.waitForFunction(
      () => Boolean(window.__RAW_VERIFY__),
      undefined,
      {
        timeout: 5 * 60_000,
      }
    );
    const result = await page.evaluate(() => window.__RAW_VERIFY__);
    console.log('\n=== Résultat décodage RAW (Chromium réel) ===');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
    stop();
  }
}

void main();
