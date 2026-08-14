/// <reference lib="webworker" />

import type {
  PhotoWorkerComplete,
  PhotoWorkerItemError,
  PhotoWorkerItemResult,
  PhotoWorkerProgress,
} from "@moments-forever/shared";

import {
  createBrowserPhotoDerivatives,
  extractBrowserPhotoMetadata,
} from "@/lib/photo-import/browser-metadata";
import type {
  BrowserAnalyzeRequest,
  BrowserWorkerRequest,
} from "@/lib/photo-import/browser-worker-types";

const worker = self as DedicatedWorkerGlobalScope;
let cancelled = false;

function postProgress(completed: number, total: number): void {
  const message: PhotoWorkerProgress = { type: "progress", completed, total };
  worker.postMessage(message);
}

worker.addEventListener("message", (event: MessageEvent<BrowserWorkerRequest>) => {
  if (event.data.type === "cancel") {
    cancelled = true;
    return;
  }
  cancelled = false;
  void analyze(event.data);
});

async function analyze(request: BrowserAnalyzeRequest): Promise<void> {
  const fingerprints = new Map<string, string>();
  let completed = 0;

  for (
    let chunkStart = 0;
    chunkStart < request.files.length && !cancelled;
    chunkStart += request.chunkSize
  ) {
    const chunk = request.files.slice(
      chunkStart,
      chunkStart + request.chunkSize,
    );
    for (const entry of chunk) {
      if (cancelled) break;
      try {
        const startedAt = performance.now();
        const extracted = await extractBrowserPhotoMetadata(entry.id, entry.file);
        const duplicateOf = fingerprints.get(extracted.fingerprint) ?? null;
        if (duplicateOf === null) {
          fingerprints.set(extracted.fingerprint, extracted.id);
        }
        const deduplicatedMetadata =
          duplicateOf === null ? extracted : { ...extracted, duplicateOf };
        const derivatives = await createBrowserPhotoDerivatives(entry.file);
        const thumbnail = derivatives?.thumbnail ?? null;
        const preview = derivatives?.preview ?? null;
        const metadataWithDimensions =
          thumbnail && deduplicatedMetadata.dimensions === null
            ? {
                ...deduplicatedMetadata,
                dimensions: {
                  width: thumbnail.width,
                  height: thumbnail.height,
                  orientation: deduplicatedMetadata.exif.orientation,
                },
              }
            : deduplicatedMetadata;
        const metadata = {
          ...metadataWithDimensions,
          analysisMs: performance.now() - startedAt,
        };
        const item: PhotoWorkerItemResult<Blob> = {
          type: "item",
          metadata,
          thumbnail: thumbnail?.blob ?? null,
          preview: preview?.blob ?? null,
        };
        worker.postMessage(item);
      } catch (error: unknown) {
        const message: PhotoWorkerItemError = {
          type: "error",
          id: entry.id,
          message:
            error instanceof Error
              ? error.message
              : "Falha inesperada ao analisar esta foto.",
        };
        worker.postMessage(message);
      }
      completed += 1;
      postProgress(completed, request.files.length);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  const complete: PhotoWorkerComplete = {
    type: "complete",
    cancelled,
  };
  worker.postMessage(complete);
}

export {};
