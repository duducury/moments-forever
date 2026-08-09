import type {
  PhotoWorkerAnalyzeRequest,
  PhotoWorkerRequest,
  PhotoWorkerResult,
} from "@moments-forever/shared";

export interface BrowserWorkerFile {
  readonly id: string;
  readonly file: File;
}

export type BrowserAnalyzeRequest =
  PhotoWorkerAnalyzeRequest<BrowserWorkerFile>;

export type BrowserWorkerRequest = PhotoWorkerRequest<BrowserWorkerFile>;

export type BrowserWorkerResult = PhotoWorkerResult<Blob>;
