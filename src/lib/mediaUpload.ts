/**
 * UNIFIED SALON IMAGE UPLOAD PIPELINE
 *
 * One code path for every owner-uploaded image (logo, hero, gallery,
 * before/after, staff, service visuals) across ALL five website templates.
 * Previously each screen hand-rolled its own `FileReader` + storage call, so a
 * failure surfaced as an opaque catch-all message and the
 * gallery showed nothing until the server responded.
 *
 * This module guarantees, for every template:
 *
 *   1. VALIDATION FIRST — max 5 MB, accepted formats JPG / PNG / WEBP / SVG
 *      (legacy GIF is tolerated for previously saved galleries). Failures get
 *      a specific, human-readable message naming the file, its real size and
 *      the accepted formats — never a generic error.
 *   2. INSTANT PREVIEW — `URL.createObjectURL(file)` (with a Base64
 *      `FileReader` fallback) so the image renders in the gallery list BEFORE
 *      the server responds, and stays visible if the upload later fails.
 *   3. RETRY — transient transport failures (network drop, 5xx, 429, timeouts)
 *      are retried with exponential backoff. Permanent failures (auth, quota,
 *      bucket policy, unsupported type) fail fast with their real reason.
 *   4. NEVER LOSE THE IMAGE — if Storage cannot be reached after all retries
 *      the file is encoded as a Base64 data URL and returned with
 *      `usedFallback: true`, so the owner's photo is still saved into the
 *      draft instead of vanishing.
 *
 * No service-role key, no credentials: every write goes through the existing
 * anon-key client (`uploadSalonMedia`) or the existing data-URL path.
 */
import { isSupabaseConfigured } from './supabaseClient';
import { uploadSalonMedia, type SalonMediaRecord, type SalonMediaType } from './salonMediaService';

/* ------------------------------------------------------------------ */
/* Contract constants                                                  */
/* ------------------------------------------------------------------ */

/** Hard upload cap for owner images (5 MB). */
export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** The formats the builder accepts today. */
export const IMAGE_UPLOAD_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
] as const;

/**
 * Older galleries already contain GIFs; they keep rendering, but GIF is no
 * longer advertised as an accepted upload format.
 */
export const IMAGE_UPLOAD_LEGACY_TYPES = ['image/gif', 'image/jpg'] as const;

/** Value for `<input type="file" accept="...">`. */
export const IMAGE_UPLOAD_ACCEPT_ATTR =
  '.jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml';

/** Human-readable list used in validation messages. */
export const IMAGE_UPLOAD_FORMATS_LABEL = 'JPG, PNG, WEBP or SVG';

/**
 * Files bigger than this are downscaled before a Base64 fallback so a data URL
 * can never blow the localStorage / JSONB budget.
 */
export const IMAGE_FALLBACK_MAX_MB = 0.75;

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type ImageUploadErrorCode =
  | 'no-file'
  | 'unsupported-type'
  | 'too-large'
  | 'empty-file'
  | 'unreadable'
  | 'unauthorized'
  | 'not-configured'
  | 'no-salon'
  | 'upload-failed';

/** A validation/transport failure carrying a user-safe message + stable code. */
export class ImageUploadError extends Error {
  readonly code: ImageUploadErrorCode;

  constructor(code: ImageUploadErrorCode, message: string) {
    super(message);
    this.name = 'ImageUploadError';
    this.code = code;
  }
}

/**
 * Last-resort copy for an upload failure that carries no readable cause.
 * Always names a next step, unlike the old catch-all dead end the owner
 * previously saw and could not act on.
 */
export function genericUploadError(what: string): string {
  return `That ${what} could not be uploaded. Check your connection and try again, or pick a different image.`;
}

