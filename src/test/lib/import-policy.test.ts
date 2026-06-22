import { describe, it, expect } from 'vitest';
import {
  validateImportFiles,
  detectImageSignature,
  detectRawSignature,
  MAX_IMPORT_FILE_BYTES,
  MAX_RAW_IMPORT_FILE_BYTES,
  MAX_IMPORT_BATCH,
} from '@/lib/import-policy';
import { calculateFileHash } from '@/lib/utils';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00];

function makeFile(name: string, type: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function makePng(name = 'ok.png'): File {
  return makeFile(name, 'image/png', PNG_MAGIC);
}

describe('import-policy (P1-A)', () => {
  it('détecte la vraie signature PNG, indépendamment du MIME', async () => {
    expect(await detectImageSignature(makePng())).toBe('png');
  });

  it('accepte un PNG valide', async () => {
    const { accepted, rejected } = await validateImportFiles([makePng()]);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it('accepte un RAW avec signature TIFF valide (.cr2, décodé en aval)', async () => {
    const { accepted, rejected } = await validateImportFiles([
      makeFile('shot.cr2', 'image/x-canon-cr2', [0x49, 0x49, 0x2a, 0x00, 0x10]),
    ]);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it('rejette un RAW à signature non reconnue (extension RAW mais octets bidons)', async () => {
    const { accepted, rejected } = await validateImportFiles([
      makeFile('fake.nef', 'image/x-nikon-nef', [0x00, 0x01, 0x02, 0x03]),
    ]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/signature RAW/i);
  });

  it('rejette un RAW trop volumineux (> limite RAW dédiée)', async () => {
    const big = makeFile('huge.arw', 'image/x-sony-arw', [
      0x49, 0x49, 0x2a, 0x00,
    ]);
    Object.defineProperty(big, 'size', {
      value: MAX_RAW_IMPORT_FILE_BYTES + 1,
      configurable: true,
    });
    const { accepted, rejected } = await validateImportFiles([big]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/volumineux/i);
  });

  it('detectRawSignature reconnaît TIFF/RW2/Fuji/CR3 et rejette le reste', async () => {
    const sig = (bytes: number[]) =>
      detectRawSignature(makeFile('x.raw', '', bytes));
    expect(await sig([0x49, 0x49, 0x2a, 0x00])).toBe(true); // TIFF LE (CR2/NEF/ARW/DNG)
    expect(await sig([0x4d, 0x4d, 0x00, 0x2a])).toBe(true); // TIFF BE
    expect(await sig([0x49, 0x49, 0x55, 0x00])).toBe(true); // Panasonic RW2
    expect(
      await sig([0x46, 0x55, 0x4a, 0x49, 0x46, 0x49, 0x4c, 0x4d])
    ).toBe(true); // "FUJIFILM"
    expect(await sig([0x00, 0x01, 0x02, 0x03])).toBe(false);
  });

  it('rejette un MIME falsifié (extension .png mais octets non-image)', async () => {
    // type annoncé image/png, mais en-tête "MZ" (exécutable) → signature absente.
    const spoof = makeFile('evil.png', 'image/png', [0x4d, 0x5a, 0x90, 0x00]);
    const { accepted, rejected } = await validateImportFiles([spoof]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/signature/i);
  });

  it('rejette un fichier trop volumineux', async () => {
    const big = makePng('big.png');
    Object.defineProperty(big, 'size', {
      value: MAX_IMPORT_FILE_BYTES + 1,
      configurable: true,
    });
    const { accepted, rejected } = await validateImportFiles([big]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/volumineux/i);
  });

  it('rejette un fichier vide', async () => {
    const { rejected } = await validateImportFiles([
      makeFile('empty.png', 'image/png', []),
    ]);
    expect(rejected[0].reason).toMatch(/vide/i);
  });

  it('rejette une extension non autorisée', async () => {
    const { rejected } = await validateImportFiles([
      makeFile('doc.pdf', 'application/pdf', [0x25, 0x50, 0x44, 0x46]),
    ]);
    expect(rejected[0].reason).toMatch(/extension/i);
  });

  it('plafonne le nombre de fichiers par lot', async () => {
    const files = Array.from({ length: MAX_IMPORT_BATCH + 2 }, (_, i) =>
      makePng(`p${i}.png`)
    );
    const { accepted, rejected } = await validateImportFiles(files);
    expect(accepted).toHaveLength(MAX_IMPORT_BATCH);
    expect(rejected.length).toBeGreaterThanOrEqual(2);
    expect(rejected.every((r) => /Lot limité/i.test(r.reason))).toBe(true);
  });
});

describe('calculateFileHash (P1-A : jamais de hash vide)', () => {
  it('retourne un SHA-256 hex non vide pour un fichier valide', async () => {
    const hash = await calculateFileHash(makePng());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
