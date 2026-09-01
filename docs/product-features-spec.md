# Product Feature Specification & Implementation Audit: Operational & Social Features

This document tracks the competitive feature set scoped from LeetCode, Codeforces, HackerRank, and Exercism, reflecting the codebase audit and implementation status.

---

## Feature Status Matrix

| Feature | Scope / Requirements | Implementation Status | Verified Status |
| :--- | :--- | :--- | :--- |
| **1. Bookmarks & Favorites** | Toggle save/bookmark on challenges & articles. Custom named challenge lists ("Interview Prep", "Must Try"). | **PARTIALLY IMPLEMENTED**<br>• Flat challenge bookmarks (`ChallengeBookmark`) are **CLOSED / FULLY WIRED** (`POST /api/challenges/:id/bookmark`, `GET /api/users/me/bookmarks`, and Challenge UI button).<br>• Custom named multi-lists (`ChallengeList` / `ChallengeListItem`) remain **UNBUILT (Future Phase)**. | Unit & Route Verified |
| **2. Following & Social Graph** | Follow/unfollow users and view social activity feed of followed peers. | **CLOSED / IMPLEMENTED**<br>• Follow graph (`UserFollow`) is fully wired (`POST /api/users/:id/follow`, `GET /api/users/:username/profile`).<br>• Chronological activity feed (`GET /api/users/me/feed`) and dashboard UI widget (`SocialActivityFeed.tsx`) are **CLOSED / IMPLEMENTED**. | Unit & Route Verified |
| **3. Share Links** | Publicly shareable verified submission/achievement tokens. | **UNBUILT (Pending Prioritization)**<br>Requires `ShareToken` schema model and public read endpoint (`GET /shares/:token`). | Pending Build |
| **4. Multi-Context Leaderboards** | Contextual standings by Organization, Category, and Weekly/Monthly reset windows. | **UNBUILT (Pending Prioritization)**<br>Global all-time XP leaderboard exists. Org-specific and category-specific leaderboards are pending query implementation. | Pending Build |
| **5. Solution Editorials & Postmortems** | Architectural deep-dive writeups gated behind challenge completion or privileged roles (`ADMIN`/`CONTRIBUTOR`). | **CLOSED / IMPLEMENTED**<br>• `GET /api/challenges/:id/editorial` with 403 `EDITORIAL_LOCKED` gatekeeping.<br>• Real seed editorials authored for all core seed challenges.<br>• Frontend `EditorialTab` component mounted in workspace. | Unit & Route Verified |
| **6. Community Discussion per Challenge** | Lightweight comment threads per challenge with upvotes. | **UNBUILT (Pending Prioritization)**<br>Requires `ChallengeComment` & `ChallengeCommentVote` schema models. | Pending Build |
| **7. Activity Streak & Heatmap** | Deterministic daily streak calculation + profile heatmap. | **CLOSED / IMPLEMENTED (Streak Engine)**<br>• Real `calculateStreak` utility hooked into `CHALLENGE_SOLVED` progress consumer.<br>• Fake seed streaks removed.<br>• Dynamic profile heatmap rendering based on timestamped session data. | Unit & Route Verified |
| **8. Badge Awarding Engine** | Automated badge evaluation upon challenge solves and streak milestones. | **CLOSED / IMPLEMENTED**<br>• Engine [`badges.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/utils/badges.ts) evaluates `first-blood`, `streak-3`, `streak-7`, `streak-30`, and roadmap mastery.<br>• Triggered on `CHALLENGE_SOLVED` in `progress/consumers.ts`.<br>• Badges rendered on profile & dashboard. | Unit & Route Verified |

---

## Detailed Notes on Outstanding Items (Next Phases)

### 1. Custom Bookmark Lists
* **Current state**: Flat `ChallengeBookmark` table supports binary bookmarking.
* **Remaining work**: Create `ChallengeList` and `ChallengeListItem` models to enable user-created named collections.

### 2. Multi-Context Standings
* **Current state**: `GET /api/leaderboard` returns global top-100 users by XP.
* **Remaining work**: Add filters for `category` (e.g. Docker, Kubernetes) and org internal roster rankings (`GET /api/orgs/:orgId/leaderboard`).

### 3. Shareable Solution Links
* **Current state**: Challenge URLs are copyable via client-side clipboard.
* **Remaining work**: Generate signed/unique verification snapshots showing exact test checks passed, duration, and completion timestamp for public sharing.

### 4. Community Discussion per Challenge
* **Current state**: Not implemented.
* **Remaining work**: Introduce `ChallengeComment` model with CRUD routes and workspace discussion tab.

---

## Testing & Environment Audit Note

> [!WARNING]
> **Verification Environment Limitation**:
> All newly added backend endpoints (`GET /api/challenges/:id/editorial`, `GET /api/users/me/feed`), the `calculateStreak` engine, and the `evaluateMilestoneBadges` subsystem have been verified using **unit test suites and mock-backed Fastify HTTP injections (32/32 tests passing)**.
> 
> **Live PostgreSQL / Docker Daemon Verification**: `PENDING`. Docker Desktop was offline on the host OS during this implementation pass. Live E2E database verification against containerized PostgreSQL and Kafka will be conducted once the Docker engine is running.
