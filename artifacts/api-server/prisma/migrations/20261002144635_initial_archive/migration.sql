-- CreateTable
CREATE TABLE "Paper" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "shortTitle" TEXT,
    "summary" TEXT,
    "abstract" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Preprint',
    "venue" TEXT,
    "submittedDate" TIMESTAMPTZ(3),
    "year" INTEGER NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "externalLinks" JSONB NOT NULL DEFAULT '[]',
    "seoImage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Author" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "affiliation" TEXT,
    "profileUrl" TEXT,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperAuthor" (
    "paperId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaperAuthor_pkey" PRIMARY KEY ("paperId","authorId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Paper_slug_key" ON "Paper"("slug");

-- CreateIndex
CREATE INDEX "Paper_published_year_idx" ON "Paper"("published", "year");

-- CreateIndex
CREATE INDEX "Paper_featured_published_idx" ON "Paper"("featured", "published");

-- CreateIndex
CREATE INDEX "Paper_year_idx" ON "Paper"("year");

-- CreateIndex
CREATE INDEX "Paper_updatedAt_idx" ON "Paper"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Author_name_key" ON "Author"("name");

-- CreateIndex
CREATE INDEX "PaperAuthor_authorId_idx" ON "PaperAuthor"("authorId");

-- AddForeignKey
ALTER TABLE "PaperAuthor" ADD CONSTRAINT "PaperAuthor_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperAuthor" ADD CONSTRAINT "PaperAuthor_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
