-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'TEAM');

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planTier" "PlanTier" NOT NULL DEFAULT 'FREE',
    "seatsPurchased" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "orgId" TEXT;

-- AlterTable
ALTER TABLE "LearningPath" ADD COLUMN "orgId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPath" ADD CONSTRAINT "LearningPath_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ENABLE RLS
ALTER TABLE "Org" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LearningPath" ENABLE ROW LEVEL SECURITY;

-- If app.current_org_id is set to a UUID, restrict. Otherwise, allow all.
CREATE POLICY "org_isolation" ON "Org"
FOR ALL USING (
    current_setting('app.current_org_id', true) = '' OR
    id = current_setting('app.current_org_id', true)
);

CREATE POLICY "user_org_isolation" ON "User"
FOR ALL USING (
    current_setting('app.current_org_id', true) = '' OR
    "orgId" = current_setting('app.current_org_id', true) OR
    "orgId" IS NULL
);

CREATE POLICY "learning_path_org_isolation" ON "LearningPath"
FOR ALL USING (
    current_setting('app.current_org_id', true) = '' OR
    "orgId" = current_setting('app.current_org_id', true) OR
    "orgId" IS NULL
);
