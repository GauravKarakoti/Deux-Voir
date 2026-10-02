import { Router, type IRouter } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import {
  CreatePaperBody,
  CreatePaperResponse,
  DeletePaperParams,
  DeletePaperResponse,
  GetAdminDashboardResponse,
  GetAdminPaperParams,
  GetAdminPaperResponse,
  GetHomePapersResponse,
  GetPublicPaperParams,
  GetPublicPaperResponse,
  ListAdminPapersResponse,
  ListPublicPapersResponse,
  SetPaperPublishedBody,
  SetPaperPublishedParams,
  SetPaperPublishedResponse,
  UpdatePaperBody,
  UpdatePaperParams,
  UpdatePaperResponse,
  UploadResearchImageResponse,
} from "@workspace/api-zod";
import type { Prisma } from "@prisma/client";
import { requireAdmin, isSameOriginRequest } from "../lib/admin-session";
import { normalizePaperInput, paperWithAuthors, serializePaper } from "../lib/papers";
import { prisma } from "../lib/prisma";

const router: IRouter = Router();
const UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024;

const paperOrdering = [
  { year: "desc" },
  { submittedDate: { sort: "desc", nulls: "last" } },
  { sortOrder: "asc" },
  { createdAt: "desc" },
] satisfies Prisma.PaperOrderByWithRelationInput[];

const requireSameOrigin: import("express").RequestHandler = (req, res, next) => {
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: "Request origin was not accepted" });
    return;
  }
  next();
};

function parseError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The request could not be completed.";
}

function isDuplicateSlug(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function validatePaperSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim().toLowerCase());
}

function errorResponse(
  req: import("express").Request,
  res: import("express").Response,
  error: unknown,
  message: string,
) {
  if (isDuplicateSlug(error)) {
    res.status(409).json({ error: "A paper with that slug already exists." });
    return;
  }
  req.log.error({ err: error }, message);
  res.status(500).json({ error: "The request could not be completed." });
}

function authorWrites(authors: ReturnType<typeof normalizePaperInput>["authors"]) {
  return authors.map((author, sortOrder) => ({
    sortOrder,
    author: {
      connectOrCreate: {
        where: { name: author.name },
        create: {
          name: author.name,
          affiliation: author.affiliation,
          profileUrl: author.profileUrl,
        },
      },
    },
  }));
}

router.get("/papers/home", async (req, res) => {
  try {
    let papers = await prisma.paper.findMany({
      where: { published: true, featured: true },
      include: paperWithAuthors,
      orderBy: paperOrdering,
      take: 3,
    });
    if (papers.length === 0) {
      papers = await prisma.paper.findMany({
        where: { published: true },
        include: paperWithAuthors,
        orderBy: paperOrdering,
        take: 3,
      });
    }
    res.json(GetHomePapersResponse.parse(papers.map(serializePaper)));
  } catch (error) {
    errorResponse(req, res, error, "Unable to load selected research");
  }
});

router.get("/papers", async (req, res) => {
  try {
    const papers = await prisma.paper.findMany({
      where: { published: true },
      include: paperWithAuthors,
      orderBy: paperOrdering,
    });
    res.json(ListPublicPapersResponse.parse(papers.map(serializePaper)));
  } catch (error) {
    errorResponse(req, res, error, "Unable to load public research");
  }
});

router.get("/papers/:slug", async (req, res) => {
  const params = GetPublicPaperParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid paper slug" });
    return;
  }
  try {
    const paper = await prisma.paper.findFirst({
      where: { slug: params.data.slug, published: true },
      include: paperWithAuthors,
    });
    if (!paper) {
      res.status(404).json({ error: "Paper not found" });
      return;
    }
    res.json(GetPublicPaperResponse.parse(serializePaper(paper)));
  } catch (error) {
    errorResponse(req, res, error, "Unable to load the paper");
  }
});

router.get("/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const [totalPapers, publishedPapers, drafts, recentlyUpdated] = await Promise.all([
      prisma.paper.count(),
      prisma.paper.count({ where: { published: true } }),
      prisma.paper.count({ where: { published: false } }),
      prisma.paper.findMany({
        include: paperWithAuthors,
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
    ]);
    res.json(
      GetAdminDashboardResponse.parse({
        totalPapers,
        publishedPapers,
        drafts,
        recentlyUpdated: recentlyUpdated.map(serializePaper),
      }),
    );
  } catch (error) {
    errorResponse(req, res, error, "Unable to load the admin dashboard");
  }
});

router.get("/admin/papers", requireAdmin, async (req, res) => {
  try {
    const papers = await prisma.paper.findMany({
      include: paperWithAuthors,
      orderBy: paperOrdering,
    });
    res.json(ListAdminPapersResponse.parse(papers.map(serializePaper)));
  } catch (error) {
    errorResponse(req, res, error, "Unable to load admin papers");
  }
});

router.post("/admin/papers", requireSameOrigin, requireAdmin, async (req, res) => {
  const input = CreatePaperBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.issues[0]?.message ?? "Invalid paper data." });
    return;
  }
  try {
    const paperData = normalizePaperInput(input.data);
    if (!validatePaperSlug(paperData.slug)) {
      res.status(400).json({ error: "Use lowercase letters, numbers, and single hyphens in the slug." });
      return;
    }
    const paper = await prisma.paper.create({
      data: {
        slug: paperData.slug,
        title: paperData.title,
        shortTitle: paperData.shortTitle,
        summary: paperData.summary,
        abstract: paperData.abstract,
        content: paperData.content,
        status: paperData.status,
        venue: paperData.venue,
        submittedDate: paperData.submittedDate,
        year: paperData.year,
        keywords: paperData.keywords,
        featured: paperData.featured,
        published: paperData.published,
        sortOrder: 0,
        externalLinks: paperData.externalLinks,
        seoImage: paperData.seoImage,
        authors: { create: authorWrites(paperData.authors) },
      },
      include: paperWithAuthors,
    });
    res.status(201).json(CreatePaperResponse.parse(serializePaper(paper)));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Use lowercase")) {
      res.status(400).json({ error: error.message });
      return;
    }
    errorResponse(req, res, error, "Unable to create paper");
  }
});

