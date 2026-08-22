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
export function normalizeSlug(input: string): string {
  let value = input || '';
  try {
    value = decodeURIComponent(value);
  } catch {
    // Not valid URI encoding — normalize the text as-is.
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Ordered search variations derived from a slug, for name-based fallback
 * lookups. `royal-hair-studio` -> ["royal-hair-studio", "royal hair studio",
 * "Royal Hair Studio", "Royal Hair & Studio", "royal hair", "Royal Hair"].
 *
 * Progressive prefixes are included so a substring scan (`ilike %royal hair%`)
 * still matches a longer stored name like "Royal Hair & Beauty Studio".
 */
export function slugToNameCandidates(slug: string): string[] {
  const normalized = normalizeSlug(slug);
  const words = normalized.split('-').filter(Boolean);
  const spaceSeparated = words.join(' ');
  const titleCase = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const candidates = [
    normalized,
    spaceSeparated,
    titleCase,
    titleCase.replace(/ Hair /i, ' Hair & '), // "Royal Hair Studio" -> "Royal Hair & Studio"
  ];

  for (let i = words.length - 1; i >= 2; i--) {
    const prefix = words.slice(0, i).join(' ');
    candidates.push(prefix, prefix.replace(/\b\w/g, (c) => c.toUpperCase()));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
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
 * True when a salon name matches the slug-derived candidates, using
 * word-boundary comparison so "Royal Hair & Beauty Studio" still matches the
 * `/royal-hair-studio` slug but "Royal Haircuts" does not.
 */
export function salonNameMatchesCandidates(
  name: string | null | undefined,
  slug: string | null | undefined,
): boolean {
  const target = normalizeSalonNameForMatch(name);
  if (!target) return false;
  return slugToNameCandidates(slug).some((candidate) => {
    const cand = normalizeSalonNameForMatch(candidate);
    if (!cand || cand.length < 2) return false;
    return (
      target === cand ||
      target.startsWith(`${cand} `) ||
      target.endsWith(` ${cand}`) ||
      target.includes(` ${cand} `)
    );
  });
}
