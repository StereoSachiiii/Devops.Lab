-- Migration: Add Row Level Security (RLS) to LabSession and Submission tables
-- This ensures users can only access their own data even if application-level
-- queries are bypassed (e.g. compromised service, direct DB access).
--
-- Usage pattern: the application must SET app.current_user_id = '<userId>'
-- at the start of each request transaction (or session) for RLS to work.
-- Prisma does not natively support this; use $executeRaw in a transaction.

-- ---------------------------------------------------------------------------
-- LabSession RLS
-- ---------------------------------------------------------------------------

ALTER TABLE "LabSession" ENABLE ROW LEVEL SECURITY;

-- Admins and service accounts (connected as the DB owner role) bypass RLS
ALTER TABLE "LabSession" FORCE ROW LEVEL SECURITY;

-- Users may only SELECT rows where userId matches the session variable
CREATE POLICY labsession_select_own
  ON "LabSession"
  FOR SELECT
  USING (
    "userId" = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Users may only INSERT rows for themselves
CREATE POLICY labsession_insert_own
  ON "LabSession"
  FOR INSERT
  WITH CHECK (
    "userId" = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Users may only UPDATE/DELETE their own rows
CREATE POLICY labsession_update_own
  ON "LabSession"
  FOR UPDATE
  USING (
    "userId" = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

CREATE POLICY labsession_delete_own
  ON "LabSession"
  FOR DELETE
  USING (
    "userId" = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- ---------------------------------------------------------------------------
-- Submission RLS
-- ---------------------------------------------------------------------------

ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submission" FORCE ROW LEVEL SECURITY;

CREATE POLICY submission_select_own
  ON "Submission"
  FOR SELECT
  USING (
    "userId" = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

CREATE POLICY submission_insert_own
  ON "Submission"
  FOR INSERT
  WITH CHECK (
    "userId" = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

CREATE POLICY submission_update_own
  ON "Submission"
  FOR UPDATE
  USING (
    "userId" = current_setting('app.current_user_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- ---------------------------------------------------------------------------
-- Compound indexes for common access patterns (not RLS, but included here
-- as they pair with the security policies above)
-- ---------------------------------------------------------------------------

-- Speeds up queries like "find active session for this user+challenge"
CREATE INDEX IF NOT EXISTS idx_labsession_user_challenge
  ON "LabSession" ("userId", "challengeId");

-- Speeds up "get all submissions for this user"
CREATE INDEX IF NOT EXISTS idx_submission_user
  ON "Submission" ("userId");
