import { AutoRetouchPreset, RetouchOptions } from '../types';

export type RetouchWorkerRequest = {
  id: number;
  type: 'PROCESS';
  width: number;
  height: number;
  options: RetouchOptions;
  data: ArrayBuffer;
};

export type RetouchWorkerAutoRequest = {
  id: number;
  type: 'AUTO_PRESET';
  width: number;
  height: number;
  data: ArrayBuffer;
};

export type RetouchWorkerSuccess = {
  id: number;
  type: 'SUCCESS';
  width: number;
  height: number;
  data: ArrayBuffer;
};

export type RetouchWorkerError = {
  id: number;
  type: 'ERROR';
  error: string;
};

export type RetouchWorkerAutoSuccess = {
  id: number;
  type: 'AUTO_SUCCESS';
  preset: AutoRetouchPreset;
};

export type RetouchWorkerRequestPayload =
  | RetouchWorkerRequest
  | RetouchWorkerAutoRequest;

export type RetouchWorkerResponse =
  | RetouchWorkerSuccess
  | RetouchWorkerAutoSuccess
  | RetouchWorkerError;
