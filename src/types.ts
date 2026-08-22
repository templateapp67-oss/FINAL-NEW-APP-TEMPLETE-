import { DEFAULT_BRAND_CONFIG } from './config/brandConfig';

export type CatalogStatus = 'active' | 'inactive' | 'archived';
export type DiscountType = 'percentage' | 'fixed';
export type OfferTargetType = 'theme' | 'category' | 'predefined_service' | 'saved_service' | 'bundle';
export type OfferEffectiveStatus = CatalogStatus | 'scheduled' | 'expired';

export interface ServicePriceVariant {
  id: string;
  serviceId: string;
  name: string;
  price: number;
  duration?: number;
  status: CatalogStatus;
  displayOrder: number;
}

export interface ServiceMedia {
  imageUrl?: string;
  bannerUrl?: string;
  iconUrl?: string;
}

export interface ServiceTranslation {
  locale: 'en' | 'hi' | string;
  name: string;
  description: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  duration: number; // minutes
  featured?: boolean;
  /** Locale copies stored separately from the primary English record. */
  translations?: ServiceTranslation[];
  /** Theme-scoped service media. Never shared across themes. */
  media?: ServiceMedia;
  /** Database provenance for a saved predefined service. Custom/manual services
   * intentionally keep these nullable/undefined. */
  businessId?: string;
  themeId?: string | null;
  themeKey?: string;
  categoryId?: string | null;
  predefinedServiceId?: string | null;
  status?: CatalogStatus;
  /** Optional direct badge (for example Best Seller / New / Premium). */
  promotionalBadge?: string;
  /** Additional price choices. These never replace the base service row. */
  pricingVariants?: ServicePriceVariant[];
  selectedVariantId?: string;
  selectedVariantName?: string;
}

export interface BundleService {
  serviceId: string;
  name: string;
  category: string;
  individualPrice: number;
  duration: number;
  displayOrder: number;
}

export interface Package {
  id: string;
  name: string;
  description: string;
  /** Final bundle price after its preserved bundle discount. */
  price: number;
  duration: number; // minutes
  businessId?: string;
  themeId?: string | null;
  themeKey?: string;
  categoryId?: string | null;
  originalPrice?: number;
  discountType?: DiscountType;
  discountValue?: number;
  promotionalBadge?: string;
  status?: CatalogStatus;
  includedServices?: BundleService[];
}

export interface ServiceOffer {
  id: string;
  businessId: string;
  themeId: string;
  themeKey: string;
  targetType: OfferTargetType;
  categoryId: string | null;
  predefinedServiceId: string | null;
  savedServiceId: string | null;
  packageId: string | null;
  title: string;
  /** Optional customer-facing offer description (Phase 13 curated offers). */
  description?: string;
  /** Optional explicit service id list an offer applies to (Phase 13). */
  serviceIds?: string[];
  promotionalBadge: string;
  discountType: DiscountType;
  /** Percentage points for percentage offers; rupees for fixed offers. */
  discountValue: number;
  startDate: string;
  endDate: string;
  status: CatalogStatus;
  effectiveStatus: OfferEffectiveStatus;
}

export type StaffStatus = 'Available' | 'Busy' | 'On Leave' | 'Inactive';

export type AppAccessRole = 
  | 'Owner / Admin'
  | 'Manager'
  | 'Service Provider'
  | 'Receptionist / Frontdesk'
  | 'Limited Staff'
  | 'No App Access'
  | 'Manager (Full Access)' 
  | 'Service Provider (Assigned)' 
  | 'Receptionist (Frontdesk)';

export interface WeeklyScheduleDay {
  working: boolean;
  startTime: string; // e.g. "09:00 AM"
  endTime: string;   // e.g. "06:00 PM"
}

export type WeeklySchedule = Record<
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
  WeeklyScheduleDay
>;

