/**
 * Local-only photo pixel store (IndexedDB).
 * Metadata lives in Supabase; blobs stay in the browser, keyed by photo id.
 */

const DB_NAME = "moments-forever-local-photos";
const DB_VERSION = 1;
const STORE_NAME = "photo-blobs";

export type LocalPhotoVariant = "thumbnail" | "full";

export interface LocalPhotoBlobRecord {
  readonly id: string;
  /** Full displayable image (original when the browser can decode it). */
  readonly blob: Blob;
  /** Smaller preview when available; grids should prefer this. */
  readonly thumbnail: Blob | null;
  readonly updatedAt: number;
}

export interface LocalPhotoBlobInput {
  readonly id: string;
  readonly full: Blob;
  readonly thumbnail?: Blob | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open local photo store."));
  });
}

/** Reuse one connection — opening/closing per photo was a lightbox bottleneck. */
let sharedDbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!sharedDbPromise) {
    sharedDbPromise = openDb().then((db) => {
      db.onclose = () => {
        sharedDbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        sharedDbPromise = null;
      };
      return db;
    });
  }
  return sharedDbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function pickBlob(
  record: LocalPhotoBlobRecord | undefined,
  variant: LocalPhotoVariant,
): Blob | null {
  if (!record) return null;
  if (variant === "thumbnail") {
    return record.thumbnail ?? record.blob ?? null;
  }
  return record.blob ?? record.thumbnail ?? null;
}

export async function putLocalPhotoBlob(
  id: string,
  blob: Blob,
  thumbnail: Blob | null = null,
): Promise<void> {
  await putLocalPhotoBlobs([{ id, full: blob, thumbnail }]);
}

export async function putLocalPhotoBlobs(
  entries: ReadonlyArray<LocalPhotoBlobInput>,
): Promise<void> {
  if (entries.length === 0) return;

  const db = await getDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const updatedAt = Date.now();

  for (const entry of entries) {
    const record: LocalPhotoBlobRecord = {
      id: entry.id,
      blob: entry.full,
      thumbnail: entry.thumbnail ?? null,
      updatedAt,
    };
    store.put(record);
  }

  await transactionDone(tx);
}

export async function getLocalPhotoBlobRecord(
  id: string,
): Promise<LocalPhotoBlobRecord | null> {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const record = await requestToPromise(
    tx.objectStore(STORE_NAME).get(id) as IDBRequest<
      LocalPhotoBlobRecord | undefined
    >,
  );
  await transactionDone(tx);
  return record ?? null;
}

export async function getLocalPhotoBlobRecords(
  ids: readonly string[],
): Promise<Map<string, LocalPhotoBlobRecord>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const result = new Map<string, LocalPhotoBlobRecord>();
  if (uniqueIds.length === 0) return result;

  const db = await getDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  await Promise.all(
    uniqueIds.map(async (id) => {
      const record = await requestToPromise(
        store.get(id) as IDBRequest<LocalPhotoBlobRecord | undefined>,
      );
      if (record) result.set(id, record);
    }),
  );

  await transactionDone(tx);
  return result;
}

export async function getLocalPhotoBlob(
  id: string,
  variant: LocalPhotoVariant = "full",
): Promise<Blob | null> {
  const record = await getLocalPhotoBlobRecord(id);
  return pickBlob(record ?? undefined, variant);
}

export async function getLocalPhotoBlobs(
  ids: readonly string[],
  variant: LocalPhotoVariant = "full",
): Promise<Map<string, Blob>> {
  const records = await getLocalPhotoBlobRecords(ids);
  const result = new Map<string, Blob>();
  for (const [id, record] of records) {
    const blob = pickBlob(record, variant);
    if (blob) result.set(id, blob);
  }
  return result;
}

export async function deleteLocalPhotoBlob(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  await transactionDone(tx);
  // Dynamic import avoids a circular dependency with the Object URL cache.
  const { forgetLocalPhotoObjectUrls } = await import(
    "./local-photo-object-url-cache"
  );
  forgetLocalPhotoObjectUrls(id);
}

export async function deleteLocalPhotoBlobs(
  ids: readonly string[],
): Promise<void> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const db = await getDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const id of uniqueIds) {
    store.delete(id);
  }
  await transactionDone(tx);
  const { forgetLocalPhotoObjectUrlsMany } = await import(
    "./local-photo-object-url-cache"
  );
  forgetLocalPhotoObjectUrlsMany(uniqueIds);
}
