import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "./apiBase";
import { ApiError } from "./errors";
import type {
  ApiResult,
  Challenge,
  Session,
  UserSession,
  Roadmap,
  RoadmapProgress,
  QuizNode,
  QuizProgress,
  SubmitResponse,
  FlashcardDeck,
  HistoryItem,
  StandardResponse,
} from "@devops/types";
import { API_ROUTES } from "./api-routes";

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await axios.post(
        `${API_BASE_URL}${API_ROUTES.auth.refresh}`,
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

function makeFailure<T = unknown>(err: unknown): ApiResult<T> {
  if (err instanceof ApiError) {
    return { ok: false, error: err.message, status: err.status, code: err.code };
  }

  if (err instanceof AxiosError) {
    const status = err.response?.status || 500;
    const msg =
      (err.response?.data && (err.response!.data as { message?: string }).message) ||
      err.message ||
      "Request failed";
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

    const isRefreshRoute = url.includes(API_ROUTES.auth.refresh);
    const isLoginRoute = url.includes(API_ROUTES.auth.login);

    if (
      error.response?.status === 401 &&
      !isRefreshRoute &&
      !isLoginRoute &&
      !originalRequest._retry
    ) {
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
      const serverData = error.response.data as { error?: string; message?: string; code?: string };
      errorMsg = serverData.error || serverData.message || errorMsg;
      code = serverData.code;
    } else {
      if (status === 502 || status === 503 || status === 504) {
        errorMsg = "Service unavailable - backend may not be running";
      }
    }

    return Promise.reject(new ApiError(errorMsg, status, code));
  }
);

export const apiClient = {
  get: <T = unknown>(url: string) => engine.get<T, T>(url),
  post: <T = unknown>(url: string, body?: unknown) => engine.post<T, T>(url, body),
  put: <T = unknown>(url: string, body?: unknown) => engine.put<T, T>(url, body),
  del: <T = unknown>(url: string) => engine.delete<T, T>(url),
  delete: <T = unknown>(url: string) => engine.delete<T, T>(url),


  rawPost: async <T = unknown>(url: string, body?: unknown) => {
    const res = await engineRaw.post<T>(url, body);
    return res.data as T;
  },


  safeGet: async <T = unknown>(url: string): Promise<ApiResult<T>> => {
    try {
      const data = await engine.get<T, T>(url);
      return { ok: true, data: data as T, status: 200 };
    } catch (err) {
      return makeFailure<T>(err);
    }
  },

  safePost: async <T = unknown>(url: string, body?: unknown): Promise<ApiResult<T>> => {
    try {
      const data = await engine.post<T, T>(url, body);
      return { ok: true, data: data as T, status: 200 };
    } catch (err) {
      return makeFailure<T>(err);
    }
  },

  safeRawPost: async <T = unknown>(url: string, body?: unknown): Promise<ApiResult<T>> => {
    try {
      const res = await engineRaw.post<T>(url, body);
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, data: res.data as T, status: res.status };
      }
      return {
        ok: false,
        error: (res.data && (res.data as { message?: string }).message) || "Request failed",
        status: res.status,
        data: res.data as T,
      };
    } catch (err) {
      return makeFailure<T>(err);
    }
  },

  safePut: async <T = unknown>(url: string, body?: unknown): Promise<ApiResult<T>> => {
    try {
      const data = await engine.put<T, T>(url, body);
      return { ok: true, data: data as T, status: 200 };
    } catch (err) {
      return makeFailure<T>(err);
    }
  },

  safeDel: async <T = unknown>(url: string): Promise<ApiResult<T>> => {
    try {
      const data = await engine.delete<T, T>(url);
      return { ok: true, data: data as T, status: 200 };
    } catch (err) {
      return makeFailure<T>(err);
    }
  },

  challenge: {
    getAll: () => engine.get<Challenge[], Challenge[]>(API_ROUTES.challenges.base),
    getById: (id: string) => engine.get<Challenge, Challenge>(API_ROUTES.challenges.byId(id)),
    start: (id: string) => engine.post<Session, Session>(API_ROUTES.challenges.start(id)),
    trial: (id: string) => engine.post<Session, Session>(API_ROUTES.challenges.trial(id)),
    getTrialStatus: (id: string) =>
      engine.get<{ eligible: boolean; trialUsed: boolean }, { eligible: boolean; trialUsed: boolean }>(API_ROUTES.challenges.trialStatus(id)),
    getHistory: (id: string) =>
      engine.get<HistoryItem[], HistoryItem[]>(API_ROUTES.challenges.history(id)),
    getEditorial: (id: string) => {
      type EditorialRes = {
        id: string;
        title: string;
        editorial: string;
        authorNotes?: string;
        code?: string;
        canUnlock?: boolean;
      };
      return engine.get<EditorialRes, EditorialRes>(`/api/challenges/${id}/editorial`);
    },
    getInteractions: (id: string) => {
      type InterRes = { likes: number; liked: boolean; saved: boolean };
      return engine.get<InterRes, InterRes>(`/api/challenges/${id}/interactions`);
    },
    like: (id: string) => {
      type LikeRes = { likes: number; liked: boolean };
      return engine.post<LikeRes, LikeRes>(`/api/challenges/${id}/like`);
    },
    save: (id: string) => {
      type SaveRes = { saved: boolean };
      return engine.post<SaveRes, SaveRes>(`/api/challenges/${id}/bookmark`);
    },
  },

  roadmaps: {
    getAll: (params?: { category?: string; tags?: string; search?: string }) =>
      engine.get<Roadmap[], Roadmap[]>(API_ROUTES.roadmaps.base, { params }),
    getBySlug: (slug: string) => engine.get<Roadmap, Roadmap>(API_ROUTES.roadmaps.bySlug(slug)),
    getProgress: (slug: string) =>
      engine.get<RoadmapProgress, RoadmapProgress>(API_ROUTES.roadmaps.progress(slug)),
  },

  quizzes: {
    getAll: () => engine.get<QuizNode[], QuizNode[]>(API_ROUTES.quizzes.base),
    getBySlug: (slug: string) => engine.get<QuizNode, QuizNode>(API_ROUTES.quizzes.bySlug(slug)),
    submit: (slug: string, body: unknown) =>
      engine.post<SubmitResponse, SubmitResponse>(API_ROUTES.quizzes.submit(slug), body),
    getProgress: (slug: string) =>
      engine.get<QuizProgress, QuizProgress>(API_ROUTES.quizzes.progress(slug)),
    getHistory: (slug: string) =>
      engine.get<HistoryItem[], HistoryItem[]>(API_ROUTES.quizzes.history(slug)),
  },

  flashcards: {
    getAll: () => engine.get<FlashcardDeck[], FlashcardDeck[]>(API_ROUTES.flashcards.base),
  },

  articles: {
    getAll: (params?: { query?: string; category?: string; tag?: string }) => {
      const sp = new URLSearchParams();
      if (params?.query) sp.set("query", params.query);
      if (params?.category) sp.set("category", params.category);
      if (params?.tag) sp.set("tag", params.tag);
      const q = sp.toString() ? `?${sp.toString()}` : "";
      return engine.get<import("@devops/types").Article[], import("@devops/types").Article[]>(
        `${API_ROUTES.articles.base}${q}`
      );
    },
    getBySlug: (slug: string) =>
      engine.get<import("@devops/types").Article, import("@devops/types").Article>(
        API_ROUTES.articles.bySlug(slug)
      ),
    create: (body: Partial<import("@devops/types").Article>) =>
      engine.post<import("@devops/types").Article, import("@devops/types").Article>(
        API_ROUTES.articles.create,
        body
      ),
    like: (id: string) =>
      engine.post<{ likes: number; liked: boolean }, { likes: number; liked: boolean }>(`/api/articles/${id}/like`),
    save: (id: string) =>
      engine.post<{ saves: number; saved: boolean }, { saves: number; saved: boolean }>(`/api/articles/${id}/bookmark`),
    report: (id: string, body: { reason: string; details?: string | undefined }) =>
      engine.post<StandardResponse, StandardResponse>(`/api/articles/${id}/report`, body),
  },

  assistant: {
    chat: (payload: string | { message?: string; messages?: Array<{ role: string; content: string }> }) => {
      const body = typeof payload === "string" ? { message: payload } : payload;
      return engine.post<{ content: string }, { content: string }>(API_ROUTES.assistant.chat, body);
    },
  },

  sessions: {
    getById: (id: string) => engine.get<Session, Session>(API_ROUTES.sessions.byId(id)),
    terminate: (id: string) =>
      engine.delete<StandardResponse, StandardResponse>(API_ROUTES.sessions.byId(id)),
    terminateActive: () =>
      engine.delete<StandardResponse, StandardResponse>(API_ROUTES.sessions.terminateActive),
    getHealth: (sessionId: string) =>
      engine.get<import("@devops/types").SandboxHealth, import("@devops/types").SandboxHealth>(API_ROUTES.sessions.health(sessionId)),
    checkWorkerHealth: (terminalUrl: string) => {
      const url = terminalUrl
        .replace("ws://", "http://")
        .replace("wss://", "https://")
        .replace("/terminal", "/health");
      return engine.get<any, any>(url);
    },
    getCheckResults: (sessionId: string) =>
      engine.get<import("@devops/types").CheckResult[], import("@devops/types").CheckResult[]>(API_ROUTES.sessions.checkResults(sessionId)),
  },

  auth: {
    me: () => engine.get<UserSession, UserSession>(API_ROUTES.auth.me),
    getProfile: () => engine.get<import("@devops/types").UserProfile, import("@devops/types").UserProfile>(API_ROUTES.auth.me),
    login: (body: unknown) => engine.post<UserSession, UserSession>(API_ROUTES.auth.login, body),
    register: (body: unknown) =>
      engine.post<UserSession, UserSession>(API_ROUTES.auth.register, body),
    loginMfa: (body: unknown) =>
      engine.post<UserSession, UserSession>(API_ROUTES.auth.loginMfa, body),
    loginSso: (body: { email: string }) =>
      engine.post<{ success: boolean; exchangeToken: string }, { success: boolean; exchangeToken: string }>(`/api/auth/login/sso`, body),
    logout: () => engine.post<StandardResponse, StandardResponse>(API_ROUTES.auth.logout),
    getHistory: () => engine.get<HistoryItem[], HistoryItem[]>(API_ROUTES.auth.history),
    getSessions: () => engine.get<import("@devops/types").ActiveSession[], import("@devops/types").ActiveSession[]>("/api/auth/sessions"),
    revokeSession: (sessionId: string) =>
      engine.post<StandardResponse, StandardResponse>(`/api/auth/sessions/${sessionId}/revoke`),
    getSecurityLog: () =>
      engine.get<import("@devops/types").SecurityLogResponse, import("@devops/types").SecurityLogResponse>("/api/auth/security-log"),
    setupMfa: () =>
      engine.post<any, any>("/api/auth/mfa/setup"),
    verifyMfa: (code: string) =>
      engine.post<StandardResponse, StandardResponse>("/api/auth/mfa/verify", { code }),
    verifyEmail: (token: string) =>
      engine.post<StandardResponse, StandardResponse>("/api/auth/verify-email", { token }),
    forgotPassword: (email: string) =>
      engine.post<StandardResponse, StandardResponse>("/api/auth/forgot-password", { email }),
    resetPassword: (body: { token: string; newPassword: string }) =>
      engine.post<StandardResponse, StandardResponse>("/api/auth/reset-password", body),
  },

  dashboard: {
    get: () => engine.get<import("@devops/types").DashboardData, import("@devops/types").DashboardData>(API_ROUTES.auth.dashboard),
    getLeaderboard: (params?: { category?: string; limit?: number }): Promise<any> => {
      const sp = new URLSearchParams();
      if (params?.category && params.category !== "ALL") sp.set("category", params.category);
      if (params?.limit) sp.set("limit", String(params.limit));
      const q = sp.toString() ? `?${sp.toString()}` : "";
      return engine.get<any, any>(`/api/leaderboard${q}`);
    },
  },

  users: {
    getPublicProfile: (username: string) =>
      engine.get<any, any>(API_ROUTES.users.profile(username)),
    follow: (userId: string) =>
      engine.post<{ following: boolean; followingCount: number; followersCount: number }, { following: boolean; followingCount: number; followersCount: number }>(API_ROUTES.users.follow(userId)),
    getFeed: () => engine.get<{ feed: any[] }, { feed: any[] }>(API_ROUTES.users.feed),
    discover: (q?: string) => {
      const queryStr = q ? `?q=${encodeURIComponent(q)}` : "";
      return engine.get<{ users: any[] }, { users: any[] }>(`${API_ROUTES.users.discover}${queryStr}`);
    },
  },

  org: {
    getMe: () => engine.get<any, any>(API_ROUTES.orgs.me),
    getMembers: (orgId: string = "me") => engine.get<any[], any[]>(API_ROUTES.orgs.members(orgId)),
    getAnalytics: (orgId: string = "me") => engine.get<any, any>(API_ROUTES.orgs.analytics(orgId)),
    getScenarios: (orgId: string = "me") => engine.get<any[], any[]>(API_ROUTES.orgs.scenarios(orgId)),
    getMatrix: () => engine.get<any[], any[]>("/api/orgs/me/assignments/matrix"),
    invite: (body: { email: string; role: string }) =>
      engine.post<any, any>(API_ROUTES.orgs.invites("me"), body),
  },

  lists: {
    getAll: () => engine.get<{ lists: any[] }, { lists: any[] }>(API_ROUTES.lists.base),
    getById: (id: string) => engine.get<any, any>(API_ROUTES.lists.byId(id)),
    create: (body: { name: string; isPublic?: boolean }) =>
      engine.post<any, any>(API_ROUTES.lists.base, body),
    addItem: (listId: string, challengeId: string) =>
      engine.post<any, any>(API_ROUTES.lists.addItem(listId), { challengeId }),
    removeItem: (listId: string, challengeId: string) =>
      engine.delete<any, any>(API_ROUTES.lists.removeItem(listId, challengeId)),
  },

  comments: {
    getByChallenge: (challengeId: string) =>
      engine.get<{ comments: any[] }, { comments: any[] }>(API_ROUTES.comments.byChallenge(challengeId)),
    post: (challengeId: string, body: { content: string; parentId?: string | undefined }) =>
      engine.post<any, any>(API_ROUTES.comments.byChallenge(challengeId), body),
    vote: (commentId: string, vote: number) =>
      engine.post<{ score: number; userVote: number }, { score: number; userVote: number }>(API_ROUTES.comments.vote(commentId), { vote }),
    delete: (commentId: string) =>
      engine.delete<any, any>(API_ROUTES.comments.delete(commentId)),
  },

  shares: {
    getByToken: <T = any>(token: string) =>
      engine.get<T, T>(API_ROUTES.shares.byToken(token)),
    create: (body: { challengeId: string }) =>
      engine.post<{ token: string; shareUrl: string; type: string }, { token: string; shareUrl: string; type: string }>(API_ROUTES.shares.base, body),
  },

  onboarding: {
    getStatus: () =>
      engine.get<import("@devops/types").OnboardingStatus, import("@devops/types").OnboardingStatus>(API_ROUTES.onboarding.status),
    complete: () =>
      engine.post<StandardResponse, StandardResponse>(API_ROUTES.onboarding.complete),
  },
};
