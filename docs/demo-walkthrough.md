# DevOps.Lab End-to-End Visual Demo & System Walkthrough

This document records the live end-to-end execution of the DevOps.Lab production stack, including actual system health statuses, user journeys, route verifications, and visual evidence screenshots.

---

## 1. System Health Status

Captured against the running production container stack:

| Service | Container Name | Health Status | Verified Ports / Protocol |
|---|---|---|---|
| **Kong Edge API Gateway** | `api-gateway` | `healthy` | `8005:8000/tcp`, `8443/tcp` |
| **Auth Microservice** | `auth-service` | `healthy` | Internal `3002/health` |
| **Core Microservice** | `core-service` | `healthy` | Internal `3003/health` |
| **Notification Service** | `notification-service` | `healthy` | Internal `3004/health` |
| **PostgreSQL 16** | `postgres` | `healthy` | `5432:5432/tcp` |
| **RabbitMQ Event Broker** | `rabbitmq` | `healthy` | `5672:5672/tcp`, `15672/tcp` |
| **Redis Cache / Locks** | `redis` | `healthy` | `6379:6379/tcp` |
| **Redpanda Kafka Cluster** | `redpanda` | `healthy` | Internal `9092`, External `19092` |
| **Sandbox Router Proxy** | `sandbox-router` | `healthy` | `8080:8080/tcp` |
| **Sandbox Worker Daemon** | `sandbox-worker` | `healthy` | Internal `8090/health` |
| **Web Frontend (Next.js)** | `web-frontend` | `healthy` | `3000:3000/tcp` |

> [!NOTE]
> **Reconciled with Codebase (2026-09-24)**
> - **Classification:** STALE
> - **Previous text claimed:** PostgreSQL runs on port `5432:5432/tcp` in development.
> - **Actual code behavior:** In local development (`dev/docker-compose.dev.yml` and root `.env`), PostgreSQL binds to host port `5444:5432` to avoid collisions with any local PostgreSQL instance installed on the host OS. In production Docker compose (`deploy/docker-compose.prod.yml`), it binds to internal port `5432`.
> - **Source of truth:** [`dev/docker-compose.dev.yml:9`](file:///c:/Users/sachin%20lakshitha/devop/dev/docker-compose.dev.yml#L9) and [`.env:10`](file:///c:/Users/sachin%20lakshitha/devop/.env#L10)
> - **Why this matters:** If you try running `psql -p 5432` from your host machine based on this walkthrough, the connection will be refused or hit your local machine's Postgres. You have to connect on port `5444`.

---

## 2. Visual Walkthrough & Evidence Artifacts

All screenshots below were captured from a live browser session running against the production stack.

### 2.1 Landing Page
The primary entry point showing the value proposition, live stats counters, interactive terminal teaser, and role-based learning tracks.

- **URL:** `http://localhost:3000/`
- **Screenshot Evidence:** `docs/screenshots/landing_page_1788835224908.png`

---

### 2.2 Registration & Authentication
Clean onboarding flow with input validation, password strength indicators, and OAuth integration buttons.

- **URL:** `http://localhost:3000/register`
- **Screenshot Evidence:** `docs/screenshots/register_page_1788835234941.png`
- **Verified Fresh User:** `demouser_1725763845` (`demouser_1725763845@example.com`)
- **Observed Result:** `POST /api/auth/register` returned `201 Created` and issued valid JWT cookies.

---

### 2.3 Learner Dashboard
The post-login dashboard showing the user greeting, daily streak calendar widget, XP progression meters, active lab sessions, and recent community activity feed.

- **URL:** `http://localhost:3000/dashboard`
- **Screenshot Evidence:** `docs/screenshots/dashboard_page_1788835270592.png`

---

### 2.4 Challenges Catalog
Searchable, filterable catalog containing 12 seeded challenges spanning 37 technical domains (Linux, SSH, Docker, Kubernetes, Nginx, Terraform, AWS, Prometheus).

- **URL:** `http://localhost:3000/challenges`
- **Screenshot Evidence:** `docs/screenshots/challenges_catalog_1788835313536.png`

---

### 2.5 Challenge Workspace & Interactive Terminal
Interactive challenge environment featuring the task specification, real-time validation trigger, hints accordion, and PTY terminal container.

- **URL:** `http://localhost:3000/challenges/cmszcvcpq000mlkwlz73flxbz`
- **Screenshot Evidence:** `docs/screenshots/challenge_detail_workspace_1788835355233.png`

---

### 2.6 Editorial Solution & Root Cause Guide (Locked State)
Challenge postmortem protection ensuring users must solve the challenge hands-on before gaining access to the official deep-dive guide.

- **Screenshot Evidence:** `docs/screenshots/editorial_locked_tab_1788835378977.png`
- **Observed State:** Locked with clear explanation message: *"Editorial Solution Locked — Solve and validate this challenge in the active terminal sandbox to unlock the official root-cause analysis, step-by-step fix, and SRE postmortem guide."*

---

### 2.7 Community & Social Discovery
Social directory for discovering fellow platform engineers, following peers, and inspecting public engineering achievements.

- **URL:** `http://localhost:3000/community`
- **Screenshot Evidence:** `docs/screenshots/community_page_1788835393329.png`

---

### 2.8 Teams & B2B Organization (Empty State)
Enterprise team management and skill assessment interface for organization accounts, rendering empty state for individual learners.

- **URL:** `http://localhost:3000/teams`
- **Screenshot Evidence:** `docs/screenshots/teams_page_1788835403084.png`
- **Observed State:** *"No Organization Found — You are not currently a member of any organization or enterprise team."*

---

### 2.9 Public & Personal Profile
User profile hub showcasing earned skill badges, longest streak, total XP, connected identity accounts, and public activity history.

- **URL:** `http://localhost:3000/profile`
- **Screenshot Evidence:** `docs/screenshots/profile_page_1788835415346.png`
