/**
 * Shared migration-file inventory for the offline (PGlite) test suites.
 *
 * The repository has an immutable Design-A M01–M27 history and a separate
 * canonical salon-keyed Design-B history beginning at M28. Keep selection
 * numeric and fail-closed: descriptive migration names must never be mistaken
 * for historical migrations merely because a new suffix was not added here.
 */

/** True only for the immutable M01–M27 Design-A migration files. */
export function isHistoricalMigration(name) {
  const match = /_m(\d{2})_/i.exec(name);
  if (!match) return false;
  const number = Number(match[1]);
  return number >= 1 && number <= 27;
}
