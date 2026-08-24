import type { SalonAddress, SalonData, SalonOpeningHours } from '../types';
import { initialData } from '../types';

/**
 * Truthful, non-persisted labels used only while an authenticated owner is
 * previewing an incomplete website. They explicitly describe missing fields;
 * unlike theme sample brands/contact details, they cannot be mistaken for the
 * owner's business information.
 */
export const OWNER_PREVIEW_EMPTY = {
  salonName: 'Business name not added',
  tagline: 'Tagline not added',
  about: 'About information not added.',
  phone: 'Phone not added',
  email: 'Email not added',
  address: 'Address not added',
  websiteAddress: 'Website address not added',
  ownerRole: 'Owner role not added',
  ownerIntro: 'Owner introduction not added.',
  hours: 'Opening hours not added',
} as const;

const emptyAddress = (): SalonAddress => ({
  fullAddress: '',
  area: '',
  city: '',
  state: '',
  pinCode: '',
});

/**
 * An authenticated owner must never hydrate on top of `initialData`: that
 * object intentionally contains a complete demonstration salon. Start from a
 * truthful empty business record while retaining only neutral UI defaults.
 */
export function emptyOwnerSalonData(): SalonData {
  return {
    templateId: initialData.templateId,
    salonName: '',
    tagline: '',
    ownerName: '',
    ownerRole: '',
    ownerPhotoUrl: '',
    about: '',
    phone: '',
    whatsappPhone: '',
    email: '',
    // Contact visibility and booking policy are business configuration, not
    // visual defaults. Leave both unset until the owner saves them; runtime
    // booking safeguards may still apply product defaults without writing the
    // demonstration salon's policy into this owner's website draft.
    contactOptions: undefined,
    bookingRules: undefined,
    logoUrl: '',
    heroImageUrl: '',
    heroPosition: initialData.heroPosition,
    gallery: [],
    socialProfiles: {},
    socialVideos: [],
    disabledThemeVideoIds: [],
    address: emptyAddress(),
    openingHours: undefined,
    announcements: [],
    holidays: [],
    services: [],
    packages: [],
    offers: [],
    team: [],
    websiteAppearance: initialData.websiteAppearance,
    templateConfig: initialData.templateConfig ? { ...initialData.templateConfig } : undefined,
    templateConfigs: initialData.templateConfigs ? { ...initialData.templateConfigs } : undefined,
    brandColor: initialData.brandColor,
    salonNameFont: initialData.salonNameFont,
    salonNameColor: initialData.salonNameColor,
    reviewedContent: {
      heroHeadline: '',
      tagline: '',
      about: '',
      ownerIntro: '',
      serviceDescriptions: {},
      bookingCTA: '',
    },
    websiteCopy: undefined,
    websiteSlug: '',
    publishState: 'draft',
    publishedUrl: '',
    metaDescription: '',
    socialShareImageUrl: '',
    metaTitle: '',
    metaKeywords: '',
    lastCompletedStep: 0,
  };
}

function hasAddress(address: SalonAddress | undefined): boolean {
  if (!address) return false;
  return [
    address.fullAddress,
    address.shopNumber,
    address.area,
    address.city,
    address.state,
    address.pinCode,
    address.landmark,
  ].some((value) => Boolean((value || '').trim()));
}

/**
 * Produces an ephemeral render record for the owner preview. Real values are
 * preserved exactly; missing public facts receive explicit "not added"
 * labels so downstream public-theme fallbacks cannot inject a sample salon,
 * Mumbai address, phone, email, biography, or opening schedule.
 *
 * This object must never be sent to persistence.
 */
export function ownerPreviewData(data: SalonData): SalonData {
  const salonName = (data.salonName || '').trim();
  const tagline = (data.tagline || '').trim();
  const about = (data.about || '').trim();
  const ownerName = (data.ownerName || '').trim();
  const ownerRole = (data.ownerRole || '').trim();
  const phone = (data.phone || '').trim();
  const email = (data.email || '').trim();
  const address = hasAddress(data.address)
    ? data.address
    : { ...emptyAddress(), fullAddress: OWNER_PREVIEW_EMPTY.address };

  // An empty object deliberately prevents renderer-specific default schedules
  // from being displayed. SiteSalonStatus supplies the matching empty label.
  const openingHours = data.openingHours
    || ({} as SalonOpeningHours);

  return {
    ...data,
    salonName: salonName || OWNER_PREVIEW_EMPTY.salonName,
    tagline: tagline || OWNER_PREVIEW_EMPTY.tagline,
    about: about || OWNER_PREVIEW_EMPTY.about,
    ownerName,
    ownerRole: ownerName ? (ownerRole || OWNER_PREVIEW_EMPTY.ownerRole) : '',
    phone: phone || OWNER_PREVIEW_EMPTY.phone,
    whatsappPhone: (data.whatsappPhone || '').trim() || undefined,
    email: email || OWNER_PREVIEW_EMPTY.email,
    address,
    openingHours,
    reviewedContent: {
      heroHeadline: data.reviewedContent?.heroHeadline || '',
      tagline: data.reviewedContent?.tagline || '',
      about: data.reviewedContent?.about || '',
      ownerIntro: ownerName
        ? ((data.reviewedContent?.ownerIntro || '').trim() || OWNER_PREVIEW_EMPTY.ownerIntro)
        : '',
      serviceDescriptions: data.reviewedContent?.serviceDescriptions || {},
      bookingCTA: data.reviewedContent?.bookingCTA || '',
    },
  };
}

/** Whether the owner supplied any visual that can represent their own work. */
export function ownerPreviewUsesOnlyTemplateImagery(data: SalonData): boolean {
  const hasHero = Boolean((data.heroImageUrl || '').trim());
  const hasGallery = (data.gallery || []).some((item) => Boolean((item.url || '').trim()));
  const hasServiceMedia = (data.services || []).some((service) =>
    Boolean(service.media?.imageUrl || service.media?.bannerUrl || service.media?.iconUrl),
  );
  return !hasHero && !hasGallery && !hasServiceMedia;
}
