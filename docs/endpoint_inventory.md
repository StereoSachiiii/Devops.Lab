# DevOps.lab System Endpoint Inventory & Routing Specification

> Generated as part of Phase 0 Research for the comprehensive End-to-End Smoke Test & Mini Demo Suite.
> **Source of Truth**: Active service implementation code (`services/auth`, `services/core`, `services/sandbox`, `services/notification`, `infra/kong/kong.yml`).

---

## 1. Network Topology & Routing Architecture

In local development and production, the platform exposes services via **Kong API Gateway** as the edge reverse proxy, with specific direct ports exposed for microservice communication and debugging:

| Component | Container Port | Host Port | Routing via Kong (Port 8005 / 8000) | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Kong API Gateway** (Proxy) | `8000` | `8005` | Entry point for browser clients | Default local port in `.env` is `8005` |
| **Kong Admin API** | `8001` | `8001` | Direct only (`/status`, `/routes`, etc.) | Used for gateway health checking |
| **PostgreSQL** | `5432` | `5444` | Direct connection only | Host port `5444` mapped to container `5432` |
| **Redis** | `6379` | `6379` | Direct connection only | Used for session locks, caching, token denylists |
| **RabbitMQ** | `5672` / `15672`| `5672` / `15672`| Direct connection only | Port `15672` exposes Management REST API |
| **Redpanda (Kafka)** | `9092` / `19092`| `19092` | Direct connection only | Port `19092` advertised for host services |
| **Auth Service** | `3002` | `3002` | Proxied via `/api/auth/*` (`strip_path: true`) | Direct access on `http://localhost:3002` |
| **Core Service** | `3003` | `3003` | Proxied via `/api/*` (`strip_path: false`/`true`) | Direct access on `http://localhost:3003` |
| **Sandbox Router** | `8080` | `8080` | Proxied via `/sessions/*`, `/validate/*` | Direct access on `http://localhost:8080` |
| **Sandbox Worker** | `8090` | `8090` | Routed via `sandbox-router` (or direct) | Spawns guest challenge containers |
| **Notification Service** | `3004` | `3004` | Internal event consumer (Kafka/RabbitMQ) | Direct access on `http://localhost:3004` |

---

## 2. Comprehensive Service Endpoint Inventory

### A. Auth Service (`services/auth`)
* **Base Direct URL**: `http://localhost:3002`
* **Kong Gateway Prefix**: `http://localhost:8005/api/auth` (Kong `strip_path: true` strips `/api/auth` before forwarding)

| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | *(Direct only)* | `/health` | No | None | `{ status: "ok" \| "degraded", service: "auth-service", checks: { kafka, redis, db }, timestamp }` | Code returns `503` if degraded. |
| `GET` | *(Direct only)* | `/metrics` | No | None | Prometheus text format | Standard Prometheus exporter. |
| `GET` | `/api/auth/public-key` | `/public-key` | No | None | `{ publicKey: string }` | Returns RS256 public key. |
| `POST`| `/api/auth/register` | `/register` | No | `{ email, password, name? }` | `201 Created`: `{ user: { id, email, role }, token }` | Emits `UserRegisteredEvent` to Outbox. |
| `POST`| `/api/auth/login` | `/login` | No | `{ email, password }` | `200 OK`: `{ token, user: { id, email, role } }` (or `{ mfaRequired: true, mfaToken }`) + `Set-Cookie: token, refreshToken` | Rate-limited (5 attempts -> lockout). |
| `POST`| `/api/auth/guest-token` | `/guest-token` | No | `{ guestId: string }` | `200 OK`: `{ token, guestUserId }` | Signs ephemeral 15m guest token. |
| `POST`| `/api/auth/refresh` | `/refresh` | Cookie (`refreshToken`) | None | `200 OK`: `{ token, user }` + rotated `Set-Cookie` | Enforces single-use rotation with 10s grace window. |
| `GET` | `/api/auth/me` | `/me` | JWT (Bearer or Cookie) | None | `200 OK`: `User` profile object + `hasPassword: boolean` | Returns stats, badges, notification prefs. |
| `PUT` | `/api/auth/me` | `/me` | JWT | `{ name?, jobTitle? }` | `200 OK`: `{ success: true, message, user }` | Updates basic profile fields. |
| `DELETE`| `/api/auth/me` | `/me` | JWT | None | `200 OK`: `{ success: true }` + clears cookies | Cascading account deletion + outbox event. |
| `POST`| `/api/auth/change-password` | `/change-password` | JWT | `{ currentPassword, newPassword }` | `200 OK`: `{ success: true }` | Argon2 password update. |
| `POST`| `/api/auth/logout` | `/logout` | Optional JWT | None (reads cookie) | `200 OK`: `{ success: true }` + clears cookies | Denylists access token `jti` in Redis. |
| `POST`| `/api/auth/logout-all` | `/logout-all` | JWT | None | `200 OK`: `{ success: true }` + clears cookies | Nukes all active sessions in Redis. |
| `GET` | `/api/auth/sessions` | `/sessions` | JWT | None | `200 OK`: `UserSession[]` | Returns active device/browser sessions. |
| `POST`| `/api/auth/sessions/:sessionId/revoke` | `/sessions/:sessionId/revoke` | JWT | None | `200 OK`: `{ success: true }` | Targeted single-session revocation. |
| `GET` | `/api/auth/security-log` | `/security-log` | JWT | Query: `?page=1&limit=20` | `200 OK`: `{ logs: SecurityLog[], total, page, limit }` | Paginated user audit events. |
| `POST`| `/api/auth/verify-email` | `/verify-email` | No | `{ token: string }` | `200 OK`: `{ success: true }` | Consumes Redis verification token. |
| `POST`| `/api/auth/forgot-password` | `/forgot-password` | No | `{ email: string }` | `200 OK`: `{ success: true, message }` | Always returns success to prevent enumeration. |
| `POST`| `/api/auth/reset-password` | `/reset-password` | No | `{ token, newPassword }` | `200 OK`: `{ success: true }` | Resets password via Redis reset token. |
| `POST`| `/api/auth/exchange` | `/exchange` | No | `{ exchange_token: string }` | `200 OK`: `{ user }` + sets session cookies | Single-use OAuth exchange endpoint. |
| `POST`| `/api/auth/mfa/setup` | `/mfa/setup` | JWT | None | `200 OK`: `{ secret, qrCodeUrl }` | Generates TOTP secret. |
| `POST`| `/api/auth/mfa/verify` | `/mfa/verify` | JWT | `{ code: string }` | `200 OK`: `{ success: true }` | Confirms code and enables MFA. |
| `POST`| `/api/auth/login/mfa` | `/login/mfa` | No | `{ mfaToken, code }` | `200 OK`: `{ token, user }` + sets cookies | Finalizes login with TOTP code. |
| `GET` | `/api/auth/login/github/callback` | `/login/github/callback` | No | Query: `?code=...` | `302 Redirect` to `/auth/callback?exchange_token=...` | OAuth code exchange. |
| `GET` | `/api/auth/login/google/callback` | `/login/google/callback` | No | Query: `?code=...` | `302 Redirect` to `/auth/callback?exchange_token=...` | OAuth code exchange. |
| `POST`| `/api/auth/login/sso` | `/login/sso` | No | `{ email, orgSlug?, ssoId?, name?, avatarUrl? }` | `200 OK`: `{ success: true, exchangeToken, org }` | Enterprise SAML/OIDC SSO handler. |

---

### B. Core Service (`services/core`)
* **Base Direct URL**: `http://localhost:3003`
* **Kong Gateway Prefix**: Directly routed under `/api/*` based on route rules

#### 1. System, Health & Metrics
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | *(Direct only)* | `/health` | No | None | `{ status: "ok" \| "degraded", service: "core-service", checks: { kafka, db }, timestamp }` | Caches results for 30s. |
| `GET` | *(Direct only)* | `/metrics` | No | None | Prometheus text format | Standard Prometheus metrics. |

