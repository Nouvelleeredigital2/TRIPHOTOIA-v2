// Face detection abstraction for the TreePhoto worker (Sprint 17).
//
// Like the semantic embedder, the detector is injectable so the job runner stays
// pure and testable. The default provider is deterministic: it derives a stable set
// of anonymous faces (bounding boxes + 128-dim embeddings) from an input key without
// any model. Faces are NEVER named here — detection only produces anonymous records;
// naming and grouping are explicit downstream actions.

import { deterministicEmbedding } from './embedding';

export const FACE_EMBEDDING_DIMENSIONS = 128;
export const DETERMINISTIC_FACE_MODEL = 'deterministic-face-v1';
export const DISABLED_FACE_MODEL = 'disabled';

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  boundingBox: FaceBoundingBox;
  embedding: number[];
  confidence: number;
}

export interface FaceDetectInput {
  storagePath: string;
  photoId?: string | null;
}

export interface FaceDetector {
  readonly model: string;
  detect(input: FaceDetectInput): Promise<DetectedFace[]>;
}

type FaceEnv = Record<string, string | undefined>;

export const createDeterministicFaceDetector = (
  dimensions = FACE_EMBEDDING_DIMENSIONS
): FaceDetector => ({
  model: DETERMINISTIC_FACE_MODEL,
  async detect(input) {
    const seed = input.storagePath || input.photoId || '';
    if (!seed) {
      throw new Error('detect requires a storagePath or photoId');
    }

    const faceCount = 1 + (seed.length % 3); // 1..3 plausible faces
    const faces: DetectedFace[] = [];

    for (let i = 0; i < faceCount; i += 1) {
      const embedding = deterministicEmbedding(`face:${seed}:${i}`, dimensions);
      const confidence =
        Math.round((0.7 + Math.abs(embedding[0]) * 0.3) * 100) / 100;
      faces.push({
        boundingBox: {
          x: Math.round((0.05 + i * 0.3) * 1000) / 1000,
          y: 0.1,
          width: 0.2,
          height: 0.2,
        },
        embedding,
        confidence,
      });
    }

    return faces;
  },
});

// Honest "off" provider: face detection is explicitly disabled, so no records
// are ever produced (privacy/GDPR opt-out). Unlike the deterministic provider it
// fabricates nothing — it simply yields zero faces for every input.
export const createDisabledFaceDetector = (): FaceDetector => ({
  model: DISABLED_FACE_MODEL,
  async detect() {
    return [];
  },
});

export const createFaceDetector = (env: FaceEnv = {}): FaceDetector => {
  const provider = (env.FACE_PROVIDER ?? 'deterministic').trim().toLowerCase();
  const dimensions = Number(
    env.FACE_EMBEDDING_DIMENSIONS ?? FACE_EMBEDDING_DIMENSIONS
  );
  const safeDimensions =
    Number.isFinite(dimensions) && dimensions > 0
      ? dimensions
      : FACE_EMBEDDING_DIMENSIONS;

  switch (provider) {
    case 'deterministic':
      return createDeterministicFaceDetector(safeDimensions);
    case 'disabled':
      return createDisabledFaceDetector();
    case 'onnx':
      // Real detection+recognition (e.g. SCRFD detection + ArcFace embeddings via
      // onnxruntime-node) is wired here on the VPS. Left intentionally unimplemented
      // rather than faked, since it cannot be validated in CI.
      throw new Error(
        'FACE_PROVIDER "onnx" is not wired yet. Implement SCRFD/ArcFace via onnxruntime-node in worker/faceDetection.ts on the VPS.'
      );
    default:
      throw new Error(
        `Unknown FACE_PROVIDER "${provider}". Supported: deterministic, disabled (onnx is a documented extension point).`
      );
  }
};
