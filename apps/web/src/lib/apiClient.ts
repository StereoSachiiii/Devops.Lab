import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "./apiBase";
import { ApiError } from "./errors";
import type { ApiResult } from "./api-types";

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/auth/refresh`,
        {},
        { withCredentials: true }
      );
      return res.status === 200;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

const engine = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// A raw engine that treats 4xx responses as resolved (useful for validation endpoints
// that return 422 with useful payloads). It does not have the response interceptors
// that `engine` has, so we return `response.data` directly from helpers below.
const engineRaw = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
  validateStatus: (status) => status < 500,
});

function makeFailure(err: unknown): ApiResult<any> {
  if (err instanceof ApiError) {
    return { ok: false, error: err.message, status: err.status, code: err.code };
  }

  if (err instanceof AxiosError) {
    const status = err.response?.status || 500;
    const msg = (err.response?.data && (err.response!.data as any).message) || err.message || "Request failed";
    return { ok: false, error: msg, status };
  }

  const message = err instanceof Error ? err.message : String(err ?? "Request failed");
  return { ok: false, error: message, status: 500 };
}

engine.interceptors.response.use(
  (response) => {
    if (response.status === 204) return null;
    return response.data;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = originalRequest.url || "";
    
    const isRefreshRoute = url.includes("/api/auth/refresh");
    const isLoginRoute = url.includes("/api/auth/login");

    if (error.response?.status === 401 && !isRefreshRoute && !isLoginRoute && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const refreshed = await refreshTokens();
      if (refreshed) {
        return engine(originalRequest);
      }
    }

    let errorMsg = "Request failed";
    let code: string | undefined;
    const status = error.response?.status || 500;

    if (error.response?.data) {
      const serverData = error.response.data as any;
      errorMsg = serverData.error || serverData.message || errorMsg;
      code = serverData.code;
    } else {
      if (status === 502 || status === 503 || status === 504) {
        errorMsg = "Service unavailable — backend may not be running";
      }
    }

    return Promise.reject(new ApiError(errorMsg, status, code));
  }
);

export const apiClient = {
  // Generic helpers using the typed axios instance. These keep callsites concise
  // and strongly typed: `apiClient.get<T>(url)` -> Promise<T>
  get: <T = any>(url: string) => engine.get<T, T>(url),
  post: <T = any>(url: string, body?: any) => engine.post<T, T>(url, body),
  put: <T = any>(url: string, body?: any) => engine.put<T, T>(url, body),
  del: <T = any>(url: string) => engine.delete<T, T>(url),
  delete: <T = any>(url: string) => engine.delete<T, T>(url),

  // Raw variant that returns response data for 4xx payloads (useful for form
  // validation or sandbox validation endpoints that return 422 with details).
  rawPost: async <T = any>(url: string, body?: any) => {
    const res = await engineRaw.post<T>(url, body);
    return res.data as T;
  },

  // Safe helpers return a structured `ApiResult<T>` so callers can handle
  // success vs failure without relying solely on exceptions. Use these when
  // you want explicit success/error state handling in UI code.
  safeGet: async <T = any>(url: string): Promise<ApiResult<T>> => {
    try {
      const data = await engine.get<T, T>(url);
      return { ok: true, data: data as T, status: 200 };
    } catch (err) {
      return makeFailure(err);
    }
  },

  safePost: async <T = any>(url: string, body?: any): Promise<ApiResult<T>> => {
    try {
      const data = await engine.post<T, T>(url, body);
      return { ok: true, data: data as T, status: 200 };
    } catch (err) {
      return makeFailure(err);
    }
  },

  safeRawPost: async <T = any>(url: string, body?: any): Promise<ApiResult<T>> => {
    try {
      const res = await engineRaw.post<T>(url, body);
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, data: res.data as T, status: res.status };
      }
      return { ok: false, error: (res.data && (res.data as any).message) || "Request failed", status: res.status, data: res.data };
    } catch (err) {
      return makeFailure(err);
    }
  },

  safePut: async <T = any>(url: string, body?: any): Promise<ApiResult<T>> => {
    try {
      const data = await engine.put<T, T>(url, body);
      return { ok: true, data: data as T, status: 200 };
    } catch (err) {
      return makeFailure(err);
    }
  },

  safeDel: async <T = any>(url: string): Promise<ApiResult<T>> => {
    try {
      const data = await engine.delete<T, T>(url);
      return { ok: true, data: data as T, status: 200 };
    } catch (err) {
      return makeFailure(err);
    }
  },

  challenge: {
    getAll: () => engine.get<any, any>("/api/challenges"),
    getById: (id: string) => engine.get<any, any>(`/api/challenges/${id}`),
    start: (id: string) => engine.post<any, any>(`/api/challenges/${id}/start`),
  },

  sessions: {
    getById: (id: string) => engine.get<any, any>(`/api/session/${id}`),
    terminate: (id: string) => engine.delete<any, any>(`/api/session/${id}`),
  },

  auth: {
    login: (body: unknown) => engine.post<any, any>("/api/auth/login", body),
    loginMfa: (body: unknown) => engine.post<any, any>("/api/auth/login/mfa", body),
    logout: () => engine.post<any, any>("/api/auth/logout"),
  }
};

