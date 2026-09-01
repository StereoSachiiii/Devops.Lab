# B2B Organizations & Teams — Product Requirements Document

**Version**: 1.0  
**Status**: Draft  
**Authors**: Engineering Team  
**Last Updated**: 2026-07-22

---

## 1. Overview & Purpose

DevOps.lab's B2B offering allows engineering organizations (**tenants**) to:

1. Enroll their engineers as a managed team on the platform.
2. Assign curated learning paths and roadmaps to specific team members.
3. Monitor team-wide skill progression and sandbox activity.
4. Create **private custom scenarios** scoped to their organization — which, once approved, are contributed back as first-class challenges in the public challenge catalogue (the same `Challenge` model used by the `core-service`).

This document defines the complete, finished-product requirements for the B2B feature set.

---

## 2. Actors & Roles

| Actor | Description | Platform Role |
|-------|-------------|---------------|
| **Org Owner** | Pays for the plan, creates the org, has full control | `ADMIN` (global) + `OWNER` (org) |
| **Org Admin** | Designated by Owner to manage members and paths | `ADMIN` (org) |
| **Org Member** | An engineer enrolled in the org's team | `LEARNER` (global) + `MEMBER` (org) |
| **Platform Admin** | DevOps.lab staff who review/approve contributed scenarios | `ADMIN` (global Role enum) |

> **Existing schema note**: The global `Role` enum (`GUEST`, `LEARNER`, `CONTRIBUTOR`, `ADMIN`) handles platform-wide access. A new per-org `OrgRole` enum (`OWNER`, `ADMIN`, `MEMBER`) is required for org-level permissions alongside the existing `OrgMember` junction table that needs to be added.

---

## 3. User Journeys

### 3.1 Org Owner Journey — Setup

```
Register on DevOps.lab
  → Complete onboarding (existing flow)
  → See "Create your organization" prompt (if no orgId in JWT)
  → Create Org (name, team size estimate, plan selection)
  → Receive orgId, promoted to ADMIN role globally
  → Land on /teams dashboard
  → Invite team members via email
  → Assign learning paths to members
```

### 3.2 Org Member Journey — Daily Use

```
Receive email invitation
  → Click invite link → Register / Log in
  → Auto-enrolled in org (orgId set on User)
  → Land on /dashboard (personal dashboard, unchanged)
  → See "Your Team Paths" widget showing org-assigned paths
  → Navigate to /roadmaps to view assigned roadmap
  → Start challenges within org-assigned paths
  → Complete challenges → XP and completions tracked normally
  → View own progress on /dashboard
```

### 3.3 Org Admin Journey — Monitoring

```
Log in → /teams dashboard
  → View org overview: total members, active sandboxes, avg skill score, paths completed
  → Drill into member list: view each engineer's active sandbox, score, completions
  → Assign or unassign learning paths to a member or the whole org
  → Invite new member / remove member
  → View team analytics: weekly score trend, completion velocity
  → Navigate to custom scenarios panel
  → Create or manage custom scenarios
```

### 3.4 Scenario Contribution Journey

```
Admin: Create Custom Scenario (form in /teams)
  → Fill scenario metadata (title, description, difficulty, category, docker image)
  → Write scenario setup instructions (markdown — describes the broken state)
  → Define grading checks (list of checkId + expected pass condition)
  → Save scenario as "Private" — visible only to org members
  → Optionally: submit for Public Contribution
      → Platform Admin reviews in admin panel
      → If approved: scenario is promoted to a public Challenge record
         (inserted into Challenge table; sandbox-worker grading already works unchanged)
      → Org gets attribution badge on the challenge page
      → Scenario creator is upgraded to CONTRIBUTOR global role
```

---

## 4. Feature Catalogue

### 4.1 Org Management

| ID | Requirement | Priority |
|----|-------------|----------|
| B2B-01 | User can create a new organization with a name and plan tier selection | P0 |
| B2B-02 | Org owner can invite members via email (creates OrgInvite, sends email via notification-service) | P0 |
| B2B-03 | Invitee accepts invite link and is auto-enrolled (orgId set on User, OrgMember record created) | P0 |
| B2B-04 | Admin can remove a member from the org (nulls User.orgId, deletes OrgMember) | P0 |
| B2B-05 | Admin can change a member's org role (MEMBER ↔ ADMIN) | P1 |
| B2B-06 | Owner can rename the organization | P1 |
| B2B-07 | System enforces seat limits from Org.seatsPurchased — invite rejected if seats exhausted | P1 |
| B2B-08 | Admin can view pending invitations and cancel them | P1 |
| B2B-09 | Owner can delete the organization (removes all memberships, nulls LearningPath.orgId) | P2 |

