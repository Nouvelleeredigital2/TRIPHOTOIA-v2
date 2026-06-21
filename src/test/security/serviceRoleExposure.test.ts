import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Frontend security boundary: the Supabase service-role key bypasses RLS and must
// never reach the browser bundle, a Vite/frontend env file, or the Vercel client
// config. This suite statically scans the surfaces that ship to clients.

const root = process.cwd();

const walk = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
};

const isTestFile = (path: string): boolean =>
  path.includes(`${sep}test${sep}`) || /\.test\.(ts|tsx)$/.test(path);

describe('service-role exposure scan', () => {
  it('never references the service-role key in shipped frontend code (only the guard rejects it)', () => {
    const srcFiles = walk(join(root, 'src'));
    const offenders = srcFiles
      .filter((f) => !isTestFile(f))
      .filter((f) => readFileSync(f, 'utf8').includes('VITE_SUPABASE_SERVICE_ROLE_KEY'))
      .map((f) => relative(root, f).split(sep).join('/'));

    // The ONLY allowed reference is the defensive guard that throws on it.
    expect(offenders).toEqual(['src/lib/supabaseConfig.ts']);

    const guard = readFileSync(join(root, 'src', 'lib', 'supabaseConfig.ts'), 'utf8');
    expect(guard).toMatch(/throw new Error\([^)]*service role/i);
  });

  it('does not put a service-role key behind a VITE_ (client-exposed) prefix in .env.example', () => {
    const env = readFileSync(join(root, '.env.example'), 'utf8');
    const offendingLines = env
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('#'))
      .filter((l) => /^VITE_[A-Z_]*SERVICE_ROLE/i.test(l));

    expect(offendingLines).toEqual([]);
    // And the warning that documents the boundary must remain.
    expect(env.toLowerCase()).toContain('never add a service role key');
  });

  it('keeps the worker service-role key out of any VITE_ alias', () => {
    const env = readFileSync(join(root, '.env.example'), 'utf8');
    // The worker key must be the bare SUPABASE_SERVICE_ROLE_KEY, never VITE-prefixed.
    expect(env).toMatch(/^SUPABASE_SERVICE_ROLE_KEY=/m);
    expect(env).not.toMatch(/^VITE_SUPABASE_SERVICE_ROLE_KEY=/m);
  });

  it('does not leak a service-role key in the Vercel client config', () => {
    const vercelPath = join(root, 'vercel.json');
    if (!existsSync(vercelPath)) return;
    const vercel = readFileSync(vercelPath, 'utf8');
    expect(vercel.toUpperCase()).not.toContain('SERVICE_ROLE');
  });
});
