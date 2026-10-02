-- CreateTable
CREATE TABLE "PeerReview" (
    "id" TEXT NOT NULL,
    "reviewerName" VARCHAR(255) NOT NULL,
    "conference" VARCHAR(255) NOT NULL,
    "paperCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PeerReview_pkey" PRIMARY KEY ("id")
);
