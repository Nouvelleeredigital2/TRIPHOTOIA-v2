import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join, sep } from 'node:path';

// P0-A : garde-fou architectural.
// L'application active réside exclusivement sous `src/`. Aucun fichier de `src/`
// ne doit importer de code applicatif via un chemin relatif qui remonte au-dessus
// de `src/` (anciens dossiers racine `services/`, `components/`, `App.tsx`,
// `types.ts`). Ce test échoue si un import réintroduit cette dépendance.

const repoRoot = resolve(__dirname, '..', '..', '..');
const srcRoot = resolve(repoRoot, 'src');
// `worker/` est le worker cloud Node légitime : un package frère de `src/`,
// volontairement hors de `src/`. Les tests sous `src/test/worker/` ont le droit
// de l'importer ; seuls les anciens dossiers racine supprimés sont interdits.
const workerRoot = resolve(repoRoot, 'worker');
// `scripts/` est un paquet Node frère légitime (CLI smoke/outils), au même titre
// que `worker/`. Les tests sous `src/test/` ont le droit de l'importer.
const scriptsRoot = resolve(repoRoot, 'scripts');

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const IMPORT_RE =
  /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function relativeSpecifiers(content: string): string[] {
  const specs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const spec = m[1] ?? m[2];
    if (spec && spec.startsWith('.')) specs.push(spec);
  }
  return specs;
}

describe('architecture: no legacy root imports', () => {
  it('legacy root duplicates have been removed', () => {
    expect(existsSync(resolve(repoRoot, 'services'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'components'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'App.tsx'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'types.ts'))).toBe(false);
  });

  it('no file under src/ imports a relative path escaping src/', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(srcRoot)) {
      const content = readFileSync(file, 'utf8');
      for (const spec of relativeSpecifiers(content)) {
        const resolved = resolve(dirname(file), spec);
        const rel = relative(srcRoot, resolved);
        const escapesSrc = rel === '..' || rel.startsWith(`..${sep}`);
        // Autorisé : import vers le worker cloud (`worker/`) ou les scripts (`scripts/`).
        const intoWorker =
          resolved === workerRoot || resolved.startsWith(`${workerRoot}${sep}`);
        const intoScripts =
          resolved === scriptsRoot || resolved.startsWith(`${scriptsRoot}${sep}`);
        if (escapesSrc && !intoWorker && !intoScripts) {
          offenders.push(`${relative(repoRoot, file)} -> ${spec}`);
        }
      }
    }
    expect(
      offenders,
      `Imports escaping src/:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