export interface TeamMember {
  id: string;
  name: string;
  role: string; // Primary Role (e.g. Senior Stylist)
  customRole?: string;
  appAccessRole?: AppAccessRole;
  specialties: string[];
  imageUrl: string;
  bio?: string;
  phone?: string;
  commission?: number; // percentage, e.g. 15
  status?: StaffStatus;
  assignedServiceIds?: string[];
  hidePhoneFromPublic?: boolean;
  schedule?: WeeklySchedule;
  rating?: number;
}

export interface GalleryImage {
  id: string;
  url: string;
  /** Canonical private storage object path when this is a persisted upload. */
  storagePath?: string;
  alt?: string;
  category?: 'Interior' | 'Details' | 'Hair' | 'Barber' | 'Beauty' | 'General' | string;
  /**
   * PHASE 14.1 — optional theme scoping. An item scoped to a different theme
   * is never shown on the active theme's gallery (theme isolation).
   */
  themeId?: string | null;
  /**
   * PHASE 14.1 — before & after pair. When configured (and a safe image URL),
   * `url` is the AFTER image and `beforeUrl` the BEFORE image; the gallery
   * lightbox renders the pair with a drag slider.
   */
  beforeUrl?: string;
  beforeAlt?: string;
  /** Optional customer-facing caption under the lightbox preview. */
  caption?: string;
  /** Marks the image the gallery features as its spotlight/hero visual. */
  featured?: boolean;
  /**
   * PHASE 14.6 — owner gallery management fields (additive; never required by
   * the customer gallery so existing saved galleries keep working unchanged).
   */
  title?: string;
  description?: string;
  serviceId?: string | null;
  displayOrder?: number;
  status?: 'active' | 'inactive';
  /**
   * PHASE 14.7 — moderation state. Absent means "grandfathered approved", so
   * existing saved galleries stay visible; new uploads start `pending`.
   */
  moderation?: 'pending' | 'approved' | 'rejected';
  /** PHASE 14.7 — human-readable rejection reason (set on reject). */
  rejectionReason?: string;
  /** PHASE 14.7 — ISO timestamp of the last approve/reject review. */
  reviewedAt?: string;
}

export interface SocialProfiles {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
}

export interface SocialVideo {
  id: string;
  title: string;
  platform: 'instagram' | 'youtube' | 'facebook' | 'tiktok';
  /** External video URL only — Nexora never stores social video files. */
  url: string;
  /**
   * PHASE 15.7 — the exact platform URL supplied for this record. This is
   * never rewritten into a canonical, embed, channel, or tracking URL. Older
   * records fall back to `url` when read; every newly saved record sets both.
   */
  originalPlatformUrl?: string;
  thumbnailUrl: string;
  dateAdded?: string;
  likesCount?: string;
  /**
   * PHASE 15.1 — optional theme scoping. An item scoped to a different theme
   * is never shown on the active theme's video gallery (theme isolation).
   * Absent / null means the video is visible on every theme (grandfathered
   * for existing drafts that pre-date per-theme video collections).
   */
  themeId?: string | null;
  /**
   * PHASE 15.2 — platform-native video id (YouTube 11-char id, etc.).
   * Maps to existing `social_videos.external_video_id`. Set by URL auto-fetch.
   */
  externalVideoId?: string | null;
  /**
   * PHASE 15.2 — optional long description from platform metadata (oEmbed /
   * Open Graph). Additive client field; not required by the public gallery.
   */
  description?: string;
  /**
   * PHASE 15.2 — channel / page / author name from platform metadata.
   */
  channelName?: string;
  /**
   * PHASE 15.3 — short vs long discriminator for the video gallery.
   * Additive client field (no new DB column). When absent, kind is inferred
   * from the URL (YouTube Shorts / Instagram Reels → short; else long).
   */
  videoKind?: 'short' | 'long' | null;
  /**
   * PHASE 15.6 — lifecycle status. 'inactive' unpublishes the video from the
   * customer gallery without deleting the record. Absent = active.
   */
  status?: 'active' | 'inactive';
  /**
   * PHASE 15.6 — admin moderation state. Absent = grandfathered approved
   * (existing saved videos stay public, same rule as Phase 14.7 gallery).
   */
  moderation?: 'pending' | 'approved' | 'rejected';
  /** PHASE 15.6 — human-readable rejection reason (set on reject). */
  rejectionReason?: string;
  /** PHASE 15.6 — ISO timestamp of the last approve/reject review. */
  reviewedAt?: string;
  /**
   * PHASE 15.6 — when this owner/admin row customises a protected theme
   * showcase (mock) video, this holds the protected record id it replaces
   * (e.g. `theme:barber:s1`). The protected catalog record itself is never
   * mutated; deleting this row simply restores the showcase default.
   */
  replacesMockId?: string | null;
}