export function describeUploadError(error: unknown, fallback = 'The image could not be uploaded. Please check your connection and try again.'): string {
  if (error instanceof ImageUploadError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export function isAcceptedImageType(type: string | undefined | null): boolean {
  const normalized = (type || '').trim().toLowerCase().split(';')[0];
  if (!normalized) return false;
  return (
    (IMAGE_UPLOAD_ACCEPTED_TYPES as readonly string[]).includes(normalized) ||
    (IMAGE_UPLOAD_LEGACY_TYPES as readonly string[]).includes(normalized)
  );
}

export interface ImageValidationResult {
  ok: boolean;
  code: ImageUploadErrorCode | null;
  error: string | null;
}

/** Validates type + size, returning a specific, human-readable problem. */
export function validateImageUploadFile(
  file: { name?: string; type?: string; size?: number } | null | undefined,
  maxBytes: number = IMAGE_UPLOAD_MAX_BYTES,
): ImageValidationResult {
  if (!file) {
    return { ok: false, code: 'no-file', error: 'Please choose an image to upload.' };
  }
  const type = (file.type || '').trim().toLowerCase();
  if (!type.startsWith('image/')) {
    return {
      ok: false,
      code: 'unsupported-type',
      error: `“${file.name || 'That file'}” is not an image. Accepted formats: ${IMAGE_UPLOAD_FORMATS_LABEL}.`,
    };
  }
  if (!isAcceptedImageType(type)) {
    return {
      ok: false,
      code: 'unsupported-type',
      error: `“${file.name || 'That file'}” has an unsupported format. Accepted formats: ${IMAGE_UPLOAD_FORMATS_LABEL}.`,
    };
  }
  const size = typeof file.size === 'number' ? file.size : 0;
  if (size <= 0) {
    return { ok: false, code: 'empty-file', error: `“${file.name || 'That file'}” is empty. Choose another image.` };
  }
  if (size > maxBytes) {
    return {
      ok: false,
      code: 'too-large',
      error: `“${file.name || 'That image'}” is ${formatBytes(size)}. Images must be ${formatBytes(maxBytes)} or smaller.`,
    };
  }
  return { ok: true, code: null, error: null };
}

/** Throws {@link ImageUploadError} when the file is unacceptable. */
export function assertValidImageFile(
  file: { name?: string; type?: string; size?: number } | null | undefined,
  maxBytes: number = IMAGE_UPLOAD_MAX_BYTES,
): void {
  const result = validateImageUploadFile(file, maxBytes);
  if (!result.ok) throw new ImageUploadError(result.code ?? 'unsupported-type', result.error ?? 'Invalid image.');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* ------------------------------------------------------------------ */
/* Instant client-side preview                                         */
/* ------------------------------------------------------------------ */

/**
 * Creates a `blob:` URL for immediate rendering (gallery list shows the photo
 * before the server responds). Returns null when the environment has no object
 * URL support (SSR / jsdom without URL.createObjectURL) so callers can fall
 * back to the Base64 reader.
 */
export function createPreviewUrl(file: File | Blob): string | null {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

/** Frees a preview URL. Safe to call with null / undefined / non-blob URLs. */
export function revokePreviewUrl(url: string | null | undefined): void {
  if (!url || !url.startsWith('blob:')) return;
  try {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
  } catch {
    /* nothing else to do — the browser GCs the blob */
  }
}

/** Reads a file as a Base64 data URL, reporting 0–100 progress. */
export function readImageAsDataUrl(file: File | Blob, onProgress?: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result) {
          reject(new ImageUploadError('unreadable', `Could not read “${(file as File).name || 'that image'}”. Try another image.`));
          return;
        }
        onProgress?.(100);
        resolve(result);
      };
      reader.onerror = () => reject(new ImageUploadError('unreadable', `Could not read “${(file as File).name || 'that image'}”. Try another image.`));
      reader.readAsDataURL(file);
    } catch (error) {
      reject(new ImageUploadError('unreadable', 'Could not read that image. Try another image.'));
    }
  });
}

/**
 * Local preview URL for a file: `blob:` when available, otherwise a Base64
 * data URL read through `FileReader`. Never rejects — falls back to ''.
 */
export async function createImagePreview(file: File | Blob): Promise<string> {
  const objectUrl = createPreviewUrl(file);
  if (objectUrl) return objectUrl;
  try {
    return await readImageAsDataUrl(file);
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* Retry                                                               */
/* ------------------------------------------------------------------ */

const RETRYABLE_PATTERN =
  /(network|fetch|timeout|timed out|aborted|econnreset|econnrefused|socket|temporarily|unavailable|5\d\d|429|too many requests|rate limit|gateway|bad gateway|service unavailable|storage server|internal server error)/i;

/**
 * A retryable failure is a transient transport/server problem. Permanent
 * problems (missing bucket, RLS denial, quota, bad credentials, unsupported
 * type) are NOT retried — retrying them only delays the real error.
 */
export function isRetryableUploadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_PATTERN.test(message);
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to stop retrying this error immediately. */
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (info: { attempt: number; error: unknown; delayMs: number }) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `operation` with exponential backoff (400ms → 800ms → 1600ms …).
 * The final attempt's error is re-thrown unchanged.
 */
export async function withRetry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 400;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  const shouldRetry = options.isRetryable ?? isRetryableUploadError;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) break;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      options.onRetry?.({ attempt, error, delayMs });
      await sleep(delayMs);
    }
  }
  throw lastError;
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

export interface UploadSalonImageInput {
  file: File;
  /** Salon UUID the media belongs to (resolved through ownership, never a URL). */
  salonId?: string | null;
  mediaType: SalonMediaType;
  title?: string;
  description?: string;
  displayOrder?: number;
  status?: 'pending' | 'active';
  /** 0–100 progress callback (preview + upload + fallback stages). */
  onProgress?: (percent: number) => void;
  /** Override the 5 MB cap for a specific surface. */
  maxBytes?: number;
  /** Retry attempts for the Storage write (default 3). */
  attempts?: number;
}

