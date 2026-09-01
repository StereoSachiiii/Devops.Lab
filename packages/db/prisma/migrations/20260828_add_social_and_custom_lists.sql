-- CreateEnum
CREATE TYPE "ShareTokenType" AS ENUM ('CHALLENGE_SOLVE', 'BADGE_EARNED', 'QUIZ_MASTERY', 'CERTIFICATE');

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" "ShareTokenType" NOT NULL DEFAULT 'CHALLENGE_SOLVE',
    "userId" TEXT NOT NULL,
    "challengeId" TEXT,
    "metadata" JSONB NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeComment" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentVote" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_idx" ON "QuizAttempt"("userId");
CREATE INDEX "QuizAttempt_quizId_idx" ON "QuizAttempt"("quizId");
CREATE INDEX "QuizAttempt_userId_quizId_idx" ON "QuizAttempt"("userId", "quizId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareToken_token_key" ON "ShareToken"("token");
CREATE INDEX "ShareToken_token_idx" ON "ShareToken"("token");
CREATE INDEX "ShareToken_userId_idx" ON "ShareToken"("userId");

-- CreateIndex
CREATE INDEX "ChallengeComment_challengeId_idx" ON "ChallengeComment"("challengeId");
CREATE INDEX "ChallengeComment_userId_idx" ON "ChallengeComment"("userId");
CREATE INDEX "ChallengeComment_parentId_idx" ON "ChallengeComment"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentVote_commentId_userId_key" ON "CommentVote"("commentId", "userId");
CREATE INDEX "CommentVote_commentId_idx" ON "CommentVote"("commentId");
CREATE INDEX "CommentVote_userId_idx" ON "CommentVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeList_userId_name_key" ON "ChallengeList"("userId", "name");
CREATE INDEX "ChallengeList_userId_idx" ON "ChallengeList"("userId");
CREATE INDEX "ChallengeList_isPublic_idx" ON "ChallengeList"("isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeListItem_listId_challengeId_key" ON "ChallengeListItem"("listId", "challengeId");
CREATE INDEX "ChallengeListItem_listId_idx" ON "ChallengeListItem"("listId");
CREATE INDEX "ChallengeListItem_challengeId_idx" ON "ChallengeListItem"("challengeId");

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareToken" ADD CONSTRAINT "ShareToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareToken" ADD CONSTRAINT "ShareToken_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeComment" ADD CONSTRAINT "ChallengeComment_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeComment" ADD CONSTRAINT "ChallengeComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeComment" ADD CONSTRAINT "ChallengeComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChallengeComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentVote" ADD CONSTRAINT "CommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ChallengeComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentVote" ADD CONSTRAINT "CommentVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeList" ADD CONSTRAINT "ChallengeList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeListItem" ADD CONSTRAINT "ChallengeListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ChallengeList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeListItem" ADD CONSTRAINT "ChallengeListItem_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
