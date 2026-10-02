/**
 * Public application URL, used to build QR destinations and canonical links.
 * Falls back to the documented local default so a missing variable degrades to a
 * working local link instead of a broken one.
 */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return configured && configured.length > 0 ? configured : "http://localhost:3000";
}
