/** Kong (or other API gateway) — browser calls this directly; no Next.js proxy. */
export const API_BASE_URL =
  process.env['NEXT_PUBLIC_API_BASE_URL'] ?? "http://localhost:8000";