#### 2. Challenges & Session Lifecycle (`challenge.routes.ts`)
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/challenges` | `/api/challenges` | Optional JWT | None | `200 OK`: `Challenge[]` | Filters by organization if authenticated. |
| `GET` | `/api/challenges/:id` | `/api/challenges/:id` | Optional JWT | None | `200 OK`: `Challenge` object with module details | Returns 404 if missing, 403 if foreign org. |
| `GET` | `/api/challenges/:id/editorial` | `/api/challenges/:id/editorial` | JWT | None | `200 OK`: `{ id, title, category, difficulty, editorial, authorNotes }` | **Gatekept**: returns `403 EDITORIAL_LOCKED` unless solved or ADMIN/CONTRIBUTOR. |
| `POST`| `/api/challenges/:id/start` | `/api/challenges/:id/start` | JWT | None | `201 Created`: `{ sessionId, challengeId, challengeTitle, terminalUrl, validateUrl, ttlMins }` | Publishes job to RabbitMQ queue `provision.sandbox.docker`. Returns existing session if alive. |
| `GET` | `/api/session/:id` | `/api/session/:id` | No | None | `200 OK`: `{ id, status, startedAt, endedAt, challenge: { id, title, dockerImage } }` | Fetches session state from Postgres. |
| `GET` | `/api/session/:id/health` | `/api/session/:id/health` | No | None | `200 OK`: `{ alive: boolean }` | Probes sandbox-router health for session. |
| `DELETE`| `/api/session/active` | `/api/session/active` | JWT | None | `200 OK`: `{ success: true, count: number }` | Terminates all active sessions for user. |
| `DELETE`| `/api/session/:id` | `/api/session/:id` | JWT | None | `200 OK`: `{ success: true }` | Terminates session, emits RabbitMQ teardown. |
| `GET` | `/api/challenges/:id/trial/status` | `/api/challenges/:id/trial/status` | Guest Cookie | None | `200 OK`: `{ eligible: boolean, trialUsed: boolean }` | Checks 10-minute guest trial eligibility. |
| `POST`| `/api/challenges/:id/trial` | `/api/challenges/:id/trial` | No | None | `201 Created`: `{ sessionId, terminalUrl, validateUrl, ttlMins: 10, isGuestTrial: true, token }` | Starts anonymous guest trial session. |
| `POST`| `/api/challenges/:id/like` | `/api/challenges/:id/like` | JWT | None | `200 OK`: `{ liked: boolean, likes: number }` | Toggles challenge like. |
| `POST`| `/api/challenges/:id/bookmark` | `/api/challenges/:id/bookmark` | JWT | None | `200 OK`: `{ saved: boolean }` | Toggles challenge bookmark. |
| `GET` | `/api/challenges/:id/interactions`| `/api/challenges/:id/interactions`| Optional JWT | None | `200 OK`: `{ likes: number, liked: boolean, saved: boolean }` | Aggregates like/save state. |
| `GET` | `/api/challenges/onboarding-status`| `/api/challenges/onboarding-status`| JWT | None | `200 OK`: `{ onboardingState, onboardingVersion }` | Returns user tour onboarding state. |
| `POST`| `/api/challenges/onboarding-status/complete`| `/api/challenges/onboarding-status/complete`| JWT | None | `200 OK`: `{ success: true }` | Marks onboarding tour completed. |

#### 3. Social Graph & Community Discovery (`challenge.routes.ts`)
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST`| `/api/users/:id/follow` | `/api/users/:id/follow` | JWT | None | `200 OK`: `{ following: boolean, followingCount: number, followersCount: number }` | Toggles follow on another user. |
| `GET` | `/api/users/:username/profile`| `/api/users/:username/profile`| Optional JWT | None | `200 OK`: `PublicUserProfile` with badges, recent solves | Public profile data. |
| `GET` | `/api/users/me/bookmarks` | `/api/users/me/bookmarks` | JWT | None | `200 OK`: `Challenge[]` | List of user bookmarked challenges. |
| `GET` | `/api/users/me/following` | `/api/users/me/following` | JWT | None | `200 OK`: `UserSummary[]` | List of users followed by caller. |
| `GET` | `/api/users/me/feed` | `/api/users/me/feed` | JWT | Query: `?limit=20` | `200 OK`: `{ feed: ActivityFeedItem[] }` | Aggregated chronological solves & badges of followed users. |
| `GET` | `/api/users/discover` | `/api/users/discover` | Optional JWT | Query: `?q=...&limit=20`| `200 OK`: `{ users: CommunityUser[] }` | Searches public users ranked by streak and XP. |

