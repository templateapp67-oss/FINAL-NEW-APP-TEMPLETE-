/**
 * Owner publish-readiness validation.
 *
 * This is NOT a second publishing architecture. Publication still goes
 * through `publish_owner_salon_website` / `publishOwnerSalonWebsite` and
 * the Phase 1-A slug allocator. These rules decide whether that path may
 * run, using the SAME required-information contract the wizard already
 * enforces — nothing that is currently optional is invented as mandatory.
 *
 * Required items (existing business rules, mirrored 1:1 by the database
 * validator private.nexora_publish_missing_items in migration M50):
 *   - Business identity / name          (salonName)
 *   - Business tagline or About section (marketing identity)
 *   - Required service setup            (named service in draft or catalog)
 *   - Required business configuration   (phone / email / WhatsApp)
 *   - Active template selection         (one of the 5 themes, active row)
 *   - Required website configuration    (light/dark appearance)
 *   - Required website configuration    (content review step or reviewed copy)
 *
 * Deliberately OPTIONAL (existing rules — never promoted here):
 *   team, gallery, location/hours, offers, videos, payments,
 *   Razorpay/booking-advance configuration.
 */
import type { SalonData } from '../types';
import { isOwnerTemplateKey } from './ownerProvisioning';
import { STEP_CONTENT_REVIEW } from './ownerFlow';

export const PUBLISH_READY_LABEL = 'Ready to Publish';
export const PUBLISH_INCOMPLETE_LABEL = 'Complete these items before publishing:';
export const PUBLISH_INCOMPLETE_ERROR =
  'Complete these items before publishing: ';

export type PublishReadinessItemId =
  | 'business-name'
  | 'business-copy'
  | 'services'
  | 'contact'
  | 'template'
  | 'appearance'
  | 'reviewed';

export type PublishReadinessGroupId =
  | 'business-identity'
  | 'business-config'
  | 'template'
  | 'website-config'
  | 'services-content';

export interface PublishReadinessGroup {
  id: PublishReadinessGroupId;
  label: string;
}

export interface PublishReadinessItem {
  id: PublishReadinessItemId;
  group: PublishReadinessGroupId;
  label: string;
  required: true;
  done: boolean;
}

export interface PublishReadiness {
  ready: boolean;
  statusLabel: typeof PUBLISH_READY_LABEL | typeof PUBLISH_INCOMPLETE_LABEL;
  required: PublishReadinessItem[];
  optional: Array<{ id: 'team' | 'gallery'; label: string; done: boolean }>;
  /** Exactly what is incomplete, in display order. Empty when ready. */
  missingLabels: string[];
  groups: PublishReadinessGroup[];
  missingGroupLabels: string[];
}

