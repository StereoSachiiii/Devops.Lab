# DevOps.lab Gamification & Social Architecture

## 1. Overview
DevOps.lab employs an engineering-focused gamification engine that rewards consistent hands-on troubleshooting, streak preservation, community interaction, and curriculum mastery.

---

## 2. Activity Streak Engine

Streaks measure consecutive UTC calendar days of active engineering work. Streaks are evaluated and persisted atomically whenever a `sandbox.challenge.solved` event is processed by `core-service`'s progress consumers.

### State Fields on `User`
* `currentStreak` (Integer, default `0`): Current number of consecutive days with at least one passing challenge completion.
* `longestStreak` (Integer, default `0`): All-time high streak record for the user.
* `lastActivityDate` (DateTime, nullable): UTC timestamp of the user's most recent passing challenge solve.

### Calculation Rules (`calculateStreak`)
Source: [`services/core/src/utils/streak.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/utils/streak.ts)

1. **First-Ever Activity (`lastActivityDate === null`)**:
   - `currentStreak` = `1`
   - `longestStreak` = `max(longestStreak, 1)`
   - `lastActivityDate` = `activityDate`
2. **Same UTC Calendar Day (`dayDiff === 0`)**:
   - Multiple completions within the same calendar day do not double-increment the streak.
   - `currentStreak` remains unchanged.
   - `lastActivityDate` is updated to the latest timestamp.
3. **Consecutive UTC Calendar Day (`dayDiff === 1`)**:
   - Activity occurs exactly on the next calendar day.
   - `currentStreak` = `currentStreak + 1`
   - `longestStreak` = `max(longestStreak, currentStreak)`
   - `lastActivityDate` = `activityDate`
4. **Day Gap / Missed Day (`dayDiff >= 2`)**:
   - Streak is broken due to inactivity on the previous day.
   - `currentStreak` resets to `1`.
   - `longestStreak` is preserved (never decrements).
   - `lastActivityDate` = `activityDate`

---

## 3. Badges & Milestone Evaluation Engine

Badges recognize milestones across problem counts, daily consistency, and full curriculum roadmap completions.

### Models
* `Badge`: Definition table (`id`, `slug`, `title`, `description`, `iconRef`, `roadmapId`).
* `UserBadge`: Join table (`userId`, `badgeId`, `earnedAt`) with a composite primary key `@@id([userId, badgeId])` ensuring strict award idempotency.

### Engine Implementation
Source: [`services/core/src/utils/badges.ts`](file:///c:/Users/sachin%20lakshitha/devop/services/core/src/utils/badges.ts)

* `awardBadgeIfEligible(fastify, { userId, badgeSlug })`: Checks whether the user has already earned the badge. If not, creates the `UserBadge` record.
* `evaluateMilestoneBadges(fastify, userId, currentStreak, challengeId)`: Triggered automatically upon every passing challenge solve.

### Standard Seeded Badges

| Badge Slug | Title | Icon | Unlock Criterion |
| :--- | :--- | :--- | :--- |
| `first-blood` | First Deployment | 🚀 | Solved your first interactive challenge lab (`totalCompleted >= 1`). |
| `streak-3` | 3-Day Drill | 🔥 | Maintained a 3-day consecutive activity streak (`currentStreak >= 3`). |
| `streak-7` | Weekly Warrior | ⚡ | Maintained a 7-day consecutive activity streak (`currentStreak >= 7`). |
| `streak-30` | Ironclad SRE | 🛡️ | Maintained a 30-day unbroken engineering streak (`currentStreak >= 30`). |
| `linux-master` | Linux Kernel Veteran | 🐧 | Completed all challenges linked to the `linux-fundamentals` learning path. |
| `docker-captain` | Docker Captain | 🐳 | Completed all challenges linked to the `docker-containerization-mastery` learning path. |

### Adding New Badges
To extend the badge catalog:
1. Insert the badge record into `prisma.badge` (or via `packages/db/prisma/seed.ts`).
2. Add the evaluation logic to `evaluateMilestoneBadges` in `services/core/src/utils/badges.ts`.
3. If tied to a specific learning path, set `roadmapId` on the `Badge` record to enable automatic path-mastery evaluation.

---

## 4. Verification & Testing Status

> [!IMPORTANT]
> **Verification Status: Unit & Mocked Fastify Injection Verified**
> 
> All streak calculation rules, consumer integrations, badge idempotency, and milestone award workflows have been validated via automated test suites in `services/core/src/__tests__/streak.test.ts` and `badges.test.ts` (32/32 tests passing).
> 
> **Live Docker / Multi-Container Verification:** `PENDING`. Full end-to-end database writes against a running PostgreSQL container (`localhost:5444`) and live Kafka message flow will be executed once the Docker Desktop daemon is started.
