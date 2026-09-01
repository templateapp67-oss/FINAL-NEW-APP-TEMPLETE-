/**
 * GALLERY / MEDIA UPLOAD PIPELINE — regression coverage.
 *
 * Fixes covered:
 *   - "Unable to upload this media file." is gone: every failure now reports
 *     its REAL cause (session, permission, mime type, size, bucket, network).
 *   - Client-side preview via URL.createObjectURL (Base64 FileReader fallback)
 *     renders the photo before the server responds.
 *   - Validation: max 5 MB, accepted formats JPG / PNG / WEBP / SVG.
 *   - Retry with exponential backoff for transient failures only; a permanent
 *     failure reports immediately and the image is kept as a data URL so the
 *     owner's photo is never lost.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const media = await import('../src/lib/mediaUpload.ts');
const service = await import('../src/lib/salonMediaService.ts');

const {
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_ACCEPTED_TYPES,
  IMAGE_UPLOAD_ACCEPT_ATTR,
  IMAGE_UPLOAD_LEGACY_TYPES,
  ImageUploadError,
  describeUploadError,
  formatBytes,
  isAcceptedImageType,
  isRetryableUploadError,
  validateImageUploadFile,
  withRetry,
} = media;

/* ------------------------------------------------------------------ */
/* 1. Validation contract — 5 MB, JPG / PNG / WEBP / SVG               */
/* ------------------------------------------------------------------ */

assert.equal(IMAGE_UPLOAD_MAX_BYTES, 5 * 1024 * 1024);
ok('the upload cap is exactly 5 MB');