router.get("/admin/papers/:id", requireAdmin, async (req, res) => {
  const params = GetAdminPaperParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid paper ID" });
    return;
  }
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.data.id },
      include: paperWithAuthors,
    });
    if (!paper) {
      res.status(404).json({ error: "Paper not found" });
      return;
    }
    res.json(GetAdminPaperResponse.parse(serializePaper(paper)));
  } catch (error) {
    errorResponse(req, res, error, "Unable to load paper");
  }
});

router.put(
  "/admin/papers/:id",
  requireSameOrigin,
  requireAdmin,
  async (req, res) => {
    const params = UpdatePaperParams.safeParse(req.params);
    const input = UpdatePaperBody.safeParse(req.body);
    if (!params.success || !input.success) {
      res.status(400).json({
        error:
          input.success
            ? "Invalid paper ID."
            : input.error.issues[0]?.message ?? "Invalid paper data.",
      });
      return;
    }
    try {
      const paperData = normalizePaperInput(input.data);
      if (!validatePaperSlug(paperData.slug)) {
        res.status(400).json({ error: "Use lowercase letters, numbers, and single hyphens in the slug." });
        return;
      }
      const paper = await prisma.paper.update({
        where: { id: params.data.id },
        data: {
          slug: paperData.slug,
          title: paperData.title,
          shortTitle: paperData.shortTitle,
          summary: paperData.summary,
          abstract: paperData.abstract,
          content: paperData.content,
          status: paperData.status,
          venue: paperData.venue,
          submittedDate: paperData.submittedDate,
          year: paperData.year,
          keywords: paperData.keywords,
          featured: paperData.featured,
          published: paperData.published,
          externalLinks: paperData.externalLinks,
          seoImage: paperData.seoImage,
          authors: {
            deleteMany: {},
            create: authorWrites(paperData.authors),
          },
        },
        include: paperWithAuthors,
      });
      res.json(UpdatePaperResponse.parse(serializePaper(paper)));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Use lowercase")) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (isDuplicateSlug(error)) {
        res.status(409).json({ error: "A paper with that slug already exists." });
        return;
      }
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2025"
      ) {
        res.status(404).json({ error: "Paper not found" });
        return;
      }
      errorResponse(req, res, error, "Unable to update paper");
    }
  },
);

router.delete(
  "/admin/papers/:id",
  requireSameOrigin,
  requireAdmin,
  async (req, res) => {
    const params = DeletePaperParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid paper ID" });
      return;
    }
    try {
      await prisma.paper.delete({ where: { id: params.data.id } });
      res.json(DeletePaperResponse.parse({ success: true }));
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2025"
      ) {
        res.status(404).json({ error: "Paper not found" });
        return;
      }
      errorResponse(req, res, error, "Unable to delete paper");
    }
  },
);

router.patch(
  "/admin/papers/:id/publish",
  requireSameOrigin,
  requireAdmin,
  async (req, res) => {
    const params = SetPaperPublishedParams.safeParse(req.params);
    const input = SetPaperPublishedBody.safeParse(req.body);
    if (!params.success || !input.success) {
      res.status(400).json({
        error: input.success ? "Invalid paper ID." : "Choose whether to publish the paper.",
      });
      return;
    }
    try {
      const paper = await prisma.paper.update({
        where: { id: params.data.id },
        data: { published: input.data.published },
        include: paperWithAuthors,
      });
      res.json(SetPaperPublishedResponse.parse(serializePaper(paper)));
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2025"
      ) {
        res.status(404).json({ error: "Paper not found" });
        return;
      }
      errorResponse(req, res, error, "Unable to update publication status");
    }
  },
);

class UploadValidationError extends Error {
  readonly statusCode = 400;
}

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMIT_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!acceptedImageTypes.has(file.mimetype)) {
      callback(new UploadValidationError("Upload a JPG, PNG, WEBP, or GIF image."));
      return;
    }
    callback(null, true);
  },
});

function sniffImageMime(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer.toString("ascii", 1, 4) === "PNG" &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))
  ) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

router.post(
  "/admin/uploads",
  requireSameOrigin,
  requireAdmin,
  imageUpload.single("image"),
  async (req, res) => {
    if (!req.file || sniffImageMime(req.file.buffer) !== req.file.mimetype) {
      res.status(400).json({ error: "The uploaded file is not a supported image." });
      return;
    }

    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      res.status(503).json({ error: "Image uploads are not configured." });
      return;
    }

    try {
      cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true,
      });
      const uploaded = await new Promise<{
        secure_url: string;
        public_id: string;
        width: number;
        height: number;
      }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "frontend/research",
            resource_type: "image",
            timeout: 60_000,
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else if (result) {
              resolve(result);
            } else {
              reject(new Error("Cloudinary returned no upload result"));
            }
          },
        );
        stream.end(req.file!.buffer);
      });
      res.status(201).json(
        UploadResearchImageResponse.parse({
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
          width: uploaded.width,
          height: uploaded.height,
        }),
      );
    } catch (error) {
      errorResponse(req, res, error, "Cloudinary upload failed");
    }
  },
);

export default router;