#### 4. Dashboard & User History (`dashboard.routes.ts`)
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/me/dashboard` | `/api/me/dashboard` | JWT | None | `200 OK`: `DashboardData` | **Discrepancy**: Docs listed `/api/dashboard`; code is `/api/me/dashboard`. |
| `GET` | `/api/me/roadmaps/:slug/progress`| `/api/me/roadmaps/:slug/progress`| JWT | None | `200 OK`: `{ completed: number, total: number, percent: number }` | Computes progress through roadmap. |
| `GET` | `/api/me/quizzes/:slug/progress`| `/api/me/quizzes/:slug/progress`| JWT | None | `200 OK`: Quiz progress breakdown | Computes quiz score summary. |
| `GET` | `/api/me/quizzes/:slug/history` | `/api/me/quizzes/:slug/history` | JWT | None | `200 OK`: `QuizAttempt[]` | History of quiz attempts. |
| `GET` | `/api/me/challenges/:id/history`| `/api/me/challenges/:id/history`| JWT | None | `200 OK`: `Submission[]` | History of submissions for challenge. |
| `GET` | `/api/me/history` | `/api/me/history` | JWT | None | `200 OK`: `{ submissions, quizAttempts }` | Full activity history. |
| `GET` | `/api/me/profile` | `/api/me/profile` | JWT | None | `200 OK`: `User` profile with bio, location, links | Profile settings page data. |
| `PUT` | `/api/me/profile` | `/api/me/profile` | JWT | `{ bio?, location?, websiteUrl?, isPublic? }` | `200 OK`: `{ success: true, user }` | Updates profile settings. |

#### 5. Leaderboard (`leaderboard.routes.ts`)
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/leaderboard` | `/api/leaderboard` | No | Query: `?category=...&orgId=...&limit=50` | `200 OK`: `{ context: "GLOBAL" \| "CATEGORY" \| "ORGANIZATION", leaderboard: RankedUser[], total }` | Ranks users by XP, streak, and category solves. |
| `GET` | `/api/orgs/:orgId/leaderboard` | `/api/orgs/:orgId/leaderboard` | JWT (Org Member) | None | `200 OK`: `{ context: "ORGANIZATION", leaderboard: OrgRankedUser[], total }` | Internal org leaderboard. |

#### 6. Learning Paths, Roadmaps & Concept Graph (`roadmap.routes.ts`, `node.routes.ts`)
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/content/roadmaps` | `/roadmaps` or `/api/content/roadmaps` | No | None | `200 OK`: `LearningPath[]` | List of curated roadmaps. |
| `GET` | `/api/content/roadmaps/:slug` | `/roadmaps/:slug` or `/api/content/roadmaps/:slug` | Optional JWT | None | `200 OK`: `LearningPathDetail` with modules & graph | Detail roadmap and completion state. |
| `GET` | `/api/content/flashcards` | `/flashcards` or `/api/content/flashcards` | No | None | `200 OK`: Flashcard deck metadata | Practice flashcard decks. |
| `GET` | `/api/content/nodes/:id` | `/nodes/:id` or `/api/content/nodes/:id` | No | None | `200 OK`: `Node` | Concept graph node details. |
| `GET` | `/api/content/nodes/:id/parents`| `/nodes/:id/parents` | No | None | `200 OK`: `Node[]` | Prerequisite parent nodes in DAG. |
| `GET` | `/api/content/nodes/:id/children`| `/nodes/:id/children` | No | None | `200 OK`: `Node[]` | Successor dependent nodes in DAG. |
| `GET` | `/api/content/nodes/:id/ancestors`| `/nodes/:id/ancestors` | No | None | `200 OK`: `Node[]` | Transitive prerequisite closure. |
| `GET` | `/api/content/users/:id/frontier`| `/users/:id/frontier` | No | None | `200 OK`: `{ frontier: Node[] }` | Unlocked nodes ready for learner to tackle. |

#### 7. Quizzes (`quiz.routes.ts`)
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/content/quizzes` | `/quizzes` or `/api/content/quizzes` | No | None | `200 OK`: `QuizSummary[]` | List of conceptual quizzes. |
| `GET` | `/api/content/quizzes/:id` | `/quizzes/:id` or `/api/content/quizzes/:id` | No | None | `200 OK`: `QuizDetail` without answers | Sanitized questions without answers. |
| `POST`| `/api/content/quizzes/:id/submit`| `/quizzes/:id/submit` | Optional JWT | `{ answers: Record<string, number>, userId? }` | `200 OK`: `{ passed, score, total, percentage, xpAwarded, answers }` | Grades submission, emits completions. |
| `GET` | `/api/content/quizzes/:id/editorial`| `/quizzes/:id/editorial` | No | None | `200 OK`: `{ quizId, questions: QuestionWithExplanations[] }` | Detailed question-by-question explanations. |

