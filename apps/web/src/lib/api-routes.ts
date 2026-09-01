export const API_ROUTES = {
  auth: {
    me: "/api/auth/me",
    login: "/api/auth/login",
    register: "/api/auth/register",
    loginMfa: "/api/auth/login/mfa",
    logout: "/api/auth/logout",
    refresh: "/api/auth/refresh",
    exchange: "/api/auth/exchange",
    history: "/api/me/history",
    dashboard: "/api/me/dashboard",
  },
  challenges: {
    base: "/api/challenges",
    byId: (id: string) => `/api/challenges/${id}`,
    start: (id: string) => `/api/challenges/${id}/start`,
    history: (id: string) => `/api/me/challenges/${id}/history`,
  },
  sessions: {
    byId: (id: string) => `/api/session/${id}`,
    health: (sessionId: string) => `/api/session/${sessionId}/health`,
    checkResults: (sessionId: string) => `/api/session/${sessionId}/check-results`,
    terminateActive: "/api/session/active",
  },
  onboarding: {
    status: "/api/challenges/onboarding-status",
    complete: "/api/challenges/onboarding-status/complete",
  },
  roadmaps: {
    base: "/api/content/roadmaps",
    bySlug: (slug: string) => `/api/content/roadmaps/${slug}`,
    progress: (slug: string) => `/api/me/roadmaps/${slug}/progress`,
  },
  quizzes: {
    base: "/api/content/quizzes",
    bySlug: (slug: string) => `/api/content/quizzes/${slug}`,
    submit: (slug: string) => `/api/content/quizzes/${slug}/submit`,
    progress: (slug: string) => `/api/me/quizzes/${slug}/progress`,
    history: (slug: string) => `/api/me/quizzes/${slug}/history`,
  },
  flashcards: {
    base: "/api/content/flashcards",
  },
  articles: {
    base: "/api/articles",
    bySlug: (slug: string) => `/api/articles/${slug}`,
    create: "/api/articles",
  },
  assistant: {
    chat: "/api/assistant/chat",
  },
  orgs: {
    me: "/api/orgs/me",
    members: (orgId: string = "me") => `/api/orgs/${orgId}/members`,
    invites: (orgId: string = "me") => `/api/orgs/${orgId}/invites`,
    analytics: (orgId: string = "me") => `/api/orgs/${orgId}/analytics`,
    scenarios: (orgId: string = "me") => `/api/orgs/${orgId}/scenarios`,
    join: (token: string) => `/api/orgs/join/${token}`,
  },
  users: {
    profile: (username: string) => `/api/users/${username}/profile`,
    follow: (userId: string) => `/api/users/${userId}/follow`,
    feed: "/api/users/me/feed",
    discover: "/api/users/discover",
  },
  shares: {
    base: "/api/shares",
    byToken: (token: string) => `/api/shares/${token}`,
  },
  comments: {
    byChallenge: (challengeId: string) => `/api/challenges/${challengeId}/comments`,
    vote: (commentId: string) => `/api/comments/${commentId}/vote`,
    delete: (commentId: string) => `/api/comments/${commentId}`,
  },
  lists: {
    base: "/api/lists",
    byId: (id: string) => `/api/lists/${id}`,
    addItem: (id: string) => `/api/lists/${id}/items`,
    removeItem: (id: string, challengeId: string) => `/api/lists/${id}/items/${challengeId}`,
  },
};
