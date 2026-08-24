import type { SalonData } from '../types';

/**
 * The only in-memory SalonData fields a template operation is allowed to
 * change. Everything else is protected business/content data.
 */
export const TEMPLATE_PRESENTATION_FIELDS = [
  'templateId',
  'templateConfig',
  'templateConfigs',
  'websiteAppearance',
  'brandColor',
  'salonNameFont',
  'salonNameColor',
  'heroPosition',
] as const satisfies readonly (keyof SalonData)[];

type TemplatePresentationField = (typeof TEMPLATE_PRESENTATION_FIELDS)[number];

const TEMPLATE_PRESENTATION_FIELD_SET = new Set<keyof SalonData>(TEMPLATE_PRESENTATION_FIELDS);

/** Canonical database domains which a presentation switch must never mutate. */
export const TEMPLATE_SWITCH_PROTECTED_DOMAINS = [
  'business',
  'business_name',
  'owner',
  'address',
  'location',
  'services',
  'pricing',
  'products',
  'customers',
  'bookings',
  'payments',
] as const;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

/**
 * Snapshot every SalonData field except the explicit presentation allowlist.
 * This fails closed when new business fields are added to SalonData.
 */
export function snapshotTemplateSwitchProtectedData(data: SalonData): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !TEMPLATE_PRESENTATION_FIELD_SET.has(key as keyof SalonData))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, stableValue(value)]),
  );
}

export function templateSwitchProtectedRevision(data: SalonData): string {
  return JSON.stringify(snapshotTemplateSwitchProtectedData(data));
}

export function snapshotTemplateVisualConfig(data: SalonData): Pick<SalonData, TemplatePresentationField> {
  return Object.fromEntries(
    TEMPLATE_PRESENTATION_FIELDS.map((key) => [key, data[key]]),
  ) as Pick<SalonData, TemplatePresentationField>;
}

export function templateVisualConfigRevision(data: SalonData): string {
  const { templateId: _templateId, ...visualConfig } = snapshotTemplateVisualConfig(data);
  return JSON.stringify(stableValue(visualConfig));
}

/**
 * Runtime guard used for every local template transition. Reference equality
 * is intentional: a switch must not even recreate protected business arrays
 * or objects, which avoids accidental stale data replacement.
 */
export function assertTemplateSwitchPreservesBusiness(before: SalonData, after: SalonData): void {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as (keyof SalonData)[]);
  for (const key of keys) {
    if (TEMPLATE_PRESENTATION_FIELD_SET.has(key)) continue;
    if (!Object.is(before[key], after[key])) {
      throw new Error(`Template switch attempted to change protected SalonData field "${String(key)}".`);
    }
  }
}
