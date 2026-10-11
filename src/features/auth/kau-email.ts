export const KAU_EMAIL_DOMAIN = "kau.edu.sa";

// Mirrors public.normalize_kau_email in the database (the server re-checks).
const KAU_EMAIL_RE = /^[a-z0-9._%+'-]+@kau\.edu\.sa$/;

/** Returns the trimmed, lower-cased address if it is a KAU address, otherwise null. */
export function normalizeKauEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return KAU_EMAIL_RE.test(e) ? e : null;
}
