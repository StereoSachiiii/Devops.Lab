import { ApiError } from "./errors";

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface RequestOptions extends RequestInit {
  json?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  
  if (options.json && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
    options.body = JSON.stringify(options.json);
  }

  options.headers = headers;

  let response = await fetch(path, options);

  // If unauthorized, attempt to refresh tokens once
  if (response.status === 401 && !path.includes("/api/auth/refresh") && !path.includes("/api/auth/login")) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      // Retry the original request
      response = await fetch(path, options);
    }
  }

  if (!response.ok) {
    let errorMsg = "Request failed";
    let code: string | undefined;
    try {
      const text = await response.text();
      if (text) {
        const errorData = JSON.parse(text);
        errorMsg = errorData.error || errorData.message || errorMsg;
        code = errorData.code;
      }
    } catch {
      // Non-JSON error body (e.g. Kong HTML error page)
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        errorMsg = "Service unavailable — backend may not be running";
      }
    }
    throw new ApiError(errorMsg, response.status, code);
  }

  if (response.status === 204) {
    return null as T;
  }

  try {
    const text = await response.text();
    if (!text) return null as T;
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("Invalid response from server", response.status);
  }
}

export const apiClient = {
  get: <T = unknown>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: "POST", json: body }),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: "PUT", json: body }),
  delete: <T = unknown>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
};
