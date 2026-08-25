/** Canonical Supabase project shared by browser and trusted server config. */
export const NEXORA_PROJECT_REF = 'qwaehqsmodekbgvnaavz';

export function supabaseProjectRefFromUrl(value: string): string | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    const suffix = '.supabase.co';
    if (!hostname.endsWith(suffix)) return null;
    const ref = hostname.slice(0, -suffix.length);
    return /^[a-z0-9]{20}$/.test(ref) ? ref : null;
  } catch {
    return null;
  }
}
