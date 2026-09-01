/** Kong (or other API gateway) - browser calls this directly; no Next.js proxy. */
function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof window !== "undefined") {
    // If the page is visited at http://127.0.0.1:3000, call http://127.0.0.1:8005
    // If the page is visited at http://localhost:3000, call http://localhost:8005
    const hostname = window.location.hostname || "127.0.0.1";
    return `http://${hostname}:8005`;
  }
  return envUrl || "http://127.0.0.1:8005";
}

export const API_BASE_URL = getApiBaseUrl();