### 4.2 Learning Path Assignment

| ID | Requirement | Priority |
|----|-------------|----------|
| B2B-10 | Admin can assign any public LearningPath to the whole org via PathAssignment | P0 |
| B2B-11 | Admin can assign a path to a specific individual member | P1 |
| B2B-12 | Org Members see an "Assigned by your org" section on /dashboard and /roadmaps | P0 |
| B2B-13 | Org can create a private LearningPath (LearningPath.orgId set) visible only to members | P1 |
| B2B-14 | Admin can unassign a path from a member or org | P1 |
| B2B-15 | Member path completion is tracked via existing Completion model — no new tracking logic needed | P0 |

### 4.3 Team Dashboard (`/teams`)

| ID | Requirement | Priority |
|----|-------------|----------|
| B2B-20 | Dashboard header shows real org name and plan tier from API (not hardcoded) | P0 |
| B2B-21 | Overview cards show live data: total members, active sandboxes, avg XP, paths completed this week | P0 |
| B2B-22 | Member roster table: name, org role, active sandbox (or "—"), XP score, status | P0 |
| B2B-23 | "Invite Members" button opens modal with email input, posts to invite API | P0 |
| B2B-24 | Member row "⋮" menu: View Profile, Assign Path, Change Role, Remove from Org | P1 |
| B2B-25 | Analytics panel: line chart of avg team XP over last 30 days, completion velocity bar | P1 |
| B2B-26 | Empty states for: no members, no assigned paths, no scenarios | P0 |
| B2B-27 | Loading skeletons during all data fetches | P0 |
| B2B-28 | /teams protected — redirect to /login if unauthenticated; 403 page if no org | P0 |

### 4.4 Custom Scenarios

| ID | Requirement | Priority |
|----|-------------|----------|
| B2B-30 | Admin can create a Custom Scenario via a 4-step form | P0 |
| B2B-31 | Form Step 1: Title, Description, Difficulty (JUNIOR/MID/SENIOR), Category | P0 |
| B2B-32 | Form Step 2: Docker image name + setup instructions (markdown, live-previewed) | P0 |
| B2B-33 | Form Step 3: Grading checks — list of { checkId, description, passCriteria } (min 1) | P0 |
| B2B-34 | Form Step 4: Summary + Save — stored as OrgScenario with status=PRIVATE | P0 |
| B2B-35 | Org members can start a private scenario sandbox via the standard challenge start flow | P0 |
| B2B-36 | Scenario card displays: title, type badge, difficulty, description, Launch + Contribute buttons | P0 |
| B2B-37 | Admin can edit or delete a private scenario | P1 |
| B2B-38 | Admin can submit scenario for public contribution (status → PENDING_REVIEW) | P1 |
| B2B-39 | Platform Admin can approve or reject contributions with a reason | P1 |
| B2B-40 | On approval: Challenge record created in shared DB; visible in /challenges catalogue | P1 |
| B2B-41 | Org creator receives CONTRIBUTOR global role on contribution approval | P2 |

### 4.5 Analytics & Integrations

| ID | Requirement | Priority |
|----|-------------|----------|
| B2B-50 | Weekly digest email: team skill summary, top performers, completion count | P2 |
| B2B-51 | Slack webhook integration: post weekly digest to configured channel | P2 |
| B2B-52 | Admin can configure notification preferences in Org Settings | P2 |

---

## 5. Data Model Changes

### 5.1 New Tables Required

