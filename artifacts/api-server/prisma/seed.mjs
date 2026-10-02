import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sanitizeHtml from "sanitize-html";

const prisma = new PrismaClient();
const sourceDir = path.resolve(
  process.cwd(),
  "../../.local/conversation-workspace/files/attached_assets",
);

const paperSources = [
  {
    slug: "world-models-neural-surrogates-dft",
    filename: "world-models-neural-surrogates-dft_1790951043435.html",
    sortOrder: 1,
  },
  {
    slug: "dctms-deterministic-memory-scheduling",
    filename: "dctms-deterministic-memory-scheduling_1790951043434.html",
    sortOrder: 2,
  },
  {
    slug: "world-model-latents-as-memory",
    filename: "world-model-latents-as-memory_1790951043435.html",
    sortOrder: 3,
  },
];

const sanitizeOptions = {
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
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer",
    }),
    img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }),
  },
};

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal) =>
      String.fromCodePoint(Number(decimal)),
    )
    .replace(/&#x([\da-f]+);/gi, (_match, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    );
}

function textFromHtml(value) {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function classContents(markup, className) {
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markup.match(
    new RegExp(
      `<([a-z][a-z\\d]*)\\b[^>]*class=["'][^"']*\\b${escapedClass}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1\\s*>`,
      "i",
    ),
  );
  return match?.[2] ?? "";
}

function parseSummary(researchIndex, slug) {
  const cards = researchIndex.matchAll(
    /<article\b[^>]*class=["']paper-card["'][^>]*>([\s\S]*?)<\/article\s*>/gi,
  );
  for (const [, card] of cards) {
    if (card.includes(`${slug}.html`)) {
      const summary = textFromHtml(classContents(card, "paper-abstract"));
      if (!summary) throw new Error(`No index summary found for ${slug}`);
      return summary;
    }
  }
  throw new Error(`No research index card found for ${slug}`);
}

function paperSections(article) {
  return [...article.matchAll(
    /<section\b[^>]*class=["'][^"']*\bpaper-section\b[^"']*["'][^>]*>([\s\S]*?)<\/section\s*>/gi,
  )].map(([, section]) => section.trim());
}

function sectionTitle(section) {
  return textFromHtml(classContents(section, "paper-section-title"));
}

function fullAbstract(article) {
  const abstractSection = paperSections(article).find(
    (section) => sectionTitle(section).toLowerCase() === "abstract",
  );
  if (!abstractSection) throw new Error("The source paper has no Abstract section");
  const paragraphs = [...abstractSection.matchAll(
    /<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi,
  )]
    .filter(([, attributes]) => !/\bpaper-keywords\b/i.test(attributes))
    .map(([, , paragraph]) => textFromHtml(paragraph))
    .filter(Boolean);
  if (!paragraphs.length) throw new Error("The source paper has no abstract text");
  return paragraphs.join("\n\n");
}

function bodyMarkup(article) {
  return paperSections(article)
    .filter((section) => sectionTitle(section).toLowerCase() !== "abstract")
    .map((section) => sanitizeHtml(section, sanitizeOptions))
    .filter(Boolean)
    .join("\n\n");
}

async function migratePaper(source, researchIndex) {
  const article = await readFile(path.join(sourceDir, source.filename), "utf8");
  const title = textFromHtml(classContents(article, "paper-page-title"));
  const status = textFromHtml(classContents(article, "paper-status"));
  const venue = textFromHtml(classContents(article, "paper-venue"));
  const authorsText = textFromHtml(classContents(article, "paper-page-authors"));
  const submittedMeta = textFromHtml(classContents(article, "paper-page-date"));
  const year = Number(submittedMeta.match(/\b20\d{2}\b/)?.[0]);
  const keywordMarkup = classContents(article, "paper-keywords");
  const keywordText = textFromHtml(keywordMarkup).replace(/^Keywords:\s*/i, "");
  const keywords = keywordText
    .split(/\s*[·•]\s*/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const authors = authorsText
    .split(/\s*·\s*/)
    .map((name) => name.trim())
    .filter(Boolean);
  const content = bodyMarkup(article);

  if (!title || !status || !venue || !Number.isInteger(year) || !content || !authors.length) {
    throw new Error(`The source paper ${source.filename} is missing required metadata`);
  }

  const existing = await prisma.paper.findUnique({
    where: { slug: source.slug },
    select: { id: true },
  });
  if (existing) return;

  await prisma.paper.create({
    data: {
      slug: source.slug,
      title,
      summary: parseSummary(researchIndex, source.slug),
      abstract: fullAbstract(article),
      content,
      status,
      venue,
      year,
      keywords,
      submittedDate: null,
      featured: true,
      published: true,
      sortOrder: source.sortOrder,
      externalLinks: [],
      authors: {
        create: authors.map((name, sortOrder) => ({
          sortOrder,
          author: {
            connectOrCreate: {
              where: { name },
              create: { name },
            },
          },
        })),
      },
    },
  });
}

try {
  const researchIndex = await readFile(
    path.join(sourceDir, "research_1790951037817.html"),
    "utf8",
  );
  for (const source of paperSources) {
    await migratePaper(source, researchIndex);
  }
} finally {
  await prisma.$disconnect();
}