#### 8. Technical Articles & Postmortems (`article.routes.ts`)
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/articles` | `/articles` or `/api/articles` | No | Query: `?category=...&tag=...&page=...` | `200 OK`: `{ articles: Article[], total, page, limit }` | Filterable engineering postmortems. |
| `GET` | `/api/articles/:slug` | `/articles/:slug` | No | None | `200 OK`: `Article` with content | Markdown content of article. |
| `POST`| `/api/articles` | `/articles` | JWT (ADMIN/CONTRIBUTOR) | `{ title, slug, summary, content, category, ... }` | `201 Created`: `Article` | Article authoring endpoint. |
| `POST`| `/api/articles/:id/like` | `/articles/:id/like` | JWT | None | `200 OK`: `{ liked: boolean, likes: number }` | Toggle article like. |
| `POST`| `/api/articles/:id/bookmark` | `/articles/:id/bookmark` | JWT | None | `200 OK`: `{ bookmarked: boolean }` | Toggle article bookmark. |
| `POST`| `/api/articles/:id/report` | `/articles/:id/report` | JWT | `{ reason, details? }` | `201 Created`: `{ success: true, message }` | Flag article for review. |

#### 9. AI Assistant (`assistant.routes.ts`)
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST`| `/api/assistant/chat` | `/api/assistant/chat` | No | `{ messages: [{ role, content }], challengeTitle?, challengeDescription? }` | `200 OK`: `{ content: string }` | Powered by Google Gemini (`gemini-1.5-flash`). Returns educational hints. |

