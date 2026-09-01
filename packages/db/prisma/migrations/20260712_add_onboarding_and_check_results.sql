-- Migration: add_onboarding_and_check_results
-- Purpose:
--   1. Add onboarding state tracking to User (DB is source of truth for tour gating).
--   2. Add ChallengeCheckResult table for per-check validator result persistence.
--      This decouples "how far did the user get" from the sandbox lifecycle:
--      if a sandbox dies mid-challenge, these rows answer "3 of 5 checks verified"
--      before the replacement sandbox is warm.

-- ── 1. New enum types ────────────────────────────────────────────────────────

CREATE TYPE "OnboardingState" AS ENUM ('NEW', 'TOUR_DISMISSED', 'TOUR_COMPLETED');
CREATE TYPE "CheckStatus" AS ENUM ('PASSED', 'FAILED');

-- ── 2. Onboarding columns on User ────────────────────────────────────────────
-- onboardingState:   current tour completion state for this user.
-- onboardingVersion: the tour version the user last saw. Bump CURRENT_TOUR_VERSION
--                    in challenge.routes.ts when the tour is redesigned — users
--                    whose onboardingVersion < CURRENT_TOUR_VERSION will see the
--                    tour again without needing a data migration that resets everyone.

ALTER TABLE "User"
  ADD COLUMN "onboardingState"   "OnboardingState" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "onboardingVersion" INTEGER           NOT NULL DEFAULT 1;

-- ── 3. ChallengeCheckResult table ────────────────────────────────────────────
-- One row per (user, challenge, check) — upserted each time the validator runs.
-- The @@unique constraint makes repeated validator runs on the same check idempotent.

CREATE TABLE "ChallengeCheckResult" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "userId"      TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "checkId"     TEXT NOT NULL,  -- e.g. "pod_running", "service_exposed"
    "status"      "CheckStatus" NOT NULL,
    "message"     TEXT NOT NULL DEFAULT '',
    "lastRunAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeCheckResult_pkey" PRIMARY KEY ("id")
);

-- Unique constraint — makes upserts safe, prevents duplicate check rows
CREATE UNIQUE INDEX "ChallengeCheckResult_userId_challengeId_checkId_key"
    ON "ChallengeCheckResult"("userId", "challengeId", "checkId");

-- Index for the common query pattern: "all checks for this user on this challenge"
CREATE INDEX "ChallengeCheckResult_userId_challengeId_idx"
    ON "ChallengeCheckResult"("userId", "challengeId");

-- Foreign key to User with CASCADE delete — clean up when a user account is deleted
ALTER TABLE "ChallengeCheckResult"
    ADD CONSTRAINT "ChallengeCheckResult_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
