-- AlterTable Article: add thumbnailUrl
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;
