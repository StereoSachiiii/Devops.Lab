-- Fail-closed, forced RLS for all tenant-owned tables.
-- Context GUCs (set transaction-locally by createTenantClient):
--   app.current_org_id, app.current_user_id
-- Trusted jobs may set app.bypass_rls = 'true' (see createBypassClient in packages/db/index.ts).
-- A request with NO context (NULL/'' for both) sees and writes nothing on these tables.
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION app_org() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.current_org_id', true), '') $$;

CREATE OR REPLACE FUNCTION app_uid() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.current_user_id', true), '') $$;

CREATE OR REPLACE FUNCTION app_bypass() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'true' $$;

-- ───────────── Replace fail-open policies ─────────────
DROP POLICY IF EXISTS "org_isolation" ON "Org";
DROP POLICY IF EXISTS "user_org_isolation" ON "User";
DROP POLICY IF EXISTS "learning_path_org_isolation" ON "LearningPath";

ALTER TABLE "Org" ENABLE ROW LEVEL SECURITY;  ALTER TABLE "Org" FORCE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY; ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
ALTER TABLE "LearningPath" ENABLE ROW LEVEL SECURITY; ALTER TABLE "LearningPath" FORCE ROW LEVEL SECURITY;

-- Org: visible/writable only for the current org. Any authenticated user may create an org.
DROP POLICY IF EXISTS org_rw ON "Org";
CREATE POLICY org_rw ON "Org" FOR ALL
  USING (id = app_org() OR app_bypass())
  WITH CHECK (id = app_org() OR app_bypass());
DROP POLICY IF EXISTS org_insert_auth ON "Org";
CREATE POLICY org_insert_auth ON "Org" FOR INSERT
  WITH CHECK (app_uid() IS NOT NULL);

-- User: any authenticated context may read users (public profiles/leaderboard);
-- writes only to own row or same-org rows. No context => nothing.
DROP POLICY IF EXISTS user_select ON "User";
CREATE POLICY user_select ON "User" FOR SELECT
  USING (app_uid() IS NOT NULL OR app_org() IS NOT NULL OR app_bypass());
DROP POLICY IF EXISTS user_write ON "User";
CREATE POLICY user_write ON "User" FOR UPDATE
  USING (id = app_uid() OR ("orgId" IS NOT NULL AND "orgId" = app_org()) OR app_bypass())
  WITH CHECK (id = app_uid() OR ("orgId" IS NOT NULL AND "orgId" = app_org()) OR app_bypass());
DROP POLICY IF EXISTS user_delete ON "User";
CREATE POLICY user_delete ON "User" FOR DELETE
  USING (id = app_uid() OR app_bypass());
-- Registration happens before any identity exists: only trusted/bypass path may insert.
DROP POLICY IF EXISTS user_insert ON "User";
CREATE POLICY user_insert ON "User" FOR INSERT
  WITH CHECK (app_bypass());

-- LearningPath: global catalog (orgId IS NULL) is readable by everyone; org paths only by that org.
DROP POLICY IF EXISTS lp_select ON "LearningPath";
CREATE POLICY lp_select ON "LearningPath" FOR SELECT
  USING ("orgId" IS NULL OR "orgId" = app_org() OR app_bypass());
DROP POLICY IF EXISTS lp_write ON "LearningPath";
CREATE POLICY lp_write ON "LearningPath" FOR ALL
  USING (("orgId" IS NOT NULL AND "orgId" = app_org()) OR app_bypass())
  WITH CHECK (("orgId" IS NOT NULL AND "orgId" = app_org()) OR app_bypass());

-- LabSession / Submission: normalise to NULLIF'd helpers and add missing Submission delete.
DROP POLICY IF EXISTS submission_delete_own ON "Submission";
CREATE POLICY submission_delete_own ON "Submission" FOR DELETE
  USING ("userId" = app_uid() OR app_bypass());

