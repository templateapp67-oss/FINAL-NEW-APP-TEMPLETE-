/**
 * Owner publish-preparation checks.
 *
 * This is NOT a second publishing architecture. Publication still goes
 * through `publish_owner_salon_website` / `publishOwnerSalonWebsite` and
 * the Phase 1-A slug allocator. These rules only decide whether that
 * existing path may run, using the same required-information contract the
 * wizard already displays on StepPublishSetup.
 *
 * Customer booking and payment stay out of scope.
 */
import type { SalonData } from '../types';
import { isOwnerTemplateKey } from './ownerProvisioning';

export const PUBLISH_READY_LABEL = 'Ready to Publish';
export const PUBLISH_INCOMPLETE_LABEL = 'Complete Required Information';
export const PUBLISH_INCOMPLETE_ERROR =
  'Complete required business and template information before publishing.';

export type PublishReadinessItemId =
  | 'salon-details'
  | 'services'
  | 'contact'
  | 'template'
  | 'appearance'
  | 'reviewed';

export interface PublishReadinessItem {
  id: PublishReadinessItemId;
  label: string;
  required: true;
  done: boolean;
}

export interface PublishReadiness {
  ready: boolean;
  statusLabel: typeof PUBLISH_READY_LABEL | typeof PUBLISH_INCOMPLETE_LABEL;
  required: PublishReadinessItem[];
  optional: Array<{ id: 'team' | 'gallery'; label: string; done: boolean }>;
  missingLabels: string[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasSalonDetails(data: SalonData): boolean {
  return Boolean(text(data.salonName) && (text(data.tagline) || text(data.about)));
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
  return Boolean(data.websiteAppearance);
}

function hasReviewedContent(data: SalonData): boolean {
  const reviewed = data.reviewedContent;
  if (!reviewed) return false;
  return Boolean(
    text(reviewed.heroHeadline)
    || text(reviewed.tagline)
    || text(reviewed.about)
    || text(reviewed.bookingCTA)
    || (data.lastCompletedStep ?? 0) >= 9,
  );
}

/** Same required items the publish setup screen already lists. */
export function publishReadinessItems(data: SalonData): PublishReadinessItem[] {
  return [
    { id: 'salon-details', label: 'Salon details added', required: true, done: hasSalonDetails(data) },
    { id: 'services', label: 'Services added', required: true, done: hasServices(data) },
    { id: 'contact', label: 'Contact details added', required: true, done: hasContact(data) },
    { id: 'template', label: 'Template selected', required: true, done: hasTemplate(data) },
    { id: 'appearance', label: 'Website appearance selected', required: true, done: hasAppearance(data) },
    { id: 'reviewed', label: 'Website reviewed', required: true, done: hasReviewedContent(data) },
  ];
}

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
  };
}

export function assertPublishReady(data: SalonData): void {
  const readiness = evaluatePublishReadiness(data);
  if (!readiness.ready) {
    throw new Error(PUBLISH_INCOMPLETE_ERROR);
  }
}
