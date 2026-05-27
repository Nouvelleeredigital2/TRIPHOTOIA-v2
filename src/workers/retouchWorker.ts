/// <reference lib="webworker" />

export {};

import {
  applyToneAndPresenceAdjustments,
  applyUnsharpMask,
  computeAutoRetouchOptions,
} from '../lib/computer-vision/retouch-utils';
import {
  RetouchWorkerAutoRequest,
  RetouchWorkerRequest,
  RetouchWorkerRequestPayload,
  RetouchWorkerResponse,
} from './retouchWorkerMessages';

declare const self: DedicatedWorkerGlobalScope & typeof globalThis;

self.onmessage = (event: MessageEvent<RetouchWorkerRequestPayload>) => {
  const message = event.data;

  if (message.type === 'PROCESS') {
    const { id, width, height, data, options } = message;
    try {
      const inputArray = new Uint8ClampedArray(data);
      const imageData = new ImageData(inputArray, width, height);

      const processed = applyToneAndPresenceAdjustments(imageData, options);

      if (options.sharpness && options.sharpness > 0) {
        const intensity = 1 + options.sharpness / 50;
        const sharpened = applyUnsharpMask(processed, intensity);
        postSuccess(id, width, height, sharpened.data.buffer);
        return;
      }

      postSuccess(id, width, height, processed.data.buffer);
    } catch (error) {
      postError(id, error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (message.type === 'AUTO_PRESET') {
    const { id, width, height, data } = message as RetouchWorkerAutoRequest;
    try {
      const inputArray = new Uint8ClampedArray(data);
      const imageData = new ImageData(inputArray, width, height);
      const preset = computeAutoRetouchOptions(imageData);
      postAutoSuccess(id, preset);
    } catch (error) {
      postError(id, error instanceof Error ? error.message : String(error));
    }
    return;
  }
};

self.onmessageerror = () => {
  postError(-1, 'Invalid message received by retouch worker');
};

function postSuccess(id: number, width: number, height: number, buffer: ArrayBuffer) {
  const response: RetouchWorkerResponse = {
    id,
    type: 'SUCCESS',
    width,
    height,
    data: buffer,
  };
  self.postMessage(response, [buffer]);
}

function postError(id: number, error: string) {
  const response: RetouchWorkerResponse = {
    id,
    type: 'ERROR',
    error,
  };
  self.postMessage(response);
}

function postAutoSuccess(id: number, preset: ReturnType<typeof computeAutoRetouchOptions>) {
  const response: RetouchWorkerResponse = {
    id,
    type: 'AUTO_SUCCESS',
    preset,
  };
  self.postMessage(response);
}
