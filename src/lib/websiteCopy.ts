/**
 * WHITE-LABEL WEBSITE COPY — single resolver for the public (legacy) salon
 * template.
 *
 * The public template renderer must never hardcode customer-facing strings.
 * Every visible text is resolved through {@link resolveWebsiteCopy}:
 *
 *   built-in defaults  ←  data.websiteCopy (owner CMS / brand config)
 *
 * `data.websiteCopy` is persisted in `salon_public_websites.config`
 * (white-label CMS path) or the onboarding draft, so clients can rebrand the
 * entire public site — titles, CTAs, deposit copy, WhatsApp message, nav
 * labels — without touching UI logic. Unset fields keep their defaults, so
 * a partial override can never render empty labels.
 *
 * Dynamic values (salon name, advance-deposit percentage, address) are
 * resolved here so the renderer stays declarative.
 */
import type { SalonData, WebsiteCopy } from '../types';
import { DEFAULT_BRAND_CONFIG } from '../config/brandConfig';

export interface ResolvedWebsiteCopy {
  nav: {
    home: string;
    services: string;
    team: string;
    gallery: string;
    videos: string;
    contact: string;
  };
  heroBadge: string;
  heroHeadline: string;
  heroSubline: string;
  bookNowCta: string;
  servicesEyebrow: string;
  servicesTitle: string;
  servicesBody: string;
  bookSlotCta: string;
  packagesEyebrow: string;
  packagesTitle: string;
  packagesBody: string;
  bestValueBadge: string;
  bookBundleCta: string;
  ownerRoleFallback: string;
  ownerIntroFallback: string;
  teamEyebrow: string;
  teamTitle: string;
  teamBody: string;
  /** `{name}` already replaced with the stylist's first name. */
  bookWithLabel: (fullName: string) => string;
  galleryEyebrow: string;
  galleryTitle: string;
  galleryBody: string;
  galleryCategoryFallback: string;
  videosEyebrow: string;
  videosTitle: string;
  visitEyebrow: string;
  visitTitle: string;
  addressLabel: string;
  address: string;
  hoursLabel: string;
  closedLabel: string;
  defaultHoursDay: string;
  defaultHoursTime: string;
  directionsCta: string;
  contactTitle: string;
  callCta: string;
  whatsappCta: string;
  bookOnlineCta: string;
  depositTitle: string;
  depositBadge: string;
  depositBody: string;
  footerTagline: string;
  /** Pre-filled WhatsApp message with the salon name resolved. */
  whatsappMessage: string;
}

/** Default team title derived from the salon's actual service mix. */
export function defaultTeamTitle(data: SalonData): string {
  const serviceNames = (data.services || []).map((s) => `${s.name} ${s.category}`.toLowerCase()).join(' ');
  const salonLower = (data.salonName || '').toLowerCase();
  if (/(barber|fade|beard)/.test(serviceNames) || salonLower.includes('barber')) {
    return 'Meet Our Barbers';
  }
  if (/(facial|spa|massage|skin)/.test(serviceNames)) {
    return 'Our Experts';
  }
  return 'Meet Our Stylists';
}

function firstNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

/**
 * Resolves the full copy set for the public website. Pure function — safe
 * in jsdom/SSR, no storage or DOM access.
 */
