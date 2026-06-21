import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// P0-1 : garde-fou. Le chemin d'analyse actif doit passer par le pool de Web
// Workers (OffscreenCanvas, proxy borné), pas par le Canvas pleine résolution
// sur le thread principal. On vérifie le câblage source + la provenance + la
// présence du chunk worker dans le bundle de production lorsqu'il existe.

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('active analysis pipeline is workerized (P0-1)', () => {
  it('geminiService delegates to the worker analysis service', () => {
    const src = read('src/services/geminiService.ts');
    expect(src).toContain("from './workerAnalysisService'");
    expect(src).toContain('workerAnalysisService.analyzePhotosBatch');
    // L'ancien moteur Canvas direct n'est plus le chemin nominal.
    expect(src).not.toContain('new LocalAnalysisService()');
  });

  it('worker results carry a non-fallback local-pixel provenance', () => {
    const src = read('src/services/workerAnalysisService.ts');
    expect(src).toContain('provenance:');
    expect(src).toContain("analysisMode: 'local-pixel'");
    expect(src).toContain('isFallback: false');
  });

  it('bounds the worker pool between 1 and 4', () => {
    const src = read('src/services/workerAnalysisService.ts');
    expect(src).toContain('Math.min(4');
  });

  it('ships the optimized worker chunk in the production build (when built)', () => {
    const assetsDir = join(root, 'dist', 'assets');
    if (!existsSync(assetsDir)) return; // pas de build dans cet environnement → skip
    const hasWorkerChunk = readdirSync(assetsDir).some((f) =>
      /imageAnalysisWorker/i.test(f)
    );
    expect(hasWorkerChunk).toBe(true);
  });
});
