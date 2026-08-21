/**
 * Owner / founder profile helpers.
 *
 * Photo + role live on `SalonData` (`ownerPhotoUrl`, `ownerRole`) and persist
 * through the existing localStorage onboarding payload. This maps to the draft
 * `business_owners.photo_url` / `role_title` columns without changing storage.
 */

export const OWNER_ROLES = [
  'Founder',
  'Co-Founder',
  'Owner',
  'Managing Director',
  'Creative Director',
  'Master Stylist',
  'Senior Stylist',
  'Salon Manager',
  'Director',
  'Founder & Master Stylist',
  'Other',
] as const;

export type OwnerRoleOption = (typeof OWNER_ROLES)[number];

/** Matches the logo upload hint used in Step Photos. */
export const OWNER_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export const OWNER_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/jpg';

const PRESET_ROLES_WITHOUT_OTHER: readonly string[] = OWNER_ROLES.filter(role => role !== 'Other');

export function isPresetOwnerRole(role?: string): role is OwnerRoleOption {
  return !!role && (OWNER_ROLES as readonly string[]).includes(role);
}

/** Value to bind on the role <select>. Custom titles map to "Other". */
export function getOwnerRoleSelectValue(ownerRole?: string): '' | OwnerRoleOption {
  if (!ownerRole?.trim()) return '';
  if (PRESET_ROLES_WITHOUT_OTHER.includes(ownerRole)) return ownerRole as OwnerRoleOption;
  return 'Other';
}

export function isCustomOwnerRole(ownerRole?: string): boolean {
  return getOwnerRoleSelectValue(ownerRole) === 'Other';
}

/** Text shown in the custom-role field when "Other" is selected. */
export function getCustomOwnerRoleText(ownerRole?: string): string {
  if (!ownerRole || ownerRole === 'Other') return '';
  return isCustomOwnerRole(ownerRole) ? ownerRole : '';
}

export function resolveOwnerRoleFromSelect(selectValue: string, currentRole?: string): string {
  if (!selectValue) return '';
  if (selectValue === 'Other') {
    if (currentRole && !PRESET_ROLES_WITHOUT_OTHER.includes(currentRole)) {
      return currentRole;
    }
    return 'Other';
  }
  return selectValue;
}

export function validateOwnerPhoto(file: File | null | undefined): string | null {
  if (!file) return 'Please choose a photo.';
  const type = (file.type || '').toLowerCase();
  if (!type.startsWith('image/')) {
    return 'Please upload an image file (JPG, PNG, WEBP, or GIF).';
  }
  if (file.size > OWNER_PHOTO_MAX_BYTES) {
    return 'Photo must be 2 MB or smaller.';
  }
  return null;
}

export function readOwnerPhotoAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Could not read that photo. Try another image.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Could not read that photo. Try another image.'));
    reader.readAsDataURL(file);
  });
}

export function getOwnerInitials(name?: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'O';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
