import { requireSupabase } from './supabaseClient';
import { formatBytes } from './mediaUpload';

export const SALON_MEDIA_BUCKET = 'salon-media';
export type SalonMediaType = 'logo' | 'hero' | 'gallery' | 'owner' | 'staff' | 'service' | 'product' | 'video' | 'thumbnail';
export type SalonMediaStatus = 'pending' | 'active' | 'inactive' | 'rejected' | 'archived';

export interface SalonMediaRecord {
  id: string;
  salonId: string;
  mediaType: SalonMediaType;
  storagePath: string | null;
  externalUrl: string | null;
  title: string | null;
  description: string | null;
  videoKind: 'short' | 'long' | null;
  status: SalonMediaStatus;
  displayOrder: number;
  signedUrl?: string;
}

/** Owner-uploaded images: 5 MB (matches the builder's upload contract). */
export const IMAGE_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
/** Owner-uploaded videos: 50 MB. */
export const VIDEO_MEDIA_MAX_BYTES = 50 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  // Legacy galleries still contain GIFs; keep accepting them.
  'image/gif',
]);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const ALLOWED_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);

/**
 * Signed URLs expire. A 1-hour TTL meant every published gallery image 404'd
 * an hour after it was uploaded; the builder now asks for a one-year URL and
 * degrades to shorter TTLs when the project caps them lower.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
const SIGNED_URL_TTL_FALLBACKS = [60 * 60 * 24 * 7, 60 * 60 * 24, 3600];

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

function extensionFor(file: File): string {
  return EXTENSION_BY_TYPE[(file.type || '').toLowerCase()] || 'bin';
}

export function mediaMaxBytes(type: string | undefined): number {
  return VIDEO_TYPES.has((type || '').toLowerCase()) ? VIDEO_MEDIA_MAX_BYTES : IMAGE_MEDIA_MAX_BYTES;
}

/**
 * Last-resort copy when the underlying error carries no readable message at
 * all. It is deliberately paired with an actionable next step, unlike the old
 * un-actionable dead end.
 */
const GENERIC_UPLOAD_ERROR = 'The upload failed before it could be saved. Please check your connection and try again.';

/**
 * Turns a raw Supabase Storage/PostgREST failure into an actionable message.
 * The previous implementation collapsed every failure into
 * one catch-all sentence, which made real problems (missing
 * bucket, RLS denial, oversized file, expired session) undiagnosable.
 */
export function describeStorageError(error: unknown, file?: { name?: string }): string {
  // Supabase returns plain `{ message, statusCode, error }` objects as well as
  // real Error instances — both shapes must produce a readable message.
  const source = error as { message?: unknown; error?: unknown } | null | undefined;
  const raw = (error instanceof Error
    ? error.message
    : typeof source?.message === 'string'
      ? source.message
      : typeof source?.error === 'string'
        ? source.error
        : typeof error === 'string'
          ? error
          : '').trim();
  const lower = raw.toLowerCase();
  const code = (error as { statusCode?: string | number; error?: string } | null)?.statusCode
    ?? (error as { status?: number } | null)?.status;
  const status = typeof code === 'string' ? Number.parseInt(code, 10) : code;

  if (!raw) return GENERIC_UPLOAD_ERROR;
  if (/jwt|token|session|not authenticated|401|unauthorized/i.test(lower)) {
    return 'Your session expired. Please log in again and retry the upload.';
  }
  if (/row-level security|rls|permission denied|not authorized|403/i.test(lower)) {
    return 'This image could not be saved to your media library (permission denied). Please retry, or contact support if it keeps happening.';
  }
  if (/bucket.*not found|does not exist.*bucket|no such bucket/i.test(lower)) {
    return 'Your media library is not set up yet. Please contact support.';
  }
  if (/mime|allowed_mime|not allowed|invalid.*type|unsupported/i.test(lower)) {
    return `“${file?.name || 'This file'}” uses a format your media library does not accept. Use JPG, PNG or WEBP.`;
  }
  if (/payload too large|size limit|file_size_limit|entity too large|maximum allowed size|exceeded the maximum|413/i.test(lower)) {
    return `“${file?.name || 'This file'}” is too large to upload. Keep images under ${formatBytes(IMAGE_MEDIA_MAX_BYTES)}.`;
  }
  if (/duplicate|already exists/i.test(lower)) {
    return 'That image is already in your media library.';
  }
  if (/network|fetch|timeout|timed out|econnreset|temporarily/i.test(lower)) {
    return 'The connection dropped while uploading. Check your internet and try again.';
  }
  if (typeof status === 'number' && status >= 500) {
    return 'The media service is temporarily unavailable. Please try again in a moment.';
  }
  // PostgREST/Storage errors are not user-facing copy — never echo raw SQL.
  if (/violates|constraint|sql|relation|column|function|schema|pg_/i.test(lower)) {
    return 'The image could not be saved because of a setup problem on our side. Please contact support.';
  }
  return raw.length > 160 ? GENERIC_UPLOAD_ERROR : raw;
}

