/**
 * Public-website slug + name normalization helpers.
 *
 * Slugs are stored lowercase, hyphen-separated and 3–60 characters long
 * (see `private.normalize_website_slug` and `salon_public_websites.slug`).
 * URLs, however, can arrive with mixed case, trailing slashes, URL-encoding,
 * underscores, spaces, or stray punctuation, so every lookup normalizes BOTH
 * sides before comparing. These helpers also turn a slug back into plausible
 * salon-name candidates so a route like `/royal-hair-studio` can fall back to
 * a name match ("Royal Hair Studio") when the exact slug column misses.
 */

/** Collapse arbitrary raw URL/path text into a canonical lowercase slug. */
export function normalizeSalonSlug(raw: string | null | undefined): string {
  let value = raw || '';
  try {
    value = decodeURIComponent(value);
  } catch {
    // Not valid URI encoding — keep the text as-is and normalize it below.
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '') // strip leading/trailing slashes
    .replace(/[^a-z0-9\s-]/g, ' ') // "royal_hair" / "royal.hair" -> "royal hair"
    .replace(/\s+/g, '-') // whitespace -> hyphen
    .replace(/-+/g, '-') // collapse repeated hyphens
    .replace(/^-+|-+$/g, ''); // trim stray hyphens
}

/** Normalize a salon display name for fuzzy comparison. */
export function normalizeSalonNameForMatch(name: string | null | undefined): string {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, ' and ') // "Royal Hair & Beauty Studio" -> "royal hair and beauty studio"
    .replace(/[^a-z0-9\s]/g, ' ') // strip remaining punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ordered name guesses derived from a slug, most-specific first.
 * `royal-hair-studio` -> ["royal hair studio", "royal hair"].
 * A single-word slug (e.g. `glamour`) keeps its single word; for multi-word
 * slugs the bare first word is dropped to avoid over-broad matches.
 */
export function slugNameCandidates(slug: string | null | undefined): string[] {
  const words = normalizeSalonSlug(slug).split('-').filter(Boolean);
  if (words.length === 0) return [];
  const phrases: string[] = [];
  for (let i = words.length; i >= 1; i--) {
    if (i === 1 && words.length > 1) continue;
    const phrase = words.slice(0, i).join(' ');
    if (phrase.length >= 2) phrases.push(phrase);
  }
  return Array.from(new Set(phrases));
}

/**
 * True when a salon name matches the slug-derived name candidates, using
 * word-boundary comparison so "Royal Hair & Beauty Studio" still matches the
 * `/royal-hair-studio` slug but "Royal Haircuts" does not.
 */
export function salonNameMatchesCandidates(
  name: string | null | undefined,
  slug: string | null | undefined,
): boolean {
  const target = normalizeSalonNameForMatch(name);
  if (!target) return false;
  return slugNameCandidates(slug).some((phrase) => {
    const candidate = normalizeSalonNameForMatch(phrase);
    if (!candidate || candidate.length < 2) return false;
    return (
      target === candidate ||
      target.startsWith(`${candidate} `) ||
      target.endsWith(` ${candidate}`) ||
      target.includes(` ${candidate} `)
    );
  });
}