-- ───────────── Org-owned tables ─────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['OrgInvite','OrgScenario'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_scope ON %I', t);
    EXECUTE format($p$CREATE POLICY org_scope ON %I FOR ALL
      USING ("orgId" = app_org() OR app_bypass())
      WITH CHECK ("orgId" = app_org() OR app_bypass())$p$, t);
  END LOOP;
END $$;

-- OrgMember / PathAssignment: org scope, plus a user may see their own rows.
ALTER TABLE "OrgMember" ENABLE ROW LEVEL SECURITY; ALTER TABLE "OrgMember" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orgmember_select ON "OrgMember";
CREATE POLICY orgmember_select ON "OrgMember" FOR SELECT
  USING ("orgId" = app_org() OR "userId" = app_uid() OR app_bypass());
DROP POLICY IF EXISTS orgmember_write ON "OrgMember";
CREATE POLICY orgmember_write ON "OrgMember" FOR ALL
  USING ("orgId" = app_org() OR app_bypass())
  WITH CHECK ("orgId" = app_org() OR app_bypass());

ALTER TABLE "PathAssignment" ENABLE ROW LEVEL SECURITY; ALTER TABLE "PathAssignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pathassign_select ON "PathAssignment";
CREATE POLICY pathassign_select ON "PathAssignment" FOR SELECT
  USING ("orgId" = app_org() OR "userId" = app_uid() OR app_bypass());
DROP POLICY IF EXISTS pathassign_write ON "PathAssignment";
CREATE POLICY pathassign_write ON "PathAssignment" FOR ALL
  USING ("orgId" = app_org() OR app_bypass())
  WITH CHECK ("orgId" = app_org() OR app_bypass());

-- ───────────── User-owned tables ─────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['QuizAttempt','ChallengeBookmark','ChallengeCheckResult','UserSession'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS user_scope ON %I', t);
    EXECUTE format($p$CREATE POLICY user_scope ON %I FOR ALL
      USING ("userId" = app_uid() OR app_bypass())
      WITH CHECK ("userId" = app_uid() OR app_bypass())$p$, t);
  END LOOP;
END $$;

-- Completion: any authenticated context may READ (leaderboards / public profiles); writes own only.
ALTER TABLE "Completion" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Completion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS completion_select ON "Completion";
CREATE POLICY completion_select ON "Completion" FOR SELECT
  USING (app_uid() IS NOT NULL OR app_bypass());
DROP POLICY IF EXISTS completion_write ON "Completion";
CREATE POLICY completion_write ON "Completion" FOR ALL
  USING ("userId" = app_uid() OR app_bypass())
  WITH CHECK ("userId" = app_uid() OR app_bypass());

-- ChallengeList: owner full access; public lists readable by any authenticated user.
ALTER TABLE "ChallengeList" ENABLE ROW LEVEL SECURITY; ALTER TABLE "ChallengeList" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clist_select ON "ChallengeList";
CREATE POLICY clist_select ON "ChallengeList" FOR SELECT
  USING ("userId" = app_uid() OR ("isPublic" AND app_uid() IS NOT NULL) OR app_bypass());
DROP POLICY IF EXISTS clist_write ON "ChallengeList";
CREATE POLICY clist_write ON "ChallengeList" FOR ALL
  USING ("userId" = app_uid() OR app_bypass())
  WITH CHECK ("userId" = app_uid() OR app_bypass());

-- ChallengeListItem: follows its parent list (SELECT: visible list; writes: owned list).
ALTER TABLE "ChallengeListItem" ENABLE ROW LEVEL SECURITY; ALTER TABLE "ChallengeListItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clitem_select ON "ChallengeListItem";
CREATE POLICY clitem_select ON "ChallengeListItem" FOR SELECT
  USING (app_bypass() OR EXISTS (
    SELECT 1 FROM "ChallengeList" l WHERE l.id = "ChallengeListItem"."listId"));
DROP POLICY IF EXISTS clitem_write ON "ChallengeListItem";
CREATE POLICY clitem_write ON "ChallengeListItem" FOR ALL
  USING (app_bypass() OR EXISTS (
    SELECT 1 FROM "ChallengeList" l WHERE l.id = "ChallengeListItem"."listId" AND l."userId" = app_uid()))
  WITH CHECK (app_bypass() OR EXISTS (
    SELECT 1 FROM "ChallengeList" l WHERE l.id = "ChallengeListItem"."listId" AND l."userId" = app_uid()));