function mapRow(row: Record<string, unknown>): SalonMediaRecord {
  return {
    id: String(row.id),
    salonId: String(row.salon_id),
    mediaType: row.media_type as SalonMediaType,
    storagePath: typeof row.storage_path === 'string' ? row.storage_path : null,
    externalUrl: typeof row.external_url === 'string' ? row.external_url : null,
    title: typeof row.title === 'string' ? row.title : null,
    description: typeof row.description === 'string' ? row.description : null,
    videoKind: row.video_kind === 'short' || row.video_kind === 'long' ? row.video_kind : null,
    status: row.status as SalonMediaStatus,
    displayOrder: Number(row.display_order || 0),
  };
}

/**
 * Creates the longest-lived signed URL the project accepts. Supabase caps
 * `expiresIn` per project, so each shorter TTL is tried in turn before giving
 * up — a published gallery must not go blank an hour after publishing.
 */
export async function createMediaSignedUrl(
  client: ReturnType<typeof requireSupabase>,
  path: string,
): Promise<string | undefined> {
  for (const ttl of [SIGNED_URL_TTL_SECONDS, ...SIGNED_URL_TTL_FALLBACKS]) {
    try {
      const { data, error } = await client.storage.from(SALON_MEDIA_BUCKET).createSignedUrl(path, ttl);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {
      /* try the next TTL */
    }
  }
  return undefined;
}

export async function uploadSalonMedia(input: {
  salonId: string;
  file: File;
  mediaType: SalonMediaType;
  themeId?: string | null;
  serviceId?: string | null;
  productId?: string | null;
  title?: string;
  description?: string;
  videoKind?: 'short' | 'long' | null;
  status?: 'pending' | 'active';
  displayOrder?: number;
}): Promise<SalonMediaRecord> {
  const type = (input.file.type || '').toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(`“${input.file.name || 'That file'}” uses an unsupported format. Accepted formats: JPG, PNG, WEBP or SVG.`);
  }
  const maxBytes = mediaMaxBytes(type);
  if (input.file.size <= 0 || input.file.size > maxBytes) {
    throw new Error(`“${input.file.name || 'That file'}” must be between 0 and ${formatBytes(maxBytes)}.`);
  }

  const client = requireSupabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error('Please log in to upload media.');

  const objectId = crypto.randomUUID();
  const path = `salon/${input.salonId}/${input.mediaType}/${objectId}.${extensionFor(input.file)}`;
  const { error: uploadError } = await client.storage
    .from(SALON_MEDIA_BUCKET)
    .upload(path, input.file, { cacheControl: '3600', upsert: false, contentType: input.file.type });
  if (uploadError) throw new Error(describeStorageError(uploadError, input.file));

  const { data, error } = await client
    .from('salon_media')
    .insert({
      salon_id: input.salonId,
      theme_id: input.themeId || null,
      service_id: input.serviceId || null,
      product_id: input.productId || null,
      media_type: input.mediaType,
      storage_bucket: SALON_MEDIA_BUCKET,
      storage_path: path,
      external_url: null,
      title: input.title?.trim() || null,
      description: input.description?.trim() || null,
      video_kind: input.videoKind || null,
      status: input.status || 'pending',
      display_order: input.displayOrder || 0,
      created_by: authData.user.id,
    })
    .select('id,salon_id,media_type,storage_path,external_url,title,description,video_kind,status,display_order')
    .single();

  if (error) {
    await client.storage.from(SALON_MEDIA_BUCKET).remove([path]);
    throw new Error('The file uploaded but its media record could not be saved. The upload was rolled back.');
  }

  const result = mapRow(data as unknown as Record<string, unknown>);
  const signedUrl = await createMediaSignedUrl(client, path);
  return { ...result, signedUrl };
}

export async function listPublicSalonMedia(
  salonId: string,
  mediaTypes?: SalonMediaType[],
): Promise<SalonMediaRecord[]> {
  const client = requireSupabase();
  let query = client
    .from('salon_media')
    .select('id,salon_id,media_type,storage_path,external_url,title,description,video_kind,status,display_order')
    .eq('salon_id', salonId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('display_order');
  if (mediaTypes?.length) query = query.in('media_type', mediaTypes);
  const { data, error } = await query;
  if (error) throw new Error('Unable to load salon media.');

  return Promise.all(((data ?? []) as Array<Record<string, unknown>>).map(async (row) => {
    const media = mapRow(row);
    if (!media.storagePath) return { ...media, signedUrl: media.externalUrl || undefined };
    const signedUrl = await createMediaSignedUrl(client, media.storagePath);
    return { ...media, signedUrl: signedUrl || media.externalUrl || undefined };
  }));
}

export async function deleteSalonMedia(record: Pick<SalonMediaRecord, 'id' | 'storagePath'>): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('salon_media').delete().eq('id', record.id);
  if (error) throw new Error('Unable to delete the media record.');
  if (record.storagePath) {
    const { error: storageError } = await client.storage.from(SALON_MEDIA_BUCKET).remove([record.storagePath]);
    if (storageError) console.error('Media metadata deleted but object cleanup failed:', storageError);
  }
}
