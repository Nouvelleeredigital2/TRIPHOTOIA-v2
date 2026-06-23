import { describe, it, expect, beforeAll } from 'vitest';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import {
  createDefaultJobProcessors,
  processWorkerJob,
  WorkerJob,
} from '../../../worker/jobRunner';
import { createDeterministicEmbedder } from '../../../worker/embedding';
import { createDeterministicFaceDetector } from '../../../worker/faceDetection';
import { createSharpImageProcessor } from '../../../worker/imageProcessing';
import type { StorageIO } from '../../../worker/storage';

// Image nette réelle (damier) à traiter.
let photoBytes: Buffer;
beforeAll(async () => {
  const raw = Buffer.alloc(256 * 256 * 3);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const v = (x + y) % 2 === 0 ? 0 : 255;
      const i = (y * 256 + x) * 3;
      raw[i] = raw[i + 1] = raw[i + 2] = v;
    }
  }
  photoBytes = await sharp(raw, {
    raw: { width: 256, height: 256, channels: 3 },
  })
    .jpeg()
    .toBuffer();
});

interface Captured {
  op: 'upsert' | 'insert' | 'update';
  table: string;
  row?: Record<string, unknown>;
  eq?: [string, unknown];
}

function makeClientAndStore(photoPath: string) {
  const store = new Map<string, Buffer>([[photoPath, photoBytes]]);
  const captured: Captured[] = [];
  const io: StorageIO = {
    async download(p) {
      const b = store.get(p);
      if (!b) throw new Error(`not found: ${p}`);
      return b;
    },
    async upload(p, data) {
      store.set(p, data);
    },
  };
  // Faux client Supabase : enregistre les écritures, renvoie toujours {error:null}.
  const client = {
    from(table: string) {
      return {
        async upsert(row: Record<string, unknown>) {
          captured.push({ op: 'upsert', table, row });
          return { error: null };
        },
        async insert(rows: Record<string, unknown>) {
          captured.push({ op: 'insert', table, row: rows });
          return { error: null };
        },
        update(row: Record<string, unknown>) {
          return {
            async eq(col: string, val: unknown) {
              captured.push({ op: 'update', table, row, eq: [col, val] });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client, store, captured, io };
}

const baseJob = (overrides: Partial<WorkerJob>): WorkerJob => ({
  id: 'job-1',
  project_id: 'proj-1',
  photo_id: 'photo-1',
  job_type: 'quality_analysis',
  status: 'processing',
  attempts: 1,
  payload: { storage_path: 'projects/proj-1/photo-1.jpg' },
  result: {},
  error_message: null,
  run_after: '2026-01-01T00:00:00.000Z',
  locked_at: null,
  locked_by: 'w',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('worker end-to-end avec moteur sharp réel (Supabase en mémoire)', () => {
  it('generate_thumbnail : crée et téléverse une VRAIE miniature WebP + marque le job completed', async () => {
    const { client, store, captured, io } = makeClientAndStore(
      'projects/proj-1/photo-1.jpg'
    );
    const processors = createDefaultJobProcessors(
      createDeterministicEmbedder(),
      createDeterministicFaceDetector(),
      createSharpImageProcessor(io)
    );
    await processWorkerJob(
      client,
      baseJob({ job_type: 'generate_thumbnail' }),
      processors
    );

    // une vraie miniature WebP a été uploadée
    const thumb = store.get('projects/proj-1/photo-1_thumb.webp');
    expect(thumb).toBeDefined();
    expect(thumb!.slice(8, 12).toString('ascii')).toBe('WEBP');

    // photos.thumbnail_path mis à jour + job completed
    const jobUpdate = captured.find(
      (c) => c.table === 'jobs' && c.op === 'update'
    );
    expect(jobUpdate?.row?.status).toBe('completed');
    expect((jobUpdate?.row?.result as Record<string, unknown>)?.processor).toBe(
      'sharp'
    );
  });

  it('quality_analysis : écrit des scores RÉELS (pixels) dans photo_analysis', async () => {
    const { client, captured, io } = makeClientAndStore(
      'projects/proj-1/photo-1.jpg'
    );
    const processors = createDefaultJobProcessors(
      createDeterministicEmbedder(),
      createDeterministicFaceDetector(),
      createSharpImageProcessor(io)
    );
    await processWorkerJob(
      client,
      baseJob({ job_type: 'quality_analysis' }),
      processors
    );

    const analysis = captured.find(
      (c) => c.table === 'photo_analysis' && c.op === 'upsert'
    );
    expect(analysis).toBeDefined();
    const row = analysis!.row as Record<string, number>;
    // damier net → sharpness élevée, pas flou
    expect(row.sharpness_score).toBeGreaterThan(0);
    expect(row.photo_id).toBe('photo-1' as unknown as number);
    const jobUpdate = captured.find(
      (c) => c.table === 'jobs' && c.op === 'update'
    );
    expect(jobUpdate?.row?.status).toBe('completed');
  });

  it('perceptual_hash : écrit un dHash réel (16 hex) dans photo_analysis', async () => {
    const { client, captured, io } = makeClientAndStore(
      'projects/proj-1/photo-1.jpg'
    );
    const processors = createDefaultJobProcessors(
      createDeterministicEmbedder(),
      createDeterministicFaceDetector(),
      createSharpImageProcessor(io)
    );
    await processWorkerJob(
      client,
      baseJob({ job_type: 'perceptual_hash' }),
      processors
    );

    const analysis = captured.find(
      (c) => c.table === 'photo_analysis' && c.op === 'upsert'
    );
    expect((analysis!.row as Record<string, string>).perceptual_hash).toMatch(
      /^[0-9a-f]{16}$/
    );
  });

  it('échec de téléchargement Storage → job NON completed (jamais d’artefact factice)', async () => {
    const { client, captured, io } = makeClientAndStore(
      'projects/proj-1/photo-1.jpg'
    );
    const processors = createDefaultJobProcessors(
      createDeterministicEmbedder(),
      createDeterministicFaceDetector(),
      createSharpImageProcessor(io)
    );
    // chemin inexistant → download lève → processWorkerJob bascule en échec
    await processWorkerJob(
      client,
      baseJob({
        job_type: 'quality_analysis',
        payload: { storage_path: 'absent.jpg' },
      }),
      processors
    );
    const completed = captured.find(
      (c) =>
        c.table === 'jobs' && c.op === 'update' && c.row?.status === 'completed'
    );
    const failed = captured.find(
      (c) =>
        c.table === 'jobs' && c.op === 'update' && c.row?.status === 'failed'
    );
    expect(completed).toBeUndefined();
    expect(failed).toBeDefined(); // marqué failed (pas de RPC sur le faux client)
  });
});
