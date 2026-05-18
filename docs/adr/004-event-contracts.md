# ADR 004: Event Contract Management

## Status
Accepted

## Why?
The platform publishes events from Go (sandbox-service) and consumes them in TypeScript
(progress-service, notification-service). Without a single source of truth, the payload
schemas drift between languages silently — the compiler won't catch it.

## The Decision
All event schemas are defined once in `docs/contracts/events.yaml` (AsyncAPI 2.6 format).
Language-specific implementations (TypeScript classes in `@devops/messaging`, Go structs in
`services/sandbox/internal/messaging`) are derived from this file by hand.

## Rules
1. **New event?** Define it in `events.yaml` first. PR must include the YAML change.
2. **Changing a payload?** Bump the `version` field in the YAML entry. Update both the
   Go struct and the TypeScript class in the same PR.
3. **The YAML is truth.** If a Go struct and a TypeScript class disagree, the YAML wins.

## What We Don't Do (Yet)
We do NOT auto-generate code from the spec. The team is small and the overhead of a
code-generation pipeline (buf, AsyncAPI generator) outweighs the benefit right now.
Revisit when we have 5+ events in active development simultaneously.

## Tradeoffs
Manual sync is a discipline cost, not a tooling cost. But it keeps the build simple
and the mental model clear for all contributors.
