import { requireSupabase } from './supabaseClient';

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

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm',
]);
const MAX_BYTES = 50 * 1024 * 1024;

function extensionFor(file: File): string {
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  return byType[file.type] || 'bin';
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
  if (!ALLOWED_TYPES.has(input.file.type)) throw new Error('Unsupported media file type.');
  if (input.file.size <= 0 || input.file.size > MAX_BYTES) throw new Error('Media must be 50 MB or smaller.');

  const client = requireSupabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error('Please log in to upload media.');

  const objectId = crypto.randomUUID();
  const path = `salon/${input.salonId}/${input.mediaType}/${objectId}.${extensionFor(input.file)}`;
  const { error: uploadError } = await client.storage
    .from(SALON_MEDIA_BUCKET)
    .upload(path, input.file, { cacheControl: '3600', upsert: false, contentType: input.file.type });
  if (uploadError) throw new Error('Unable to upload this media file.');

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
  const { data: signed } = await client.storage.from(SALON_MEDIA_BUCKET).createSignedUrl(path, 3600);
  return { ...result, signedUrl: signed?.signedUrl };
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
    const { data: signed, error: signError } = await client.storage
      .from(SALON_MEDIA_BUCKET)
      .createSignedUrl(media.storagePath, 3600);
    return { ...media, signedUrl: signError ? undefined : signed?.signedUrl };
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