export function resolveWebsiteCopy(data: SalonData): ResolvedWebsiteCopy {
  const brand = DEFAULT_BRAND_CONFIG.defaultSalon;
  const c: WebsiteCopy = data.websiteCopy || {};
  const pct = firstNumber(data.bookingRules?.advanceDepositPercentage, 25);
  const salonName = (data.salonName || brand.name).trim();

  const whatsappTemplate = c.whatsappMessage
    ?? 'Hi {salon}, I\'d like to book an appointment. Please share the available slots.';

  return {
    nav: {
      home: c.nav?.home ?? 'Home',
      services: c.nav?.services ?? 'Services',
      team: c.nav?.team ?? 'Team',
      gallery: c.nav?.gallery ?? 'Gallery',
      videos: c.nav?.videos ?? 'Videos',
      contact: c.nav?.contact ?? 'Contact',
    },
    heroBadge: c.heroBadge ?? 'Premier Hair & Beauty',
    heroHeadline: c.heroHeadline ?? data.tagline ?? 'Elevating your natural beauty and style',
    heroSubline: c.heroSubline ?? data.about ?? 'Experience world-class care, top-tier styling, and ultimate relaxation in our studio.',
    bookNowCta: c.bookNowCta ?? 'Book Appointment Now',

    servicesEyebrow: c.servicesEyebrow ?? 'Our Offerings',
    servicesTitle: c.servicesTitle ?? 'Signature Services & Pricing',
    servicesBody: c.servicesBody ?? 'Transparent pricing with secure advance booking options.',
    bookSlotCta: c.bookSlotCta ?? 'Book Slot',

    packagesEyebrow: c.packagesEyebrow ?? 'Special Combos',
    packagesTitle: c.packagesTitle ?? 'Value Packages & Bundles',
    packagesBody: c.packagesBody ?? 'Bundled treatments designed to save you time and money.',
    bestValueBadge: c.bestValueBadge ?? 'Best Value',
    bookBundleCta: c.bookBundleCta ?? 'Book Bundle',

    ownerRoleFallback: c.ownerRoleFallback ?? 'Founder & Master Stylist',
    ownerIntroFallback: c.ownerIntroFallback ?? 'We believe in personalized artistry and exceptional client care to ensure you leave feeling confident and rejuvenated.',

    teamEyebrow: c.teamEyebrow ?? 'Talented Professionals',
    teamTitle: c.teamTitle ?? defaultTeamTitle(data),
    teamBody: c.teamBody ?? 'Book your preferred expert for a tailored experience.',
    bookWithLabel: (fullName: string) =>
      (c.bookWithCta ?? 'Book with {name}').replace('{name}', fullName.split(' ')[0] || fullName),

    galleryEyebrow: c.galleryEyebrow ?? 'Visual Showcase',
    galleryTitle: c.galleryTitle ?? 'Our Space & Work Gallery',
    galleryBody: c.galleryBody ?? 'Explore our salon ambience and client transformations.',
    galleryCategoryFallback: c.galleryCategoryFallback ?? 'General',

    videosEyebrow: c.videosEyebrow ?? 'Social Feed',
    videosTitle: c.videosTitle ?? 'Reels & Styling Videos',

    visitEyebrow: c.visitEyebrow ?? 'Visit Us',
    visitTitle: c.visitTitle ?? 'Location & Hours',
    addressLabel: c.addressLabel ?? 'Studio Address',
    address: (data.address?.fullAddress || '').trim() || c.addressFallback || brand.address.fullAddress,
    hoursLabel: c.hoursLabel ?? 'Opening Hours',
    closedLabel: c.closedLabel ?? 'Closed',
    defaultHoursDay: c.defaultHoursDay ?? 'Mon - Sat',
    defaultHoursTime: c.defaultHoursTime ?? '10:00 AM - 8:00 PM',
    directionsCta: c.directionsCta ?? 'Get Directions',

    contactTitle: c.contactTitle ?? 'Ready to Transform Your Look?',
    callCta: c.callCta ?? 'Call Now',
    whatsappCta: c.whatsappCta ?? 'WhatsApp',
    bookOnlineCta: c.bookOnlineCta ?? 'Book Online',

    depositTitle: c.depositTitle ?? 'Online Booking Deposit',
    depositBadge: c.depositBadge ?? `${pct}% Advance`,
    depositBody:
      c.depositBody ??
      `Secure your appointment instantly with a ${pct}% advance deposit. Remaining payable at salon.`,

    footerTagline: c.footerTaglineFallback ?? 'Excellence in Hair & Beauty',
    whatsappMessage: whatsappTemplate.replace('{salon}', salonName),
  };
}

/**
 * Builds the WhatsApp deep link for a salon: `https://wa.me/<digits>` with a
 * pre-filled, encoded message (white-label overridable via
 * `websiteCopy.whatsappMessage`).
 */
export function buildWhatsAppHref(data: SalonData, copy: ResolvedWebsiteCopy): string {
  const digits = (data.whatsappPhone || data.phone || DEFAULT_BRAND_CONFIG.defaultSalon.whatsappPhone || '')
    .replace(/\D/g, '');
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  const message = (copy.whatsappMessage || '').trim();
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
