-- AlterTable Challenge: add guestTrialEligible
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "guestTrialEligible" BOOLEAN NOT NULL DEFAULT false;

-- Update the 2 selected JUNIOR challenges to be guest trial eligible
UPDATE "Challenge"
SET "guestTrialEligible" = true
WHERE "title" IN ('Fix the Broken Nginx Config', 'Fix File Permissions');