```prisma
// Per-org membership with role
model OrgMember {
  id       String  @id @default(cuid())
  userId   String
  orgId    String
  orgRole  OrgRole @default(MEMBER)
  user     User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  org      Org     @relation(fields: [orgId], references: [id], onDelete: Cascade)
  joinedAt DateTime @default(now())

  @@unique([userId, orgId])
}

enum OrgRole {
  OWNER
  ADMIN
  MEMBER
}

// Email-based invitation
model OrgInvite {
  id        String          @id @default(cuid())
  orgId     String
  email     String
  token     String          @unique @default(cuid())
  orgRole   OrgRole         @default(MEMBER)
  status    OrgInviteStatus @default(PENDING)
  expiresAt DateTime
  createdAt DateTime        @default(now())
  org       Org             @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([orgId, status])
}

enum OrgInviteStatus {
  PENDING
  ACCEPTED
  EXPIRED
  CANCELLED
}

// Private org scenario (draft before it becomes a public Challenge)
model OrgScenario {
  id                String            @id @default(cuid())
  orgId             String
  createdByUserId   String
  title             String
  description       String
  difficulty        Difficulty
  category          Category
  dockerImage       String
  setupInstructions String            @db.Text
  checks            Json              // [{ checkId, description, passCriteria }]
  status            OrgScenarioStatus @default(PRIVATE)
  challengeId       String?           // Set after promotion to public Challenge
  org               Org               @relation(fields: [orgId], references: [id], onDelete: Cascade)
  createdBy         User              @relation(fields: [createdByUserId], references: [id])
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@index([orgId, status])
}

enum OrgScenarioStatus {
  PRIVATE           // Visible only to org members
  PENDING_REVIEW    // Submitted for public contribution review
  APPROVED          // Promoted to public Challenge
  REJECTED          // Contribution declined
}

// Explicit assignment of a LearningPath to an org or individual member
model PathAssignment {
  id               String       @id @default(cuid())
  orgId            String
  learningPathId   String
  userId           String?      // null = org-wide; set = individual
  assignedByUserId String
  assignedAt       DateTime     @default(now())
  org              Org          @relation(fields: [orgId], references: [id], onDelete: Cascade)
  learningPath     LearningPath @relation(fields: [learningPathId], references: [id])

  @@unique([orgId, learningPathId, userId])
  @@index([orgId])
  @@index([userId])
}
```

### 5.2 Existing Table Modifications

| Table | Change | Reason |
|-------|--------|--------|
| `Challenge` | Add `contributedByOrgId String?` + relation | Attribution for contributed scenarios |
| `Org` | Add `slug String @unique` | Clean URL routing (`/teams/acme-corp`) |
| `User` | `orgId` FK already exists — no structural change | FK to Org is already in schema |

### 5.3 JWT Claims Additions

The `auth-service` must add the following to the JWT access token for users who belong to an org:

```typescript
// Appended to existing JWT payload (refreshed each token renewal cycle)
{
  orgId:   string;   // user's organization ID
  orgRole: OrgRole;  // "OWNER" | "ADMIN" | "MEMBER"
}
```

---

## 6. API Surface (core-service additions)

### 6.1 Org CRUD

```
POST   /orgs                   Create org; caller becomes OWNER via OrgMember record
GET    /orgs/me                Current user's org details + their OrgMember record
GET    /orgs/:orgId            Org details (ADMIN+)
PATCH  /orgs/:orgId            Update name / slug (OWNER only)
DELETE /orgs/:orgId            Delete org (OWNER only)
```

### 6.2 Member Management

```
GET    /orgs/:orgId/members           Paginated member list (score, active session, orgRole)
POST   /orgs/:orgId/invites           Send invite email (ADMIN+)
GET    /orgs/:orgId/invites           List pending invites (ADMIN+)
DELETE /orgs/:orgId/invites/:id       Cancel pending invite (ADMIN+)
POST   /orgs/join/:token              Accept invite link (public; requires authentication)
PATCH  /orgs/:orgId/members/:userId   Change member orgRole (OWNER only)
DELETE /orgs/:orgId/members/:userId   Remove member from org (ADMIN+; self-removal always allowed)
```

### 6.3 Path Assignments

```
GET    /orgs/:orgId/assignments         List all path assignments for the org
POST   /orgs/:orgId/assignments         Assign LearningPath to org or individual member
DELETE /orgs/:orgId/assignments/:id     Remove assignment
GET    /me/assigned-paths               Member endpoint: paths assigned to me or my org
```

### 6.4 Analytics

```
GET    /orgs/:orgId/analytics
  → { totalMembers, activeSandboxes, highResourceSandboxes,
      avgXp, xpChangeLastWeek, pathsCompleted,
      pathsCompletedThisWeek, membersJoinedThisMonth }

GET    /orgs/:orgId/analytics/trend
  → { weeks: [{ week: "2026-W29", avgXp: 820 }, ...] }  // last 30 days, weekly avg
```

### 6.5 Custom Scenarios

```
GET    /orgs/:orgId/scenarios           List org's private scenarios (MEMBER+)
POST   /orgs/:orgId/scenarios           Create scenario (ADMIN+)
GET    /orgs/:orgId/scenarios/:id       Get single scenario (MEMBER+)
PATCH  /orgs/:orgId/scenarios/:id       Edit scenario (ADMIN+ or creator)
DELETE /orgs/:orgId/scenarios/:id       Delete scenario (ADMIN+ or creator)
POST   /orgs/:orgId/scenarios/:id/contribute   Submit for public contribution (ADMIN+)

// Platform admin only (requires global ADMIN role)
GET    /admin/scenarios/pending         All PENDING_REVIEW scenarios
POST   /admin/scenarios/:id/approve     Approve → creates Challenge record
POST   /admin/scenarios/:id/reject      Reject with reason string
```

