import type { Prisma } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { CreatePaperBody, UpdatePaperBody } from "@workspace/api-zod";

export const paperWithAuthors = {
  authors: {
    orderBy: { sortOrder: "asc" },
    include: { author: true },
  },
} satisfies Prisma.PaperInclude;

export type PaperWithAuthors = Prisma.PaperGetPayload<{
  include: typeof paperWithAuthors;
}>;

export type CreatePaperInput = ReturnType<typeof CreatePaperBody.parse>;
export type UpdatePaperInput = ReturnType<typeof UpdatePaperBody.parse>;

const richTextOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "a", "b", "blockquote", "br", "caption", "code", "dd", "del", "div",
    "dl", "dt", "em", "figcaption", "figure", "h1", "h2", "h3", "h4",
    "hr", "i", "img", "li", "ol", "p", "pre", "s", "section", "small",
    "span", "strong", "sub", "sup", "table", "tbody", "td", "th", "thead",
    "tr", "u", "ul",
  ],
  allowedAttributes: {
    "*": ["class"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }),
  },
};

function trimOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function normalizePaperInput(input: CreatePaperInput | UpdatePaperInput) {
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Use lowercase letters, numbers, and single hyphens in the slug.");
  }
  if (!input.title.trim() || input.title.trim().length > 500) {
    throw new Error("Enter a title under 500 characters.");
  }
  if (input.abstract.length > 20_000) {
    throw new Error("The summary must be 20,000 characters or fewer.");
  }
  if ((input.summary?.length ?? 0) > 20_000) {
    throw new Error("The summary must be 20,000 characters or fewer.");
  }
  if (input.content.length > 1_500_000) {
    throw new Error("Paper content must be 1.5 MB or smaller.");
  }
  if (!input.status.trim() || input.status.trim().length > 100) {
    throw new Error("Enter a status under 100 characters.");
  }
  if (!Number.isInteger(input.year) || input.year < 1900 || input.year > 9999) {
    throw new Error("Enter a valid publication year.");
  }
  if (input.authors.length > 30) {
    throw new Error("A paper can have at most 30 authors.");
  }
  if (input.keywords.length > 60) {
    throw new Error("A paper can have at most 60 keywords.");
  }
  if (input.externalLinks.length > 30) {
    throw new Error("A paper can have at most 30 external links.");
  }

  const authors = input.authors.map((author) => ({
    name: author.name.trim(),
    affiliation: trimOrNull(author.affiliation),
    profileUrl: trimOrNull(author.profileUrl),
  }));
  if (authors.some((author) => !author.name || author.name.length > 200)) {
    throw new Error("Each author needs a name under 200 characters.");
  }
  if (new Set(authors.map((author) => author.name.toLowerCase())).size !== authors.length) {
    throw new Error("Author names must be unique within a paper.");
  }
  if (authors.some((author) => author.profileUrl && !isHttpUrl(author.profileUrl))) {
    throw new Error("Author profile links must use HTTP or HTTPS.");
  }

  const externalLinks = input.externalLinks.map((link) => ({
    label: link.label.trim(),
    url: link.url.trim(),
  }));
  if (
    externalLinks.some(
      (link) =>
        !link.label ||
        link.label.length > 100 ||
        link.url.length > 2_000 ||
        !isHttpUrl(link.url),
    )
  ) {
    throw new Error("External links need a label and a valid HTTP or HTTPS URL.");
  }

  const seoImage = trimOrNull(input.seoImage);
  if (seoImage && !isHttpUrl(seoImage)) {
    throw new Error("The SEO image must use HTTP or HTTPS.");
  }
  const submittedDate = input.submittedDate ? new Date(input.submittedDate) : null;
  if (submittedDate && Number.isNaN(submittedDate.getTime())) {
    throw new Error("Enter a valid submission date.");
  }

  return {
    slug,
    title: input.title.trim(),
    shortTitle: trimOrNull(input.shortTitle),
    summary: trimOrNull(input.summary),
    abstract: input.abstract.trim(),
    content: sanitizeHtml(input.content, richTextOptions),
    status: input.status.trim(),
    venue: trimOrNull(input.venue),
    submittedDate,
    year: input.year,
    keywords: [...new Set(input.keywords.map((keyword) => keyword.trim()).filter(Boolean))],
    featured: input.featured,
    published: input.published,
    externalLinks: externalLinks as Prisma.InputJsonValue,
    seoImage,
    authors,
  };
}

function toExternalLinks(value: Prisma.JsonValue): Array<{ label: string; url: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const label = entry.label;
    const url = entry.url;
    return typeof label === "string" && typeof url === "string" ? [{ label, url }] : [];
  });
}

export function serializePaper(paper: PaperWithAuthors) {
  return {
    id: paper.id,
    slug: paper.slug,
    title: paper.title,
    shortTitle: paper.shortTitle,
    summary: paper.summary,
    abstract: paper.abstract,
    content: paper.content,
    status: paper.status,
    venue: paper.venue,
    authors: paper.authors.map(({ author, sortOrder }) => ({
      name: author.name,
      affiliation: author.affiliation,
      profileUrl: author.profileUrl,
      sortOrder,
    })),
    submittedDate: paper.submittedDate?.toISOString() ?? null,
    year: paper.year,
    keywords: paper.keywords,
    featured: paper.featured,
    published: paper.published,
    updatedAt: paper.updatedAt.toISOString(),
    externalLinks: toExternalLinks(paper.externalLinks),
    seoImage: paper.seoImage,
    createdAt: paper.createdAt.toISOString(),
  };
}