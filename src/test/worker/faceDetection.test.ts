import { describe, expect, it } from 'vitest';
import {
  FACE_EMBEDDING_DIMENSIONS,
  createDeterministicFaceDetector,
  createFaceDetector,
} from '../../../worker/faceDetection';

describe('deterministic face detector', () => {
  it('detects at least one face with a 128-dim embedding and bounding box', async () => {
    const detector = createDeterministicFaceDetector();
    const faces = await detector.detect({ storagePath: 'projects/p1/photo.jpg' });
    expect(faces.length).toBeGreaterThanOrEqual(1);
    faces.forEach((face) => {
      expect(face.embedding).toHaveLength(FACE_EMBEDDING_DIMENSIONS);
      expect(face.boundingBox).toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      });
      expect(face.confidence).toBeGreaterThanOrEqual(0.7);
      expect(face.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('is stable for the same input', async () => {
    const detector = createDeterministicFaceDetector();
    const a = await detector.detect({ storagePath: 'projects/p1/photo.jpg' });
    const b = await detector.detect({ storagePath: 'projects/p1/photo.jpg' });
    expect(a).toEqual(b);
  });

  it('never assigns a name or person to detected faces', async () => {
    const detector = createDeterministicFaceDetector();
    const faces = await detector.detect({ storagePath: 'projects/p1/photo.jpg' });
    faces.forEach((face) => {
      expect(face).not.toHaveProperty('personId');
      expect(face).not.toHaveProperty('displayName');
    });
  });

  it('rejects empty input', async () => {
    const detector = createDeterministicFaceDetector();
    await expect(detector.detect({ storagePath: '' })).rejects.toThrow();
  });
});

describe('createFaceDetector', () => {
  it('defaults to the deterministic provider', () => {
    expect(createFaceDetector({}).model).toBe('deterministic-face-v1');
  });

  it('throws on an unknown provider', () => {
    expect(() => createFaceDetector({ FACE_PROVIDER: 'mystery' })).toThrow(/Unknown FACE_PROVIDER/);
  });

  it('reports the onnx provider as a not-yet-wired extension point', () => {
    expect(() => createFaceDetector({ FACE_PROVIDER: 'onnx' })).toThrow(/not wired yet/);
  });
});
