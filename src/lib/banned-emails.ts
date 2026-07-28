// List of permanently blacklisted emails
export const BANNED_EMAILS = new Set<string>([
  "eliasrohr11@gmail.com",
]);

export function isEmailBanned(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (BANNED_EMAILS.has(clean)) return true;
  for (const banned of BANNED_EMAILS) {
    if (clean.includes(banned)) return true;
  }
  return false;
}