export interface SalonAddress {
  fullAddress: string;
  shopNumber?: string;
  area: string;
  city: string;
  state: string;
  pinCode: string;
  landmark?: string;
  /**
   * Canonical salon coordinates. Written by the owner location editor
   * (StepLocation) and read by the customer nearby search. Stored as
   * numbers; `undefined` means "not yet confirmed on the map".
   */
  latitude?: number;
  longitude?: number;
  locationConfirmedAt?: string;
}

export interface DaySchedule {
  open: boolean;
  startTime: string;
  endTime: string;
}

export interface SalonOpeningHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

/** Festival / seasonal / important / short custom website announcement. */
export type SalonAnnouncementKind = 'festival' | 'seasonal' | 'important' | 'custom';
export type SalonAnnouncementStatus = 'active' | 'inactive';
export type SalonAnnouncementCtaTarget = 'booking' | 'offers' | 'contact';

export interface SalonAnnouncementVariant {
  message: string;
  messageHi?: string;
  badge?: string;
  badgeHi?: string;
  ctaLabel?: string;
  ctaLabelHi?: string;
}

export interface SalonAnnouncement {
  id: string;
  kind: SalonAnnouncementKind;
  status: SalonAnnouncementStatus;
  /** Inclusive local calendar day `YYYY-MM-DD`. */
  startDate: string;
  /** Inclusive local calendar day `YYYY-MM-DD`. */
  endDate: string;
  /** When set, the announcement only appears on that theme. */
  themeId?: string | null;
  message: string;
  messageHi?: string;
  badge?: string;
  badgeHi?: string;
  ctaLabel?: string;
  ctaLabelHi?: string;
  ctaTarget?: SalonAnnouncementCtaTarget;
  /** Optional per-theme copy override (same dates / status as the parent). */
  variants?: Partial<Record<string, SalonAnnouncementVariant>>;
}

export interface SalonHoliday {
  /** Local calendar day `YYYY-MM-DD`. */
  date: string;
  name?: string;
  nameHi?: string;
  /** Defaults to closed when omitted. */
  closed?: boolean;
}

export interface EnabledContactOptions {
  callNow: boolean;
  whatsapp: boolean;
  bookNow: boolean;
}

export interface BookingRules {
  minNotice: string;
  maxAdvance: string;
  bufferTime: string;
  allowStaffSelection: boolean;
  advanceDepositPercentage: number;
}

export type WebsiteAppearance = 'light' | 'dark';

export interface ReviewedContent {
  heroHeadline: string;
  tagline: string;
  about: string;
  ownerIntro: string;
  serviceDescriptions: Record<string, string>;
  bookingCTA: string;
}

export type PublishState = 'draft' | 'publishing' | 'published';