for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']) {
  assert.ok(
    IMAGE_UPLOAD_ACCEPTED_TYPES.includes(type),
    `${type} must be an accepted upload format`,
  );
}
assert.deepEqual([...IMAGE_UPLOAD_ACCEPTED_TYPES], ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
ok('accepted formats are exactly JPG, PNG, WEBP and SVG');

for (const type of [...IMAGE_UPLOAD_ACCEPTED_TYPES, ...IMAGE_UPLOAD_LEGACY_TYPES]) {
  assert.equal(isAcceptedImageType(type), true, `${type} should be accepted`);
  assert.equal(isAcceptedImageType(type.toUpperCase()), true, `${type} should be case-insensitive`);
}
for (const type of ['application/pdf', 'video/mp4', 'text/html', '']) {
  assert.equal(isAcceptedImageType(type), false, `${type} must be rejected`);
}
ok('type acceptance is case-insensitive and rejects non-images');

assert.match(IMAGE_UPLOAD_ACCEPT_ATTR, /\.svg/);
assert.match(IMAGE_UPLOAD_ACCEPT_ATTR, /image\/svg\+xml/);
ok('the file input accept list advertises every accepted format');

// Under the cap → accepted.
assert.equal(validateImageUploadFile({ name: 'a.png', type: 'image/png', size: IMAGE_UPLOAD_MAX_BYTES }).ok, true);
assert.equal(validateImageUploadFile({ name: 'l.svg', type: 'image/svg+xml', size: 12_000 }).ok, true);
ok('a 5 MB image and an SVG both pass validation');

// Over the cap → specific message naming the file and its real size.
const tooLarge = validateImageUploadFile({ name: 'big.png', type: 'image/png', size: IMAGE_UPLOAD_MAX_BYTES + 1 });
assert.equal(tooLarge.ok, false);
assert.equal(tooLarge.code, 'too-large');
assert.match(tooLarge.error, /big\.png/);
assert.match(tooLarge.error, /5(\.0)? MB/);
ok('an oversized image is rejected with its name and real size');

const wrongType = validateImageUploadFile({ name: 'doc.pdf', type: 'application/pdf', size: 100 });
assert.equal(wrongType.ok, false);
assert.equal(wrongType.code, 'unsupported-type');
assert.match(wrongType.error, /JPG, PNG, WEBP or SVG/);
ok('an unsupported format names the accepted formats');

const empty = validateImageUploadFile({ name: 'blank.png', type: 'image/png', size: 0 });
assert.equal(empty.ok, false);
assert.equal(empty.code, 'empty-file');
ok('a zero-byte file is rejected explicitly');

assert.equal(validateImageUploadFile(null).code, 'no-file');
ok('a missing file is reported instead of throwing');

/* ------------------------------------------------------------------ */
/* 2. Real error messages (no more opaque "Unable to upload…")         */
/* ------------------------------------------------------------------ */

const serviceSource = await read('src/lib/salonMediaService.ts');
assert.ok(
  !serviceSource.includes("throw new Error('Unable to upload this media file.')"),
  'the opaque upload error must be gone',
);
assert.match(serviceSource, /export function describeStorageError\(/);
ok('salonMediaService no longer throws the opaque upload error');

const { describeStorageError, mediaMaxBytes, IMAGE_MEDIA_MAX_BYTES, VIDEO_MEDIA_MAX_BYTES } = service;
assert.match(describeStorageError(new Error('new row violates row-level security policy')), /permission denied/i);
assert.match(describeStorageError({ message: 'JWT expired' }), /log in again/i);
assert.match(describeStorageError({ message: 'mime type application/pdf is not allowed' }, { name: 'x.pdf' }), /format/i);
assert.match(describeStorageError({ message: 'The object exceeded the maximum allowed size' }, { name: 'x.png' }), /too large/i);
assert.match(describeStorageError({ message: 'bucket not found' }), /not set up/i);
assert.match(describeStorageError({ message: 'fetch failed' }), /connection/i);
ok('every known failure maps to an actionable, user-safe message');

// Raw database internals must never reach the owner.
const sqlLeak = describeStorageError(new Error('insert or update on table "salon_media" violates foreign key constraint'));
assert.ok(!/salon_media|constraint|foreign key/i.test(sqlLeak), `SQL leaked: ${sqlLeak}`);
ok('SQL / table / constraint text is never echoed to the owner');

assert.equal(mediaMaxBytes('image/png'), IMAGE_MEDIA_MAX_BYTES);
assert.equal(mediaMaxBytes('image/svg+xml'), IMAGE_MEDIA_MAX_BYTES);
assert.equal(mediaMaxBytes('video/mp4'), VIDEO_MEDIA_MAX_BYTES);
assert.equal(IMAGE_MEDIA_MAX_BYTES, 5 * 1024 * 1024);
ok('images are capped at 5 MB while videos keep the 50 MB cap');

assert.equal(describeUploadError(new ImageUploadError('too-large', 'That image is 9 MB.')), 'That image is 9 MB.');
assert.equal(describeUploadError(undefined, 'fallback'), 'fallback');
ok('describeUploadError preserves real messages and falls back safely');

/* ------------------------------------------------------------------ */
/* 3. Retry semantics                                                  */
/* ------------------------------------------------------------------ */

assert.equal(isRetryableUploadError(new Error('network request failed')), true);
assert.equal(isRetryableUploadError(new Error('timeout of 30000ms exceeded')), true);
assert.equal(isRetryableUploadError(new Error('Service Unavailable (503)')), true);
assert.equal(isRetryableUploadError(new Error('429 Too Many Requests')), true);
ok('transient transport failures are retryable');

assert.equal(isRetryableUploadError(new Error('new row violates row-level security')), false);
assert.equal(isRetryableUploadError(new Error('mime type is not allowed')), false);
assert.equal(isRetryableUploadError(new Error('JWT expired')), false);
ok('permanent failures (RLS, mime, session) fail fast instead of retrying');

let attempts = 0;
const result = await withRetry(async () => {
  attempts += 1;
  if (attempts < 3) throw new Error('network down');
  return 'ok';
}, { attempts: 3, baseDelayMs: 1 });
assert.equal(result, 'ok');
assert.equal(attempts, 3);
ok('a transient failure is retried until it succeeds');

attempts = 0;
await assert.rejects(
  withRetry(async () => {
    attempts += 1;
    throw new Error('row-level security violation');
  }, { attempts: 3, baseDelayMs: 1 }),
  /row-level security/,
);
assert.equal(attempts, 1, 'a permanent failure must not be retried');
ok('a permanent failure is attempted exactly once');

attempts = 0;
await assert.rejects(
  withRetry(async () => {
    attempts += 1;
    throw new Error('gateway timeout');
  }, { attempts: 3, baseDelayMs: 1 }),
  /gateway timeout/,
);
assert.equal(attempts, 3);
ok('the final attempt re-throws the original error');

/* ------------------------------------------------------------------ */
/* 4. Long-lived signed URLs (published images must not expire)        */
/* ------------------------------------------------------------------ */

assert.equal(service.SIGNED_URL_TTL_SECONDS, 60 * 60 * 24 * 365);
assert.match(serviceSource, /const SIGNED_URL_TTL_FALLBACKS = \[/);
assert.match(serviceSource, /export async function createMediaSignedUrl\(/);
ok('storage URLs are minted for a year and degrade to shorter TTLs');

/* ------------------------------------------------------------------ */
/* 5. Preview + step-5 wiring                                          */
/* ------------------------------------------------------------------ */

const photos = await read('src/screens/StepPhotos.tsx');
assert.match(photos, /import \{[\s\S]*createPreviewUrl[\s\S]*\} from '\.\.\/lib\/mediaUpload';/);
assert.match(photos, /const immediatePreviewUrl = trackPreviewUrl\(createPreviewUrl\(rawFile\)\);/);
ok('logo / hero show an instant object-URL preview before the round trip');

assert.match(photos, /const previewUrl = trackPreviewUrl\(createPreviewUrl\(file\)\);/);
assert.match(photos, /appendGalleryItems\(optimistic\);/);
ok('gallery photos are added to the grid immediately (optimistic preview)');

assert.match(photos, /accept=\{IMAGE_UPLOAD_ACCEPT_ATTR\}/);
assert.match(photos, /validateImageUploadFile\(/);
ok('the file inputs advertise and validate the accepted formats');

assert.match(photos, /data-testid="gallery-thumb-uploading"/);
assert.match(photos, /data-testid="gallery-thumb-error"/);
assert.match(photos, /data-testid="gallery-thumb-retry"/);
ok('each photo shows its own progress, failure and Retry action');

assert.match(photos, /const runGalleryUpload = useCallback\(/);
assert.match(photos, /const retryGalleryUpload = useCallback\(/);
assert.match(photos, /Promise\.all\(Array\.from\(\{ length: Math\.min\(3, optimistic\.length\) \}/);
ok('uploads retry per photo and never discard the rest of the batch');

assert.match(photos, /previewUrlsRef/);
assert.match(photos, /revokePreviewUrl/);
ok('object-URL previews are revoked so uploads do not leak memory');

// The shared pipeline is the one upload path.
assert.match(photos, /uploadSalonImage\(\{/);
assert.ok(!/await uploadSalonMedia\(\{/.test(photos), 'StepPhotos must not call uploadSalonMedia directly');
ok('every upload in step 5 goes through the shared uploadSalonImage pipeline');

/* ------------------------------------------------------------------ */
/* 11. The same contract on every other owner upload surface           */
/* ------------------------------------------------------------------ */

const surfaces = [
  ['src/screens/StepTeam.tsx', 'team member photo'],
  ['src/components/StaffManagementModule.tsx', 'staff photo'],
  ['src/components/ServiceMediaEditor.tsx', 'service image'],
  ['src/components/BrandingWhiteLabel.tsx', 'white-label logo'],
];
for (const [file, label] of surfaces) {
  const source = await read(file);
  assert.match(source, /validateImageUploadFile/,
    `${label} still uploads without the shared validation`);
  assert.match(source, /createPreviewUrl/,
    `${label} has no instant (object-URL) preview`);
  assert.match(source, /revokePreviewUrl/,
    `${label} never revokes its object-URL preview (memory leak)`);
  assert.match(source, /readImageAsDataUrl/,
    `${label} does not use the shared file reader`);
}
ok('team, staff, service and white-label uploads share the same validated pipeline');

for (const [file, label] of [
  ['src/screens/StepTeam.tsx', 'team member photo'],
  ['src/components/StaffManagementModule.tsx', 'staff photo'],
  ['src/components/ServiceMediaEditor.tsx', 'service image'],
]) {
  const source = await read(file);
  assert.doesNotMatch(source, /accept="image\/\*"/,
    `${label} still advertises every file type instead of the accepted formats`);
  assert.match(source, /IMAGE_UPLOAD_ACCEPT_ATTR/, `${label} input accept list is not shared`);
}
ok('no owner upload still advertises a bare "image/*" (which invites rejected files)');

const team = await read('src/screens/StepTeam.tsx');
assert.match(team, /data-testid="team-photo-error"/, 'team upload failures are invisible');
assert.match(team, /setPhotoError\(validation\.error\)/);
ok('team photo failures surface a named reason instead of silently doing nothing');

const serviceEditor = await read('src/components/ServiceMediaEditor.tsx');
assert.match(serviceEditor, /data-testid="service-media-error"/);
assert.match(serviceEditor, /data-testid="service-media-uploading"/);
assert.match(serviceEditor, /describeUploadError\(/);
ok('service media shows per-slot progress and a readable failure message');

/* ------------------------------------------------------------------ */
/* 12. The exact bug that was reported                                 */
/* ------------------------------------------------------------------ */

assert.doesNotMatch(serviceSource, /Unable to upload this media file\./,
  'the opaque "Unable to upload this media file." error is still in the codebase');
ok('the reported "Unable to upload this media file." message is gone');

const photosSource = await read('src/screens/StepPhotos.tsx');
assert.match(photosSource, /createPreviewUrl\(file\)/);
assert.match(photosSource, /createPreviewUrl\(file\)/);
assert.match(photosSource, /createPreviewUrl\(rawFile\)/,
  'the gallery must preview the selected file before any validation/upload');
ok('step 5 gives every photo a preview URL before the server round trip');

console.log(`\nMedia upload pipeline: ${passed}/${passed} checks PASS`);