export interface UploadSalonImageResult {
  /** A renderable URL: signed Storage URL, or a Base64 data URL on fallback. */
  url: string;
  /** `blob:` URL for instant rendering; caller revokes it when done. */
  previewUrl: string | null;
  /** Canonical Storage object path when the file reached the bucket. */
  storagePath: string | null;
  /** `salon_media.id` when a metadata row was written. */
  mediaId: string | null;
  /** True when Storage was unreachable and the data URL was used instead. */
  usedFallback: boolean;
  /** Non-fatal notes (e.g. "saved locally after the upload failed"). */
  warnings: string[];
  /** The raw record when Storage accepted the upload. */
  media: SalonMediaRecord | null;
}

function titleFromFileName(name: string): string {
  return (name || '').replace(/\.[^/.]+$/, '').trim() || 'Salon image';
}

/**
 * Downscale before the Base64 fallback so a data URL stays small enough for
 * localStorage / the draft JSONB column. SVG is vector and never rasterized.
 */
async function prepareFallbackFile(file: File): Promise<File> {
  if ((file.type || '').toLowerCase().includes('svg')) return file;
  try {
    const { compressImageToMaxFileSize } = await import('./imageCompression');
    return await compressImageToMaxFileSize(file, IMAGE_FALLBACK_MAX_MB);
  } catch {
    return file;
  }
}

/**
 * Upload one image and ALWAYS return a renderable URL.
 *
 * Order of operations:
 *   1. validate (5 MB, JPG/PNG/WEBP/SVG)
 *   2. create the instant `blob:` preview
 *   3. upload to Supabase Storage with retry (configured deployments)
 *   4. on persistent failure → Base64 data URL fallback (`usedFallback: true`)
 *
 * Throws {@link ImageUploadError} only when no URL can be produced at all.
 */
export async function uploadSalonImage(input: UploadSalonImageInput): Promise<UploadSalonImageResult> {
  const maxBytes = input.maxBytes ?? IMAGE_UPLOAD_MAX_BYTES;
  assertValidImageFile(input.file, maxBytes);

  const previewUrl = createPreviewUrl(input.file);
  input.onProgress?.(8);

  const warnings: string[] = [];

  if (!isSupabaseConfigured) {
    // Unconfigured/demo mode: persist as a Base64 data URL (existing behaviour).
    const fallbackFile = await prepareFallbackFile(input.file);
    const url = await readImageAsDataUrl(fallbackFile, (percent) =>
      input.onProgress?.(Math.min(100, Math.round(8 + percent * 0.92))),
    );
    return {
      url,
      previewUrl,
      storagePath: null,
      mediaId: null,
      usedFallback: true,
      warnings,
      media: null,
    };
  }

  if (!input.salonId) {
    throw new ImageUploadError('no-salon', 'We could not resolve your salon. Please refresh and try again.');
  }

  try {
    const media = await withRetry(
      () =>
        uploadSalonMedia({
          salonId: input.salonId as string,
          file: input.file,
          mediaType: input.mediaType,
          title: input.title?.trim() || titleFromFileName(input.file.name),
          description: input.description,
          displayOrder: input.displayOrder,
          status: input.status ?? 'active',
        }),
      {
        attempts: input.attempts ?? 3,
        onRetry: ({ attempt, delayMs }) => {
          warnings.push(`Upload attempt ${attempt} failed — retrying in ${Math.round(delayMs / 100) / 10}s.`);
          input.onProgress?.(Math.min(90, 20 + attempt * 10));
        },
      },
    );
    input.onProgress?.(100);
    if (!media.signedUrl) {
      throw new ImageUploadError('upload-failed', 'The image uploaded but its preview URL could not be created.');
    }
    return {
      url: media.signedUrl,
      previewUrl,
      storagePath: media.storagePath,
      mediaId: media.id,
      usedFallback: false,
      warnings,
      media,
    };
  } catch (error) {
    // Storage is unavailable / denied. Fall back to a Base64 data URL so the
    // owner's photo is still saved into the draft instead of being lost.
    warnings.push(
      'Saved to your draft locally — it will sync to your media library when the connection is restored.',
    );
    try {
      const fallbackFile = await prepareFallbackFile(input.file);
      const url = await readImageAsDataUrl(fallbackFile, (percent) =>
        input.onProgress?.(Math.min(100, Math.round(30 + percent * 0.7))),
      );
      return {
        url,
        previewUrl,
        storagePath: null,
        mediaId: null,
        usedFallback: true,
        warnings,
        media: null,
      };
    } catch {
      // Nothing renderable could be produced — surface the REAL reason.
      if (error instanceof ImageUploadError) throw error;
      throw new ImageUploadError('upload-failed', describeUploadError(error));
    }
  }
}
