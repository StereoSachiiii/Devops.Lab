# ADR 001: The Monorepo Decision

## Status
Accepted

## Why?
We have multiple services (Next, Node, Go) and infra modules that need to move together. A monorepo lets us share types, enforce a unified CI/CD, and keep our infrastructure code right next to the app logic. It's the best way for contributors to see the "whole picture."

## The Setup
- **Workspaces**: Managed via npm and Turborepo.
- **Apps**: `apps/web` (Next.js).
- **Services**: Domain logic (Node) + High-concurrency workers (Go). Go will be used later in development for the high-concurrency tasks like sandbox and simulations.
- **Packages**: Shared code for DB (Prisma), Messaging (Kafka/Rabbit), and Types.

## Tradeoffs
It adds some initial setup friction, but the gain in end-to-end type safety and visibility is worth the cost.
