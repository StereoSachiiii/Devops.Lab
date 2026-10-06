function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envUrl) {
    if (typeof window !== "undefined" && (envUrl.includes("localhost") || envUrl.includes("127.0.0.1"))) {
      try {
        const parsed = new URL(envUrl);
        const hostname = window.location.hostname || parsed.hostname;
        return `${parsed.protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ""}`;
      } catch {
        return envUrl;
      }
    }
    return envUrl;
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname || "localhost";
    return `http://${hostname}:8005`;
  }
  return "http://localhost:8005";
}

export const API_BASE_URL = getApiBaseUrl();
