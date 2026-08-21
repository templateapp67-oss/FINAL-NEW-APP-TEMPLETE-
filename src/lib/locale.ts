export const SUPPORTED_LOCALES = ['en', 'hi'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: 'English',
  hi: 'हिन्दी',
};

export const DEFAULT_LOCALE: AppLocale = 'en';
const STORAGE_KEY = 'nexora_locale';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function readStoredLocale(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isAppLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function persistLocale(locale: AppLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore private-mode storage failures.
  }
}

export interface ContentTranslation {
  locale: AppLocale;
  name: string;
  description: string;
}

export function pickTranslation(
  translations: Array<{ locale: string; name: string; description?: string }> | undefined,
  locale: AppLocale,
): { locale: string; name: string; description?: string } | undefined {
  return translations?.find((item) => item.locale === locale);
}

export function localizedName(
  primary: string,
  translations: Array<{ locale: string; name: string; description?: string }> | undefined,
  locale: AppLocale,
): string {
  if (locale === DEFAULT_LOCALE) return primary;
  return pickTranslation(translations, locale)?.name || primary;
}

export function mapContentTranslations(raw: unknown): ContentTranslation[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.locale !== 'string' || typeof row.name !== 'string' || !row.name) return [];
    return [{
      locale: row.locale as AppLocale,
      name: row.name,
      description: typeof row.description === 'string' ? row.description : '',
    }];
  });
}

export function mapServiceMedia(raw: unknown): { imageUrl?: string; bannerUrl?: string; iconUrl?: string } | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const media = {
    imageUrl: typeof row.image_url === 'string' ? row.image_url : undefined,
    bannerUrl: typeof row.banner_url === 'string' ? row.banner_url : undefined,
    iconUrl: typeof row.icon_url === 'string' ? row.icon_url : undefined,
  };
  if (!media.imageUrl && !media.bannerUrl && !media.iconUrl) return undefined;
  return media;
}

export function localizedDescription(
  primary: string,
  translations: Array<{ locale: string; name: string; description?: string }> | undefined,
  locale: AppLocale,
): string {
  if (locale === DEFAULT_LOCALE) return primary;
  return pickTranslation(translations, locale)?.description || primary;
}