export interface SalonData {
  /** Canonical backend salon UUID. Required for production booking/media writes. */
  salonId?: string;
  templateId?:
    | 'hair'
    | 'barber_mens_grooming'
    | 'hair_studio_color_bar'
    | 'beauty_skin_spa'
    | 'family_full_service'
    | 'nail_lash_studio'
    /** Legacy id kept only so saved family-salon drafts can be migrated in memory. */
    | 'family-salon';
  salonName: string;
  tagline: string;
  ownerName: string;
  ownerRole: string;
  /** Optional owner/founder portrait. Data URL or remote URL; persisted with salon draft. */
  ownerPhotoUrl?: string;
  /**
   * PHASE 12.1 — Trust/Stats figures the owner explicitly configures.
   * Absent (or ≤ 0) means the matching stat is HIDDEN on the public site;
   * the trust section never invents these numbers.
   */
  yearsOfExperience?: number;
  happyCustomers?: number;
  about: string;
  phone: string;
  email: string;
  whatsappPhone?: string;
  contactOptions?: EnabledContactOptions;
  bookingRules?: BookingRules;
  logoUrl?: string;
  heroImageUrl?: string;
  heroPosition?: 'Top' | 'Center' | 'Bottom';
  gallery?: GalleryImage[];
  socialProfiles?: SocialProfiles;
  socialVideos?: SocialVideo[];
  /**
   * PHASE 15.6 — ids of protected theme showcase (mock) video records an
   * admin has removed FOR THIS SALON ONLY. The protected catalog itself is
   * never mutated; the gallery fill path skips these ids so they stop
   * auto-appearing for this salon. Owners can never write this list.
   */
  disabledThemeVideoIds?: string[];
  address?: SalonAddress;
  openingHours?: SalonOpeningHours;
  /** Dated website announcements (festival / seasonal / important / custom). */
  announcements?: SalonAnnouncement[];
  /** Special closed dates. Weekly holidays remain `openingHours[day].open = false`. */
  holidays?: SalonHoliday[];
  services: Service[];
  packages: Package[];
  /** Theme-scoped promotions loaded for the current five-theme catalog. */
  offers?: ServiceOffer[];
  team: TeamMember[];
  websiteAppearance?: WebsiteAppearance;
  brandColor?: string;
  /** Brand identity: font preset id for the salon name (see SALON_NAME_FONTS). */
  salonNameFont?: string;
  /** Brand identity: text color (hex) for the salon name (see SALON_NAME_COLORS). */
  salonNameColor?: string;
  reviewedContent?: ReviewedContent;
  websiteSlug?: string;
  publishState?: PublishState;
  publishedUrl?: string;
  lastCompletedStep?: number;
}

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  monday: { working: true, startTime: '09:00 AM', endTime: '06:00 PM' },
  tuesday: { working: true, startTime: '09:00 AM', endTime: '06:00 PM' },
  wednesday: { working: true, startTime: '09:00 AM', endTime: '06:00 PM' },
  thursday: { working: true, startTime: '09:00 AM', endTime: '06:00 PM' },
  friday: { working: true, startTime: '09:00 AM', endTime: '07:00 PM' },
  saturday: { working: true, startTime: '10:00 AM', endTime: '05:00 PM' },
  sunday: { working: false, startTime: '10:00 AM', endTime: '04:00 PM' },
};

/**
 * Public Website Rule Helper:
 * Returns only safe public information for customer website display.
 * Never exposes appAccessRole, commission, internal status, private phone, or schedule.
 */
export function getPublicStaffData(member: TeamMember) {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    specialties: member.specialties,
    imageUrl: member.imageUrl,
    bio: member.bio,
    phone: member.hidePhoneFromPublic ? undefined : member.phone,
    rating: member.rating
  };
}