export const PUBLISH_READINESS_GROUPS: PublishReadinessGroup[] = [
  { id: 'business-identity', label: 'Business identity' },
  { id: 'business-config', label: 'Required business configuration' },
  { id: 'template', label: 'Active template' },
  { id: 'website-config', label: 'Required website configuration' },
  { id: 'services-content', label: 'Required services & content' },
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasSalonName(data: SalonData): boolean {
  return Boolean(text(data.salonName));
}

function hasBusinessCopy(data: SalonData): boolean {
  return Boolean(text(data.tagline) || text(data.about));
}

function hasServices(data: SalonData): boolean {
  return Array.isArray(data.services) && data.services.some((service) => text(service?.name));
}

function hasContact(data: SalonData): boolean {
  return Boolean(text(data.phone) || text(data.email) || text(data.whatsappPhone));
}

function hasTemplate(data: SalonData): boolean {
  return isOwnerTemplateKey(data.templateId);
}

function hasAppearance(data: SalonData): boolean {
  return data.websiteAppearance === 'light' || data.websiteAppearance === 'dark';
}

function hasReviewedContent(data: SalonData): boolean {
  const reviewed = data.reviewedContent;
  if (!reviewed) return false;
  return Boolean(
    text(reviewed.heroHeadline)
    || text(reviewed.tagline)
    || text(reviewed.about)
    || text(reviewed.bookingCTA)
    // The owner completed (or passed) the AI content-review step in the
    // canonical flow: Login → Business Setup → Choose Template → Customize.
    || (data.lastCompletedStep ?? 0) >= STEP_CONTENT_REVIEW,
  );
}

/** Same required items the publish screen lists (client-side evaluation). */
export function publishReadinessItems(data: SalonData): PublishReadinessItem[] {
  return [
    {
      id: 'business-name',
      group: 'business-identity',
      label: 'Business name',
      required: true,
      done: hasSalonName(data),
    },
    {
      id: 'business-copy',
      group: 'business-identity',
      label: 'Business tagline or About section',
      required: true,
      done: hasBusinessCopy(data),
    },
    {
      id: 'services',
      group: 'services-content',
      label: 'Required service setup',
      required: true,
      done: hasServices(data),
    },
    {
      id: 'contact',
      group: 'business-config',
      label: 'Required business configuration (contact details)',
      required: true,
      done: hasContact(data),
    },
    {
      id: 'template',
      group: 'template',
      label: 'Active template selection',
      required: true,
      done: hasTemplate(data),
    },
    {
      id: 'appearance',
      group: 'website-config',
      label: 'Required website configuration (appearance)',
      required: true,
      done: hasAppearance(data),
    },
    {
      id: 'reviewed',
      group: 'website-config',
      label: 'Required website configuration (content review)',
      required: true,
      done: hasReviewedContent(data),
    },
  ];
}

/** Exactly the items the publish screen shows as complete/blocking. */
export function evaluatePublishReadiness(data: SalonData): PublishReadiness {
  const required = publishReadinessItems(data);
  const optional: PublishReadiness['optional'] = [
    {
      id: 'team',
      label: 'Team (Optional — can be added later)',
      done: Array.isArray(data.team) && data.team.length > 0,
    },
    {
      id: 'gallery',
      label: 'Gallery (Optional — can be added later)',
      done: Array.isArray(data.gallery) && data.gallery.length > 0,
    },
  ];
  const missingLabels = required.filter((item) => !item.done).map((item) => item.label);
  const ready = missingLabels.length === 0;
  return {
    ready,
    statusLabel: ready ? PUBLISH_READY_LABEL : PUBLISH_INCOMPLETE_LABEL,
    required,
    optional,
    missingLabels,
    groups: PUBLISH_READINESS_GROUPS,
    missingGroupLabels: Array.from(new Set(
      required.filter((item) => !item.done).map((item) => item.group),
    )).map((id) => PUBLISH_READINESS_GROUPS.find((group) => group.id === id)?.label || id),
  };
}

/**
 * Merge the database-authoritative missing list (returned by
 * `verify_owner_publish_readiness`, migration M50) into the local item set.
 * The database validates the persisted draft/business row as well as the
 * config being published, so it can confirm, e.g., that the chosen template
 * has an active theme row or that the canonical service catalog serves the
 * public website.
 */
export function readinessFromMissingLabels(
  local: PublishReadiness,
  missingLabels: string[],
): PublishReadiness {
  const set = new Set(missingLabels);
  const required = local.required.map((item) => ({ ...item, done: !set.has(item.label) }));
  const ready = set.size === 0;
  return {
    ...local,
    required,
    ready,
    statusLabel: ready ? PUBLISH_READY_LABEL : PUBLISH_INCOMPLETE_LABEL,
    missingLabels: required.filter((item) => !item.done).map((item) => item.label),
    missingGroupLabels: Array.from(new Set(
      required.filter((item) => !item.done).map((item) => item.group),
    )).map((id) => PUBLISH_READINESS_GROUPS.find((group) => group.id === id)?.label || id),
  };
}

export function assertPublishReady(data: SalonData): void {
  const readiness = evaluatePublishReadiness(data);
  if (!readiness.ready) {
    throw new Error(PUBLISH_INCOMPLETE_ERROR + readiness.missingLabels.join('; '));
  }
}
