import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhotoStore } from '../../store/photoStore';
import { useAiErrorStore } from '../../store/aiErrorStore';
import { DEFAULT_RETOUCH_OPTIONS, RetouchOptions } from '../../types';

const {
  applyRetouchMock,
  computeAutoRetouchPresetMock,
  GPURetouchProcessorMock,
} = vi.hoisted(() => {
  const applyRetouchMock = vi.fn();
  const computeAutoRetouchPresetMock = vi.fn();
  const GPURetouchProcessorMock = vi.fn().mockImplementation(() => ({
    applyRetouch: applyRetouchMock,
    computeAutoRetouchPreset: computeAutoRetouchPresetMock,
  }));
  return {
    applyRetouchMock,
    computeAutoRetouchPresetMock,
    GPURetouchProcessorMock,
  };
});

vi.mock('../../lib/computer-vision/gpu-retouch', () => ({
  GPURetouchProcessor: GPURetouchProcessorMock,
}));

type MutableOptions = RetouchOptions & {
  lastAutoPreset?: Partial<RetouchOptions>;
  autoPresetConfidence?: number;
};

describe('PhotoStore auto retouch', () => {
  beforeAll(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
    global.URL.revokeObjectURL = vi.fn();

    class MockImage {
      crossOrigin: string | null = null;
      onload: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      set src(_: string) {
        setTimeout(() => {
          this.onload?.(new Event('load'));
        }, 0);
      }
    }

    // @ts-expect-error - assign test Image stub
    global.Image = MockImage;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    usePhotoStore.getState().clearAll();
    useAiErrorStore.getState().clearAll();

    const currentOptions: MutableOptions = {
      ...DEFAULT_RETOUCH_OPTIONS,
    } as MutableOptions;

    const now = new Date().toISOString();

    usePhotoStore.setState((state) => {
      state.photos = [
        {
          id: 'photo-1',
          file: new File([''], 'photo.jpg', { type: 'image/jpeg' }),
          previewUrl: 'mock-preview-url',
          analysis: null,
          retouch: {
            history: [],
            currentOptions,
            originalPreviewUrl: 'mock-preview-url',
            previewUrl: 'mock-preview-url',
            lastUpdated: now,
          },
        },
      ];
      state.retouchActivePhotoId = 'photo-1';
      state.retouchSessionPhotoIds = ['photo-1'];
      state.retouchProcessingIds = new Set();
      state.autoRetouchPreset = null;
      state.autoRetouchError = null;
      state.isAutoRetouchComputing = false;
    });

    const canvasMock = {
      toBlob: (callback: BlobCallback) =>
        callback(new Blob(['content'], { type: 'image/jpeg' })),
    } as unknown as HTMLCanvasElement;

    applyRetouchMock.mockResolvedValue(canvasMock);
  });

  it('computes and applies an auto retouch preset', async () => {
    computeAutoRetouchPresetMock.mockResolvedValueOnce({
      options: {
        exposure: 15,
        texture: 20,
      },
      confidence: 0.82,
    });

    await usePhotoStore.getState().computeAutoRetouchPreset('photo-1');

    const state = usePhotoStore.getState();
    const photo = state.photos[0];

    expect(computeAutoRetouchPresetMock).toHaveBeenCalledTimes(1);
    expect(applyRetouchMock).toHaveBeenCalled();
    expect(state.isAutoRetouchComputing).toBe(false);
    expect(state.autoRetouchError).toBeNull();
    expect(state.autoRetouchPreset?.options).toEqual({
      exposure: 15,
      texture: 20,
    });
    expect(state.autoRetouchPreset?.confidence).toBeCloseTo(0.82, 2);

    expect(photo.retouch?.currentOptions.exposure).toBe(15);
    expect(photo.retouch?.currentOptions.texture).toBe(20);
    expect(photo.retouch?.lastAutoPreset).toEqual({
      exposure: 15,
      texture: 20,
    });
    expect(photo.retouch?.autoPresetConfidence).toBeCloseTo(0.82, 2);
  });

  it('handles auto preset errors gracefully', async () => {
    computeAutoRetouchPresetMock.mockRejectedValueOnce(
      new Error('GPU indisponible')
    );

    await usePhotoStore.getState().computeAutoRetouchPreset('photo-1');

    const state = usePhotoStore.getState();
    expect(state.isAutoRetouchComputing).toBe(false);
    expect(state.autoRetouchPreset).toBeNull();
    expect(state.autoRetouchError).toContain('GPU indisponible');
    expect(applyRetouchMock).not.toHaveBeenCalled();

    const errors = useAiErrorStore.getState().errors;
    expect(errors[0]).toBeDefined();
    expect(errors[0]?.message).toContain('GPU indisponible');
  });
});