export const initialData: SalonData = {
  templateId: 'hair',
  salonName: DEFAULT_BRAND_CONFIG.defaultSalon.name,
  tagline: DEFAULT_BRAND_CONFIG.defaultSalon.tagline,
  ownerName: DEFAULT_BRAND_CONFIG.defaultSalon.ownerName,
  ownerRole: DEFAULT_BRAND_CONFIG.defaultSalon.ownerRole,
  ownerPhotoUrl: DEFAULT_BRAND_CONFIG.defaultSalon.ownerPhotoUrl,
  about: DEFAULT_BRAND_CONFIG.defaultSalon.about,
  phone: DEFAULT_BRAND_CONFIG.defaultSalon.phone,
  whatsappPhone: DEFAULT_BRAND_CONFIG.defaultSalon.whatsappPhone,
  email: DEFAULT_BRAND_CONFIG.defaultSalon.email,
  contactOptions: {
    callNow: true,
    whatsapp: true,
    bookNow: true
  },
  bookingRules: {
    minNotice: '1 hour',
    maxAdvance: '30 days',
    bufferTime: 'No buffer',
    allowStaffSelection: true,
    advanceDepositPercentage: 25
  },
  logoUrl: '',
  heroImageUrl: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?q=80&w=1000&auto=format&fit=crop',
  heroPosition: 'Center',
  gallery: [
    {
      id: 'g1',
      url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop',
      alt: 'Luxury salon interior in Mumbai with bright lighting',
      category: 'Interior'
    },
    {
      id: 'g2',
      url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=600&auto=format&fit=crop',
      alt: 'Close up of professional salon tools and shears',
      category: 'Details'
    },
    {
      id: 'g3',
      url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=600&auto=format&fit=crop',
      alt: 'Beautiful hair coloring and styling result',
      category: 'Hair'
    }
  ],
  socialProfiles: {
    instagram: DEFAULT_BRAND_CONFIG.defaultSalon.socialProfiles.instagram,
    facebook: DEFAULT_BRAND_CONFIG.defaultSalon.socialProfiles.facebook,
    youtube: DEFAULT_BRAND_CONFIG.defaultSalon.socialProfiles.youtube,
    tiktok: DEFAULT_BRAND_CONFIG.defaultSalon.socialProfiles.tiktok
  },
  address: {
    fullAddress: DEFAULT_BRAND_CONFIG.defaultSalon.address.fullAddress,
    shopNumber: DEFAULT_BRAND_CONFIG.defaultSalon.address.shopNumber,
    area: DEFAULT_BRAND_CONFIG.defaultSalon.address.area,
    city: DEFAULT_BRAND_CONFIG.defaultSalon.address.city,
    state: DEFAULT_BRAND_CONFIG.defaultSalon.address.state,
    pinCode: DEFAULT_BRAND_CONFIG.defaultSalon.address.pinCode,
    landmark: DEFAULT_BRAND_CONFIG.defaultSalon.address.landmark
  },
  openingHours: {
    monday: { open: true, startTime: '10:00', endTime: '20:00' },
    tuesday: { open: true, startTime: '10:00', endTime: '20:00' },
    wednesday: { open: true, startTime: '10:00', endTime: '20:00' },
    thursday: { open: true, startTime: '10:00', endTime: '20:00' },
    friday: { open: true, startTime: '10:00', endTime: '20:00' },
    saturday: { open: true, startTime: '10:00', endTime: '20:00' },
    sunday: { open: false, startTime: '10:00', endTime: '20:00' }
  },
  announcements: [
    {
      id: 'ann-rakhi-2026',
      kind: 'festival',
      status: 'active',
      startDate: '2026-08-01',
      endDate: '2026-08-20',
      message: 'Rakhi week — complimentary hot-towel finish with every booking.',
      messageHi: 'राखी सप्ताह — हर बुकिंग पर मुफ़्त हॉट-टॉवल फिनिश।',
      badge: 'Festival',
      badgeHi: 'त्योहार',
      ctaLabel: 'Book now',
      ctaLabelHi: 'अभी बुक करें',
      ctaTarget: 'booking',
      variants: {
        hair_studio_color_bar: {
          message: 'Rakhi color bar — complimentary gloss with every consult.',
          messageHi: 'राखी कलर बार — हर कंसल्ट पर मुफ़्त ग्लॉस।',
          badge: 'Festival',
          badgeHi: 'त्योहार',
          ctaLabel: 'Reserve a chair',
          ctaLabelHi: 'कुर्सी रिज़र्व करें',
        },
        beauty_skin_spa: {
          message: 'Rakhi glow ritual — complimentary add-on with every facial.',
          messageHi: 'राखी ग्लो रिचुअल — हर फेशियल पर मुफ़्त ऐड-ऑन।',
        },
        family_full_service: {
          message: 'Rakhi family week — book the whole crew in one visit.',
          messageHi: 'राखी फ़ैमिली वीक — पूरे परिवार को एक विज़िट में बुक करें।',
        },
        nail_lash_studio: {
          message: 'Rakhi glow edit — complimentary art accent on every set.',
          messageHi: 'राखी ग्लो एडिट — हर सेट पर मुफ़्त आर्ट एक्सेंट।',
        },
      },
    },
    {
      id: 'ann-winter-expired',
      kind: 'seasonal',
      status: 'active',
      startDate: '2026-01-01',
      endDate: '2026-01-15',
      message: 'Winter spa nights — 20% off evening slots.',
      messageHi: 'विंटर स्पा नाइट्स — शाम के स्लॉट पर 20% छूट।',
      badge: 'Seasonal',
      badgeHi: 'सीज़न',
    },
    {
      id: 'ann-important-off',
      kind: 'important',
      status: 'inactive',
      startDate: '2026-08-01',
      endDate: '2026-12-31',
      message: 'Temporary renovation — appointments by booking only.',
      messageHi: 'अस्थायी नवीनीकरण — केवल बुकिंग पर अपॉइंटमेंट।',
      badge: 'Notice',
      badgeHi: 'सूचना',
    },
  ],
  holidays: [
    { date: '2026-08-15', name: 'Independence Day', nameHi: 'स्वतंत्रता दिवस', closed: true },
  ],
  socialVideos: [
    {
      id: 'v1',
      title: 'Hair Spa & Scalp Massage ✨',
      platform: 'instagram',
      url: 'https://instagram.com/reel/12345',
      thumbnailUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=600&auto=format&fit=crop',
      dateAdded: 'Today',
      likesCount: '1.8k'
    },
    {
      id: 'v2',
      title: 'HD Bridal Glow Makeup 💄',
      platform: 'youtube',
      url: 'https://youtube.com/shorts/67890',
      thumbnailUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop',
      dateAdded: 'Yesterday',
      likesCount: '2.4k'
    }
  ],
  services: [
    {
      id: '1',
      name: 'Haircut & Blow-Dry Styling',
      category: 'Haircut',
      description: 'Classic and modern haircut tailored to your face shape, including head wash and blow-dry styling.',
      price: 350,
      duration: 30,
      featured: true
    },
    {
      id: '2',
      name: 'Nourishing Hair Spa',
      category: 'Treatment',
      description: 'Deep conditioning scalp massage and spa treatment to restore hydration, shine, and soft texture.',
      price: 900,
      duration: 45,
      featured: true
    },
    {
      id: '3',
      name: 'Ammonia-Free Hair Color',
      category: 'Hair Coloring',
      description: 'Full grey coverage or vibrant root touch-up with ammonia-free organic color products.',
      price: 1500,
      duration: 90
    },
    {
      id: '4',
      name: 'Keratin Hair Treatment',
      category: 'Treatment',
      description: 'Advanced smoothing keratin treatment to eliminate frizz and deliver long-lasting silky straight hair.',
      price: 3500,
      duration: 120
    },
    {
      id: '5',
      name: 'HD Bridal Makeup & Styling',
      category: 'Beauty',
      description: 'High-definition bridal makeup look with skin preparation, premium lashes, and saree/hair draping.',
      price: 4500,
      duration: 120,
      featured: true
    }
  ],
  packages: [
    {
      id: 'p1',
      name: 'Royal Bridal Glow Package',
      description: 'Complete head-to-toe bridal makeover including HD makeup, hair spa, facial, manicure & pedicure.',
      price: 8500,
      duration: 240
    },
    {
      id: 'p2',
      name: 'Executive Grooming & Spa Combo',
      description: 'Stylish haircut, precision beard sculpting, scalp massage, and refreshing facial setup.',
      price: 1200,
      duration: 75
    }
  ],
  brandColor: DEFAULT_BRAND_CONFIG.theme.primaryColor,
  websiteAppearance: 'light' as const,
  websiteSlug: '',
  publishState: 'draft' as const,
  publishedUrl: '',
  lastCompletedStep: 0,
  reviewedContent: {
    heroHeadline: DEFAULT_BRAND_CONFIG.defaultSalon.heroHeadline,
    tagline: DEFAULT_BRAND_CONFIG.defaultSalon.tagline,
    about: DEFAULT_BRAND_CONFIG.defaultSalon.about,
    ownerIntro: DEFAULT_BRAND_CONFIG.defaultSalon.ownerIntro,
    serviceDescriptions: {},
    bookingCTA: DEFAULT_BRAND_CONFIG.defaultSalon.bookingCTA
  },
  team: [
    {
      id: 't1',
      name: 'Rahul Sharma',
      role: 'Owner & Master Stylist',
      appAccessRole: 'Manager (Full Access)',
      specialties: ['Precision Haircut', 'Balayage', 'Salon Management'],
      imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
      bio: 'Rahul has over 12 years of experience in luxury haircutting and salon management across India.',
      phone: '+91 98765 43210',
      commission: 20,
      status: 'Available',
      assignedServiceIds: ['1', '2', '3', '4'],
      hidePhoneFromPublic: false,
      rating: 5.0,
      schedule: DEFAULT_WEEKLY_SCHEDULE,
    },
    {
      id: 't2',
      name: 'Ananya Verma',
      role: 'Senior Hair Specialist',
      appAccessRole: 'Service Provider (Assigned)',
      specialties: ['Hair Spa', 'Organic Coloring', 'Keratin Treatment'],
      imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
      bio: 'Ananya is an expert in organic hair coloring, customized keratin treatments, and hair spa therapy.',
      phone: '+91 98765 43211',
      commission: 15,
      status: 'Available',
      assignedServiceIds: ['1', '2', '3', '4'],
      hidePhoneFromPublic: true,
      rating: 4.9,
      schedule: DEFAULT_WEEKLY_SCHEDULE,
    },
    {
      id: 't3',
      name: 'Priya Patel',
      role: 'Bridal Makeup & Skin Therapist',
      appAccessRole: 'Service Provider (Assigned)',
      specialties: ['Bridal Makeup', 'HD Makeup', 'Skin Facials'],
      imageUrl: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?q=80&w=200&auto=format&fit=crop',
      bio: 'Priya specializes in flawless HD bridal makeups, pre-wedding skin prep, and calming facial treatments.',
      phone: '+91 98765 43212',
      commission: 15,
      status: 'On Leave',
      assignedServiceIds: ['5'],
      hidePhoneFromPublic: true,
      rating: 4.9,
      schedule: DEFAULT_WEEKLY_SCHEDULE,
    },
    {
      id: 't4',
      name: 'Vikram Singh',
      role: 'Senior Barber & Grooming Expert',
      appAccessRole: 'Service Provider (Assigned)',
      specialties: ['Beard Sculpting', 'Skin Fade', 'Hot Towel Shave'],
      imageUrl: 'https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=200&auto=format&fit=crop',
      bio: 'Vikram brings 8 years of mastery in classic barbershop techniques, beard styling, and hot towel treatments.',
      phone: '+91 98765 43213',
      commission: 15,
      status: 'Busy',
      assignedServiceIds: ['1'],
      hidePhoneFromPublic: true,
      rating: 4.8,
      schedule: DEFAULT_WEEKLY_SCHEDULE,
    }
  ]
};

