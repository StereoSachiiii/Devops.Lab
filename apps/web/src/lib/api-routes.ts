
export const API_ROUTES = {
  auth: {
    me: "/api/auth/me",
    login: "/api/auth/login",
    loginMfa: "/api/auth/login/mfa",
    logout: "/api/auth/logout",
    refresh: "/api/auth/refresh",
  },
  challenges: {
    base: "/api/challenges",
    byId: (id: string) => `/api/challenges/${id}`,
    start: (id: string) => `/api/challenges/${id}/start`,
  },
  sessions: {
    byId: (id: string) => `/api/session/${id}`,
  }
};