### 6.6 Scenario → Challenge Promotion (Approval Flow)

When a platform admin approves an `OrgScenario`, the core-service runs the following atomically in a Prisma `$transaction`:

```typescript
// 1. Create the public Challenge record
const challenge = await prisma.challenge.create({
  data: {
    title:              scenario.title,
    description:        scenario.description,
    difficulty:         scenario.difficulty,
    category:           scenario.category,
    dockerImage:        scenario.dockerImage,
    templateCode:       scenario.setupInstructions,
    // xp auto-set: JUNIOR=100, MID=300, SENIOR=500
    xp:                 xpByDifficulty[scenario.difficulty],
    contributedByOrgId: scenario.orgId,
    moduleId:           adminProvidedModuleId,   // admin assigns to a roadmap module
  }
});

// 2. Update scenario status and link back to the new Challenge
await prisma.orgScenario.update({
  where: { id: scenario.id },
  data: { status: "APPROVED", challengeId: challenge.id }
});

// 3. Upgrade creator to CONTRIBUTOR if they are currently a LEARNER
await prisma.user.updateMany({
  where: { id: scenario.createdByUserId, role: "LEARNER" },
  data:  { role: "CONTRIBUTOR" }
});
```

**The newly promoted Challenge immediately becomes available through:**
- `GET /challenges` (public catalogue)
- `POST /challenges/:id/start` (standard sandbox start — unchanged)
- `GET /challenges/:id/checks` (sandbox-worker grading — unchanged)

No changes are required to the sandbox provisioning pipeline, check evaluation, or submission grading. The `checks` JSON field from `OrgScenario` maps directly to the `checkId` values that `sandbox-worker` looks for in `ChallengeCheckResult`.

---

## 7. Frontend Pages & Components

### 7.1 New Pages

| Route | Description | Required Access |
|-------|-------------|----------------|
| `/onboarding/create-org` | Step to create org after individual onboarding | Authenticated, orgId = null |
| `/teams` | Main B2B dashboard (exists, needs full API wiring) | Org ADMIN+ |
| `/teams/settings` | Org settings: rename, danger zone, notifications | Org OWNER |
| `/teams/scenarios/new` | 4-step scenario creation form | Org ADMIN+ |
| `/teams/scenarios/:id/edit` | Edit existing private scenario | Org ADMIN+ or creator |
| `/join/:token` | Accept org invite link | Public URL; auth required to complete |

### 7.2 Modifications to Existing Pages

| Page | Change |
|------|--------|
| `/dashboard` | Add "Org Assigned Paths" card — calls `GET /me/assigned-paths` |
| `/roadmaps` | Show "📌 Assigned by [Org]" badge on org-assigned paths |
| `/challenges` | Show org attribution on challenges that were contributed by an org |

### 7.3 Component Map for `/teams`

```
TeamsPage (/teams)
├── TeamsHeader                 — org name, plan badge (from GET /orgs/me), settings link
├── TeamOverview                — 4 stat cards (GET /orgs/:id/analytics)
│
├── [grid: 2/3 + 1/3 columns]
│   ├── TeamMembersList         — (GET /orgs/:id/members)
│   │   ├── InviteMemberModal   — email field, POST /orgs/:id/invites
│   │   └── MemberActionsMenu   — View Profile | Assign Path | Change Role | Remove
│   │
│   └── TeamAnalyticsPanel      — line chart (GET /orgs/:id/analytics/trend)
│
└── CustomScenarios             — grid (GET /orgs/:id/scenarios)
    └── ScenarioCard            — title, difficulty, type, Launch, Contribute buttons
```

### 7.4 Scenario Builder — Step-by-Step Form

```
Step 1 — Basics
  ├── Title (required, max 80 chars)
  ├── Description (required, max 500 chars)
  ├── Difficulty radio: JUNIOR | MID | SENIOR
  └── Category select: existing Category enum values

Step 2 — Environment
  ├── Docker Image name (required) — org's container registry image
  └── Setup Instructions — markdown editor with live preview
       (describes the broken/misconfigured state the engineer will encounter)

Step 3 — Grading Checks
  ├── Add check rows: { checkId (slug), description, passCriteria }
  ├── Minimum 1 check required
  └── checkId values are what sandbox-worker reports in ChallengeCheckResult

Step 4 — Preview & Save
  ├── Read-only summary of all entered data
  ├── "Save as Private" → POST /orgs/:id/scenarios (status=PRIVATE)
  └── "Save & Submit for Review" → same endpoint + status=PENDING_REVIEW
```

