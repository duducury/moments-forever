import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type R2PhotoVariant = "original" | "thumbnail";

export interface R2Config {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucketName: string;
  readonly endpoint: string;
}

function readEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  return value;
}

export function getR2Config(): R2Config | null {
  const accountId = readEnv("R2_ACCOUNT_ID");
  const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = readEnv("R2_BUCKET_NAME") || "moments-forever-photos";
  const endpoint =
    readEnv("R2_ENDPOINT") ||
    (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : "");

  if (!accountId || !accessKeyId || !secretAccessKey || !endpoint) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
  };
}

let cachedClient: S3Client | null = null;
let cachedEndpoint: string | null = null;

function getR2Client(config: R2Config): S3Client {
  if (cachedClient && cachedEndpoint === config.endpoint) {
    return cachedClient;
  }
  cachedClient = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cachedEndpoint = config.endpoint;
  return cachedClient;
}

/** Stable private object key — never use the original filename. */
export function buildPhotoObjectKey(input: {
  readonly userId: string;
  readonly experienceId: string;
  readonly photoId: string;
  readonly variant: R2PhotoVariant;
}): string {
  return `photos/${input.userId}/${input.experienceId}/${input.photoId}/${input.variant}`;
}

/** Profile avatar object — one current file per user. */
export function buildAvatarObjectKey(input: {
  readonly userId: string;
  readonly extension?: "jpg" | "jpeg" | "png" | "webp";
}): string {
  const extension = input.extension ?? "jpg";
  return `avatars/${input.userId}/avatar.${extension}`;
}

export function isAvatarObjectKeyForUser(
  key: string,
  userId: string,
): boolean {
  return new RegExp(
    `^avatars/${userId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/avatar\\.(jpe?g|png|webp)$`,
    "u",
  ).test(key);
}

export function parsePhotoObjectKey(key: string): {
  readonly userId: string;
  readonly experienceId: string;
  readonly photoId: string;
  readonly variant: R2PhotoVariant;
} | null {
  const match = /^photos\/([^/]+)\/([^/]+)\/([^/]+)\/(original|thumbnail)$/u.exec(
    key,
  );
  if (!match) return null;
  const [, userId, experienceId, photoId, variant] = match;
  if (!userId || !experienceId || !photoId) return null;
  if (variant !== "original" && variant !== "thumbnail") return null;
  return { userId, experienceId, photoId, variant };
}

export async function createPresignedPutUrl(input: {
  readonly key: string;
  readonly contentType: string;
  readonly expiresInSeconds?: number;
}): Promise<string> {
  const config = getR2Config();
  if (!config) {
    throw new Error("Armazenamento R2 não configurado.");
  }
  const client = getR2Client(config);
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: input.key,
    ContentType: input.contentType,
  });
  return getSignedUrl(client, command, {
    expiresIn: input.expiresInSeconds ?? 60 * 15,
  });
}

export async function createPresignedGetUrl(input: {
  readonly key: string;
  readonly expiresInSeconds?: number;
}): Promise<string> {
  const config = getR2Config();
  if (!config) {
    throw new Error("Armazenamento R2 não configurado.");
  }
  const client = getR2Client(config);
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: input.key,
  });
  return getSignedUrl(client, command, {
    expiresIn: input.expiresInSeconds ?? 60 * 30,
  });
}

export async function deleteR2Object(key: string): Promise<void> {
  const config = getR2Config();
  if (!config) {
    throw new Error("Armazenamento R2 não configurado.");
  }
  const client = getR2Client(config);
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
  );
}

export async function deleteR2Objects(keys: readonly string[]): Promise<void> {
  const unique = [...new Set(keys.filter((key) => key.trim().length > 0))];
  for (const key of unique) {
    await deleteR2Object(key);
  }
}

export async function r2ObjectExists(key: string): Promise<boolean> {
  const config = getR2Config();
  if (!config) return false;
  const client = getR2Client(config);
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Server-only put helper for small objects/tests — prefer presigned PUT for large photos. */
export async function putR2Object(input: {
  readonly key: string;
  readonly body: Buffer | Uint8Array | Blob;
  readonly contentType: string;
}): Promise<void> {
  const config = getR2Config();
  if (!config) {
    throw new Error("Armazenamento R2 não configurado.");
  }
  const client = getR2Client(config);
  const body =
    input.body instanceof Blob
      ? new Uint8Array(await input.body.arrayBuffer())
      : input.body;
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: input.key,
      Body: body,
      ContentType: input.contentType,
    }),
  );
}

export async function getR2ObjectBytes(input: {
  readonly key: string;
}): Promise<{ readonly body: Uint8Array; readonly contentType: string } | null> {
  const streamed = await getR2ObjectStream(input);
  if (!streamed) return null;
  const body = new Uint8Array(await new Response(streamed.body).arrayBuffer());
  return {
    body,
    contentType: streamed.contentType,
  };
}

/** Stream an object so `/api/media` can pipe bytes with a stable cacheable URL. */
export async function getR2ObjectStream(input: {
  readonly key: string;
}): Promise<{
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string;
  readonly contentLength: number | null;
  readonly etag: string | null;
} | null> {
  const config = getR2Config();
  if (!config) return null;
  const client = getR2Client(config);
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: input.key,
      }),
    );
    if (!result.Body) return null;
    const webStream =
      typeof result.Body.transformToWebStream === "function"
        ? result.Body.transformToWebStream()
        : new ReadableStream<Uint8Array>({
            start(controller) {
              void result.Body!.transformToByteArray()
                .then((bytes) => {
                  controller.enqueue(bytes);
                  controller.close();
                })
                .catch((error: unknown) => {
                  controller.error(error);
                });
            },
          });
    return {
      body: webStream,
      contentType: result.ContentType?.trim() || "application/octet-stream",
      contentLength:
        typeof result.ContentLength === "number" ? result.ContentLength : null,
      etag: result.ETag?.trim() || null,
    };
  } catch {
    return null;
  }
}
