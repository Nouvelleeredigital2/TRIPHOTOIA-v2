import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// P0-C : invariants de ressources du pool de Web Workers.
// On remplace `Worker` par un faux contrôlable pour vérifier que le pool reste
// borné, qu'un worker fautif est remplacé sans faire croître le pool, et que
// `dispose()` termine tout et rejette proprement les tâches en attente.

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];

  constructor(_url: unknown, _opts?: unknown) {
    FakeWorker.instances.push(this);
  }

  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }

  terminate(): void {
    this.terminated = true;
  }
}

let WorkerAnalysisService: typeof import('@/services/workerAnalysisService').WorkerAnalysisService;

const g = globalThis as unknown as { Worker?: unknown };
let originalWorker: unknown;

beforeEach(async () => {
  FakeWorker.instances = [];
  // Affectation directe : `vi.stubGlobal` utilise defineProperty et échoue si
  // `Worker` est non configurable sous jsdom ("Cannot redefine property").
  // Les tests passent un nombre de workers explicite, donc `navigator` n'est
  // pas requis.
  originalWorker = g.Worker;
  g.Worker = FakeWorker;
  ({ WorkerAnalysisService } =
    await import('@/services/workerAnalysisService'));
});

afterEach(() => {
  g.Worker = originalWorker;
});

describe('WorkerAnalysisService — invariants de pool (P0-C)', () => {
  it('borne le pool à 4 workers maximum même si on en demande davantage', () => {
    const service = new WorkerAnalysisService(10);
    expect(service.getStats().totalWorkers).toBe(4);
    service.dispose();
  });

  it('remplace un worker fautif à son index sans faire croître le pool', () => {
    const before = FakeWorker.instances.length;
    const service = new WorkerAnalysisService(2);
    const created = FakeWorker.instances.slice(before);
    expect(service.getStats().totalWorkers).toBe(2);

    const countAfterCreate = FakeWorker.instances.length;
    const faulty = created[0];
    // Simule une ErrorEvent telle que reçue par worker.onerror.
    faulty.onerror?.({ currentTarget: faulty, message: 'boom' });

    // Pool toujours borné à 2 ; le worker fautif a été terminé et remplacé par
    // exactement un nouveau worker (pas de croissance).
    expect(service.getStats().totalWorkers).toBe(2);
    expect(faulty.terminated).toBe(true);
    expect(FakeWorker.instances.length).toBe(countAfterCreate + 1);
    service.dispose();
  });

  it('dispose() termine tous les workers et vide la file', () => {
    const before = FakeWorker.instances.length;
    const service = new WorkerAnalysisService(3);
    const created = FakeWorker.instances.slice(before);
    service.dispose();

    expect(service.getStats().totalWorkers).toBe(0);
    expect(service.getStats().pendingTasks).toBe(0);
    expect(created.every((w) => w.terminated)).toBe(true);
  });

  it('AbortSignal déjà annulé : renvoie une erreur par fichier, sans dispatch', async () => {
    const service = new WorkerAnalysisService(2);
    const controller = new AbortController();
    controller.abort();
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });

    const res = await service.analyzePhotosBatch([file], {
      signal: controller.signal,
    });
    expect(res[0]?.error).toBe('Analyse annulée');
    service.dispose();
  });

  it('AbortSignal en cours de traitement : la photo annulée porte une erreur (pas de score)', async () => {
    // Les FakeWorker ne répondent jamais (postMessage no-op) : la tâche reste en
    // file jusqu'à l'annulation.
    const service = new WorkerAnalysisService(2);
    const controller = new AbortController();
    const file = new File(['x'], 'b.jpg', { type: 'image/jpeg' });

    const promise = service.analyzePhotosBatch([file], {
      signal: controller.signal,
    });
    controller.abort();
    const res = await promise;

    expect(res[0]?.error).toBe('Analyse annulée');
    expect(res[0]?.sharpnessScore).toBeUndefined();
    expect(service.getStats().pendingTasks).toBe(0);
    service.dispose();
  });
});
