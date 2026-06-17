import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

// P1-B : garde-fou « pas de variable serveur dans src/ ».
// Le frontend ne doit lire que des variables client `VITE_*` (ou les variables
// intégrées de Vite). Aucune clé/variable strictement serveur (service role,
// providers worker…) ne doit être référencée dans le code applicatif.

const repoRoot = resolve(__dirname, '..', '..', '..');
const srcRoot = resolve(repoRoot, 'src');

// Built-ins Vite autorisés sur import.meta.env.
const VITE_BUILTINS = new Set(['MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL']);

// Identifiants strictement serveur qui ne doivent jamais apparaître dans src/
// (hors test/ et hors le garde-fou supabaseConfig.ts qui les rejette).
const SERVER_ONLY_TOKENS = [
  'SERVICE_ROLE_KEY',
  'WORKER_POLL_INTERVAL',
  'WORKER_ID',
];

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'test') continue; // les tests peuvent simuler l'env serveur
      out.push(...collect(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const ENV_ACCESS_RE =
  /(?:import\.meta\.env|process\.env)\.([A-Za-z_][A-Za-z0-9_]*)/g;

describe('architecture: pas de variable serveur dans src/ (P1-B)', () => {
  const files = collect(srcRoot);

  it('tout accès env dans src/ cible une variable VITE_* ou un built-in Vite', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = ENV_ACCESS_RE.exec(content)) !== null) {
        const name = m[1];
        if (!name.startsWith('VITE_') && !VITE_BUILTINS.has(name)) {
          offenders.push(`${relative(repoRoot, file)} -> ${name}`);
        }
      }
    }
    expect(
      offenders,
      `Accès à une variable non-client:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('aucun identifiant strictement serveur référencé hors du garde-fou', () => {
    const allow = resolve(srcRoot, 'lib', 'supabaseConfig.ts');
    const offenders: string[] = [];
    for (const file of files) {
      if (file === allow) continue; // supabaseConfig.ts référence la clé pour la REJETER
      const content = readFileSync(file, 'utf8');
      for (const token of SERVER_ONLY_TOKENS) {
        if (content.includes(token)) {
          offenders.push(`${relative(repoRoot, file)} -> ${token}`);
        }
      }
    }
    expect(
      offenders,
      `Référence serveur interdite:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
