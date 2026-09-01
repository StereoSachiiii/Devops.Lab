-- Migration: Add Performance Indexes
-- Generated: 2026-08-27

-- 1. User: Leaderboard and Community Discovery
DROP INDEX IF EXISTS "User_username_idx";
CREATE INDEX IF NOT EXISTS "User_xp_desc_idx" ON "User"("xp" DESC);
CREATE INDEX IF NOT EXISTS "User_isPublic_currentStreak_xp_idx" ON "User"("isPublic", "currentStreak" DESC, "xp" DESC);

-- 2. Submission: User History and Solved Lookups
CREATE INDEX IF NOT EXISTS "Submission_userId_createdAt_desc_idx" ON "Submission"("userId", "createdAt" DESC);

-- 3. LabSession: Feed and Reaper Queries
CREATE INDEX IF NOT EXISTS "LabSession_userId_status_endedAt_desc_idx" ON "LabSession"("userId", "status", "endedAt" DESC);
CREATE INDEX IF NOT EXISTS "LabSession_status_startedAt_idx" ON "LabSession"("status", "startedAt");

-- 4. UserBadge: Feed Unlocked Badges Query
CREATE INDEX IF NOT EXISTS "UserBadge_userId_earnedAt_desc_idx" ON "UserBadge"("userId", "earnedAt" DESC);

-- 5. Edge: Reverse Graph Traversal and Recursive CTE
CREATE INDEX IF NOT EXISTS "Edge_toId_idx" ON "Edge"("toId");

-- 6. Module & Challenge Foreign Keys
CREATE INDEX IF NOT EXISTS "Module_pathId_idx" ON "Module"("pathId");
CREATE INDEX IF NOT EXISTS "Challenge_moduleId_idx" ON "Challenge"("moduleId");

-- 7. SecurityLog: User Audit Logs
CREATE INDEX IF NOT EXISTS "SecurityLog_userId_createdAt_desc_idx" ON "SecurityLog"("userId", "createdAt" DESC);
