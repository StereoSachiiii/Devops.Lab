# Contributing Guide

## Local Setup
1. **Dependencies**: `npm install` (root)
2. **Environment**: Copy `.env.example` to `.env` in the relevant service/app folders.
3. **Run Dev**: `npm run dev:web` (Next.js) or `npx turbo dev` (All services).
4. **Build**: `npx turbo build`.

## Branching & PRs
- **Branch naming**: `feature/*`, `fix/*`, `infra/*`.
- **Commits**: Use descriptive, imperative messages (e.g., "add kafka producer to challenge-service").
- **PRs**: Small, focused PRs are preferred. One service per PR if possible.

## Engineering Standards
- **Type Safety**: No `any`. Define shared types in `packages/types`.
- **Linting**: Enforced via ESLint + Prettier. Run `npm run lint` before pushing.
- **Observability**: New services must include OpenTelemetry instrumentation via `@devops/observability`.
- **ADRs**: Major architectural changes require a new record in `docs/adr/`. Follow the existing numbering.

## Service Ownership (MVP Phase)
- **Sanira**: `services/challenge`, `services/sandbox`
- **Pabodha**: `apps/web`, `services/auth`
- **sachin**: `infra/*`, `packages/*`