#### 10. Social Shares, Comments & Custom Lists (`share.routes.ts`, `comment.routes.ts`, `list.routes.ts`)
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST`| `/api/shares` | `/api/shares` | JWT | `{ challengeId, sessionId }` | `201 Created`: `{ shareUrl, token, shareToken }` | Generates public share card token. |
| `GET` | `/api/shares/:token` | `/api/shares/:token` | No | None | `200 OK`: `ShareCardData` | Public view of verified solution card. |
| `GET` | `/api/comments/challenges/:id/comments`| `/api/challenges/:id/comments` | Optional JWT | None | `200 OK`: `Comment[]` (with vote counts and `userVote`) | Discussion thread for a challenge. |
| `POST`| `/api/comments/challenges/:id/comments`| `/api/challenges/:id/comments` | JWT | `{ content: string, parentId?: string }` | `201 Created`: `Comment` | Posts a new comment or reply. |
| `POST`| `/api/comments/:id/vote` | `/api/comments/:id/vote` | JWT | `{ value: 1 \| -1 }` | `200 OK`: `{ upvotes, downvotes, userVote }` | Upvote/downvote comment. |
| `DELETE`| `/api/comments/:id` | `/api/comments/:id` | JWT | None | `200 OK`: `{ success: true }` | Delete own comment or admin delete. |
| `GET` | `/api/lists` | `/api/lists` | Optional JWT | Query: `?isPublic=true` | `200 OK`: `ChallengeList[]` | Custom challenge lists. |
| `POST`| `/api/lists` | `/api/lists` | JWT | `{ title, description?, isPublic? }` | `201 Created`: `ChallengeList` | Create new custom challenge collection. |
| `GET` | `/api/lists/:id` | `/api/lists/:id` | Optional JWT | None | `200 OK`: `ChallengeListDetail` with items | View collection and items. |
| `POST`| `/api/lists/:id/items` | `/api/lists/:id/items` | JWT (Owner) | `{ challengeId: string }` | `201 Created`: `ChallengeListItem` | Add challenge to collection. |
| `DELETE`| `/api/lists/:id/items/:challengeId`| `/api/lists/:id/items/:challengeId`| JWT (Owner) | None | `200 OK`: `{ success: true }` | Remove challenge from list. |
| `DELETE`| `/api/lists/:id` | `/api/lists/:id` | JWT (Owner) | None | `200 OK`: `{ success: true }` | Delete custom list. |

#### 11. B2B Multi-Tenancy & Organizations (`org.routes.ts`)
| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST`| `/api/orgs` | `/api/orgs` | JWT | `{ name: string, slug: string, planTier?: "FREE" \| "PRO" \| "TEAM" }` | `201 Created`: `Org` | Creates organization and assigns creator as OWNER. |
| `GET` | `/api/orgs/me` | `/api/orgs/me` | JWT | None | `200 OK`: `Org & { myRole: OrgRole }` (or `404` if non-org) | Caller's active organization. |
| `GET` | `/api/orgs/:orgId/members` | `/api/orgs/:orgId/members` | JWT (Member) | None (accepts `:orgId = "me"`) | `200 OK`: `OrgMember[]` | List organization roster. |
| `POST`| `/api/orgs/:orgId/invites` | `/api/orgs/:orgId/invites` | JWT (ADMIN/OWNER) | `{ email: string, orgRole?: OrgRole }` | `201 Created`: `{ success: true, message, invite }` | Dispatches invite, enforces seat limits. |
| `GET` | `/api/orgs/:orgId/analytics` | `/api/orgs/:orgId/analytics` | JWT (ADMIN/OWNER) | None (accepts `:orgId = "me"`) | `200 OK`: `OrgAnalytics` | Aggregates skill scores, active labs, weekly completions. |
| `GET` | `/api/orgs/:orgId/scenarios` | `/api/orgs/:orgId/scenarios` | JWT (Member) | None (accepts `:orgId = "me"`) | `200 OK`: `OrgScenario[]` | Custom private enterprise scenarios. |
| `POST`| `/api/orgs/:orgId/scenarios` | `/api/orgs/:orgId/scenarios` | JWT (ADMIN/OWNER) | `{ title, description, dockerImage, difficulty?, category?, setupInstructions?, checks? }` | `201 Created`: `OrgScenario` | Authors a private enterprise lab scenario. |
| `POST`| `/api/orgs/join/:token` | `/api/orgs/join/:token` | JWT | None | `200 OK`: `{ success: true, org }` | Accepts invitation token. |
| `GET` | `/api/orgs/:orgId/assignments` | `/api/orgs/:orgId/assignments` | JWT (Member) | None | `200 OK`: `PathAssignment[]` | Learning path assignments. |
| `POST`| `/api/orgs/:orgId/assignments` | `/api/orgs/:orgId/assignments` | JWT (ADMIN/OWNER) | `{ pathId, targetType, targetUserId?, dueDate? }` | `201 Created`: `PathAssignment` | Assigns learning path to member. |
| `GET` | `/api/orgs/:orgId/contributors/challenges`| `/api/orgs/:orgId/contributors/challenges`| JWT (Member) | None | `200 OK`: `Challenge[]` | Challenges contributed by org. |
| `PATCH`| `/api/orgs/:orgId/members/:userId/role`| `/api/orgs/:orgId/members/:userId/role`| JWT (OWNER) | `{ orgRole: "ADMIN" \| "MEMBER" }` | `200 OK`: `{ success: true, member }` | Changes member role. |
| `DELETE`| `/api/orgs/:orgId/members/:userId`| `/api/orgs/:orgId/members/:userId`| JWT (ADMIN/OWNER) | None | `200 OK`: `{ success: true }` | Removes member from organization. |

---

### C. Sandbox Router & Worker (`services/sandbox`)
* **Router Port**: `8080` (Direct) | **Kong Proxied**: `http://localhost:8005/sessions/*`, `http://localhost:8005/validate/*`
* **Worker Port**: `8090` (Direct)

| Method | Path through Kong | Direct Service Path | Auth Required | Request Body | Response Shape | Documented vs Code Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | *(Direct only)* | `http://localhost:8080/health` | No | None | `200 OK`: `"ok"` | Sandbox Router health. |
| `GET` | *(Direct only)* | `http://localhost:8080/metrics` | No | None | Prometheus text format | Router request counters and latency histograms. |
| `GET` | *(Direct only)* | `http://localhost:8090/health` | No | None | `200 OK`: `{"status":"ok"}` | Sandbox Worker health. |
| `GET` | *(Direct only)* | `http://localhost:8090/metrics` | No | None | Prometheus text format | Worker metrics (sessions, validation duration, reaper). |
| `GET` | `/sessions/:sessionId/health` | `http://localhost:8090/sessions/:sessionId/health` | JWT (Header or Query `?token=`) | None | `200 OK`: `{"alive": boolean}` | Performs live lightweight probe (`/bin/true`) on running container. |
| `GET (WS)`| `/sessions/:sessionId/terminal` | `http://localhost:8090/sessions/:sessionId/terminal` | JWT (Header, Query `?token=`, or Protocol `bearer.<token>`) | Binary/Text WebSocket Frames | Subprotocol `terminal`. Initial frames: Progress JSON (`StageReady`). Interactive: Binary PTY I/O. Text: `{type:"resize", cols, rows}`. | Bridges `xterm.js` to guest tmux session. |
| `POST`| `/validate/:sessionId` | `http://localhost:8090/validate/:sessionId` | No (Session ID is secret key in Redis) | None | `200 OK` (pass) or `422 Unprocessable Entity` (fail): `{ passed: boolean, feedback: string, checkResults: [{ check_id, passed, message }] }` | Executes `/validator.sh` inside guest container. Emits `sandbox.challenge.solved` or `sandbox.challenge.failed` to Kafka. |