---

## 8. Access Control Matrix

| Action | Org OWNER | Org ADMIN | Org MEMBER | Platform ADMIN |
|--------|-----------|-----------|------------|----------------|
| View `/teams` dashboard | ✅ | ✅ | ❌ | ✅ |
| View member list | ✅ | ✅ | ❌ | ✅ |
| Invite member | ✅ | ✅ | ❌ | ✅ |
| Remove member | ✅ | ✅ (not owner) | ❌ | ✅ |
| Change member org role | ✅ | ❌ | ❌ | ✅ |
| Rename org / edit settings | ✅ | ❌ | ❌ | ✅ |
| Delete org | ✅ | ❌ | ❌ | ✅ |
| Assign path to org or member | ✅ | ✅ | ❌ | ✅ |
| View own assigned paths | ✅ | ✅ | ✅ | ✅ |
| Create / edit scenario | ✅ | ✅ | ❌ | ✅ |
| View + launch private scenarios | ✅ | ✅ | ✅ | ✅ |
| Submit scenario for contribution | ✅ | ✅ | ❌ | ✅ |
| Approve / reject contributions | ❌ | ❌ | ❌ | ✅ (platform only) |

---

## 9. Notification Events

All events follow the existing transactional outbox pattern (`OutboxEvent` table) and are consumed by `notification-service`:

| Event Type | Trigger | Delivery |
|-----------|---------|----------|
| `org.invite.sent` | Admin invites a member | Email to invitee with join link + 7-day expiry |
| `org.member.joined` | Invite accepted | Email to org admin |
| `org.scenario.submitted` | Admin submits for contribution | Email to platform admins queue |
| `org.scenario.approved` | Platform admin approves | Email to org admin + creator |
| `org.scenario.rejected` | Platform admin rejects | Email to org admin with rejection reason |
| `org.weekly.digest` | Cron: Monday 09:00 org timezone | Email to org admins (+ optional Slack webhook) |

---

## 10. Acceptance Criteria

### AC-01: Org Creation
- [ ] Authenticated user without `orgId` sees "Create Organization" prompt after onboarding tour
- [ ] On creation: `Org` record created, `OrgMember` created with `orgRole=OWNER`, `User.orgId` set
- [ ] Auth token refreshed with `orgId` and `orgRole=OWNER` claims within one cycle

### AC-02: Invite & Onboard Member
- [ ] Inviting an email creates an `OrgInvite` and dispatches email via notification-service
- [ ] Invite link: new user → register page; existing user → login page; both auto-join on auth
- [ ] After join: `OrgMember` created, `User.orgId` set, invite `status=ACCEPTED`
- [ ] Invite rejects (409) if org has reached `seatsPurchased` limit

### AC-03: Team Dashboard Live Data
- [ ] All 4 overview stat cards show values fetched from `GET /orgs/:id/analytics`
- [ ] Member table shows all org members with current sandbox name or "—"
- [ ] Empty state renders correctly when member list is empty
- [ ] Unauthenticated users redirected to `/login`; authenticated users without org see 403 page

### AC-04: Path Assignment
- [ ] Admin can assign a public roadmap to the whole org
- [ ] Member sees "Assigned" badge on that roadmap on their `/roadmaps` page
- [ ] Completions on org-assigned paths are tracked identically to self-enrolled paths (existing Completion model, no new logic)

### AC-05: Custom Scenario — Private Use
- [ ] All 4 steps of the scenario builder are completable without errors
- [ ] Saved scenario appears in `/teams` scenarios grid for org members
- [ ] Non-org users attempting to start the scenario receive 403
- [ ] Scenario launch uses the standard `POST /challenges/:id/start` endpoint (scenario must be internally represented as a `Challenge` or be promoted first)

### AC-06: Scenario Contribution & Promotion
- [ ] Submitted scenario appears in platform admin review queue
- [ ] On approval: `Challenge` record created, visible in `GET /challenges` within 60 seconds of approval
- [ ] Org attribution displayed on the challenge detail page
- [ ] Creator's global `role` updated to `CONTRIBUTOR` if it was `LEARNER`
- [ ] Org members can start the newly promoted challenge via the standard flow with no special handling

---

## 11. Out of Scope for This Version

- Stripe / billing portal integration (plan upgrades handled offline)
- SSO / SAML for enterprise identity providers
- Custom org branding or white-labelling
- Org-scoped leaderboards (global leaderboard already covers this)
- Real-time terminal observation (admin watching a member's sandbox live)
- Private roadmap node graph builder (org can assign existing roadmaps, not author new graph structures)
- Scenario versioning or changelogs
