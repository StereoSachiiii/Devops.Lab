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
    try {
      const errorData = await response.json();
      errorMsg = errorData.error || errorMsg;
    } catch {
      // Ignore if response is not JSON
    }
    throw new Error(errorMsg);
  }

  if (response.status === 204) {
    return null as T;
  }

  try {
    return await response.json() as T;
  } catch {
    return null as T;
  }
}

export const apiClient = {
  get: <T = unknown>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: "POST", json: body }),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>(path, { ...options, method: "PUT", json: body }),
  delete: <T = unknown>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
};