---

### D. Notification Service (`services/notification`)
* **Base Direct URL**: `http://localhost:3004`
* **Role**: Asynchronous Kafka & RabbitMQ event consumer (sends welcome emails, verification emails, and digests via Resend).

| Method | Direct Service Path | Auth Required | Request Body | Response Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `http://localhost:3004/health` | No | None | `200 OK`: `{"status":"ok","service":"notification-service"}` | Direct health check. |
| `GET` | `http://localhost:3004/metrics` | No | None | Prometheus text format | Prometheus notification delivery metrics. |

---

## 3. Critical Documentation vs Code Discrepancies (Resolved)

1. **Dashboard Route Path**:
   - *Docs stated*: `GET /api/dashboard`.
   - *Code truth*: `GET /api/me/dashboard` in `dashboard.routes.ts` mounted under prefix `/api`.
2. **Kong Auth Prefix Strip Behavior**:
   - In `infra/kong/kong.yml`, route `auth-routes` has `paths: [/api/auth]`, `strip_path: true`. Therefore, `POST /api/auth/login` on Kong is dispatched to `/login` on `auth-service`.
3. **Sandbox Validation Status Code**:
   - When checks fail, the validator endpoint returns `422 Unprocessable Entity` (not `400 Bad Request`), returning detailed per-check JSON diagnostics.
4. **WebSocket Authentication Subprotocols**:
   - The Go sandbox worker accepts JWTs passed via standard `Authorization: Bearer ...` header, `?token=...` query string, or `Sec-WebSocket-Protocol: bearer.<jwt>`. Subprotocol negotiated is `terminal`. Client input MUST be sent as `websocket.BinaryMessage` (buffers) to feed stdin to the PTY.
5. **Windows Line Endings in Challenge Containers**:
   - Challenge Dockerfiles must ensure `/validator.sh` has LF line endings (via `sed -i 's/\r$//' /validator.sh`), preventing `$'\r': command not found` errors inside guest Linux containers.

---

## 4. Planned Smoke Test & Mini Demo Execution Sequence

The automated smoke test (`tests/smoke/smoke-demo.ts`, executed via `npm run smoke`) will run the following 10-phase sequence in order:

```
[Phase 1: Infrastructure & Service Health Check]
  ├─ 1.1 PostgreSQL connection probe (port 5444)
  ├─ 1.2 Redis ping probe (port 6379)
  ├─ 1.3 RabbitMQ Management API probe (http://localhost:15672/api/overview)
  ├─ 1.4 Kong Admin API probe (http://localhost:8001/status)
  ├─ 1.5 Auth Service /health & /metrics (http://localhost:3002)
  ├─ 1.6 Core Service /health & /metrics (http://localhost:3003)
  ├─ 1.7 Sandbox Router /health & /metrics (http://localhost:8080)
  ├─ 1.8 Sandbox Worker /health & /metrics (http://localhost:8090)
  └─ 1.9 Notification Service /health & /metrics (http://localhost:3004)

[Phase 2: Authentication & Token Lifecycle]
  ├─ 2.1 Register dedicated fresh test learner (`POST /api/auth/register`)
  ├─ 2.2 Verify JWT claims (RS256 signature, subject, expiry)
  ├─ 2.3 Fetch profile (`GET /api/auth/me`)
  ├─ 2.4 Update profile details (`PUT /api/auth/me`)
  ├─ 2.5 Query security audit log (`GET /api/auth/security-log`)
  └─ 2.6 Test token refresh rotation (`POST /api/auth/refresh`)

[Phase 3: Catalog & Learning Roadmap Exploration]
  ├─ 3.1 Fetch challenge catalog (`GET /api/challenges`)
  ├─ 3.2 Fetch target challenge details (`GET /api/challenges/cmszcvcqw000slkwly2265dyw`)
  ├─ 3.3 Verify editorial gating BEFORE solving (`GET /api/challenges/:id/editorial` -> Expect 403 EDITORIAL_LOCKED)
  ├─ 3.4 Fetch roadmaps (`GET /api/content/roadmaps`)
  ├─ 3.5 Fetch conceptual graph nodes (`GET /api/content/nodes/:id`)
  ├─ 3.6 Fetch flashcards & quizzes (`GET /api/content/flashcards`, `GET /api/content/quizzes`)
  └─ 3.7 Query AI Assistant hints (`POST /api/assistant/chat`)

[Phase 4: Challenge Session Provisioning & Dispatch]
  ├─ 4.1 Dispatch challenge start (`POST /api/challenges/:id/start`)
  ├─ 4.2 Validate RabbitMQ job receipt & Redis lock creation
  └─ 4.3 Poll session readiness (`GET /api/session/:id` and `/sessions/:id/health`)

[Phase 5: Interactive PTY Terminal WebSocket Session (The Live Demo)]
  ├─ 5.1 Connect WebSocket to `ws://localhost:8005/sessions/:sessionId/terminal` with JWT
  ├─ 5.2 Receive `StageReady` progress notification
  ├─ 5.3 Send `nginx -t\n` as binary buffer -> Expect syntax error in output
  ├─ 5.4 Inspect broken configuration (`cat /etc/nginx/nginx.conf\n`)
  ├─ 5.5 Send sed fixes over PTY:
  │       - Add missing semicolon to worker_processes
  │       - Fix port from 8080 to 80
  ├─ 5.6 Send `nginx -t\n` over PTY -> Expect `syntax is ok` and `test is successful`
  ├─ 5.7 Start service via PTY (`service nginx start\n`)
  └─ 5.8 Cleanly detach/close terminal WebSocket

[Phase 6: Multi-Stage Solution Validation]
  ├─ 6.1 Call validator endpoint (`POST /validate/:sessionId`)
  └─ 6.2 Assert `200 OK` with `{ passed: true, checkResults: 3/3 passed }`

[Phase 7: Event Pipeline & Post-Solve Gamification Verification]
  ├─ 7.1 Verify Kafka event emitted (`sandbox.challenge.solved`)
  ├─ 7.2 Wait for progress consumer processing
  ├─ 7.3 Assert User XP incremented (0 -> 100)
  ├─ 7.4 Assert User streak incremented (0 -> 1)
  ├─ 7.5 Assert First Blood badge awarded (`UserBadge` row in DB)
  ├─ 7.6 Assert LabSession marked `COMPLETED` with timestamp
  ├─ 7.7 Verify Editorial is now UNLOCKED (`GET /api/challenges/:id/editorial` -> Expect 200 OK)
  └─ 7.8 Verify Social Activity Feed contains the solve (`GET /api/users/me/feed`)

[Phase 8: Social Graph, Community & Remaining Endpoints]
  ├─ 8.1 Query global & category leaderboards (`GET /api/leaderboard`)
  ├─ 8.2 Query community user discovery (`GET /api/users/discover`)
  ├─ 8.3 Fetch user dashboard summary (`GET /api/me/dashboard`)
  ├─ 8.4 Toggle challenge like & bookmark (`POST /api/challenges/:id/like`, `/bookmark`)
  ├─ 8.5 Post challenge comment & vote (`POST /api/comments/challenges/:id/comments`, `/vote`)
  ├─ 8.6 Create and query custom challenge collection (`POST /api/lists`, `GET /api/lists/:id`)
  ├─ 8.7 Create share token & view public solution card (`POST /api/shares`, `GET /api/shares/:token`)
  └─ 8.8 Verify Multi-Tenancy non-org isolation (`GET /api/orgs/me` -> Expect 404)

[Phase 9: Teardown, Cleanup & Resource Deallocation]
  ├─ 9.1 Terminate session (`DELETE /api/session/:id`)
  ├─ 9.2 Assert guest Docker container is destroyed
  ├─ 9.3 Assert Redis session keys cleaned up
  ├─ 9.4 Delete test user records & cascade relationships (`DELETE /api/auth/me`)
  └─ 9.5 Print execution summary table with individual step timings
```
