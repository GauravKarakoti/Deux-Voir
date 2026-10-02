import { Router, type IRouter } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";

const router: IRouter = Router();

function requestOrigin(req: import("express").Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setHtmlMeta(html: string, attribute: "name" | "property", key: string, content: string): string {
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`;
  const expression = new RegExp(`<meta\\s+${attribute}=["']${key}["'][^>]*>`, "i");
  return expression.test(html) ? html.replace(expression, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

function addStructuredData(html: string, data: Record<string, unknown>): string {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const script = `<script type="application/ld+json">${json}</script>`;
  return html.replace("</head>", `  ${script}\n</head>`);
}

async function researchDocumentTemplate(): Promise<string> {
  const candidates = process.env.NODE_ENV === "production"
    ? [
        path.resolve(process.cwd(), "../deux-voir/dist/public/index.html"),
        path.resolve(process.cwd(), "artifacts/deux-voir/dist/public/index.html"),
        path.resolve(process.cwd(), "../deux-voir/index.html"),
        path.resolve(process.cwd(), "artifacts/deux-voir/index.html"),
      ]
    : [
        path.resolve(process.cwd(), "../deux-voir/index.html"),
        path.resolve(process.cwd(), "artifacts/deux-voir/index.html"),
      ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("The Deux Voir HTML shell was not found.");
}

router.get(["/research", "/research/:slug"], async (req, res) => {
  try {
    const template = await researchDocumentTemplate();
    const origin = requestOrigin(req);
    const slug = typeof req.params.slug === "string" ? req.params.slug : null;
    const paper = slug
      ? await prisma.paper.findFirst({
          where: { slug, published: true },
          select: {
            title: true,
            shortTitle: true,
            summary: true,
            abstract: true,
            seoImage: true,
            keywords: true,
            authors: {
              orderBy: { sortOrder: "asc" },
              select: { author: { select: { name: true } } },
            },
          },
        })
      : null;
    const title = paper
      ? `${paper.shortTitle ?? paper.title} — Deux Voir`
      : slug
        ? "Research paper — Deux Voir"
        : "Research Papers & Experiments — Deux Voir";
    const description = paper
      ? paper.summary ?? paper.abstract
      : "Papers and research from Deux Voir, an independent research identity exploring world models as memory substrates for multimodal reasoning.";
    const canonical = `${origin}${req.path}`;
    let html = template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    html = setHtmlMeta(html, "name", "description", description);
    html = setHtmlMeta(html, "name", "robots", slug && !paper ? "noindex, nofollow" : "index, follow");
    html = setHtmlMeta(html, "property", "og:title", title);
    html = setHtmlMeta(html, "property", "og:description", description);
    html = setHtmlMeta(html, "property", "og:type", paper ? "article" : "website");
    html = setHtmlMeta(html, "property", "og:url", canonical);
    html = setHtmlMeta(html, "property", "og:image", paper?.seoImage ?? "");
    html = setHtmlMeta(html, "name", "twitter:title", title);
    html = setHtmlMeta(html, "name", "twitter:description", description);
    html = setHtmlMeta(html, "name", "twitter:image", paper?.seoImage ?? "");
    const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonical)}" />`;
    const canonicalExpression = /<link\s+rel=["']canonical["'][^>]*>/i;
    html = canonicalExpression.test(html)
      ? html.replace(canonicalExpression, canonicalTag)
      : html.replace("</head>", `  ${canonicalTag}\n</head>`);
    if (paper) {
      html = addStructuredData(html, {
        "@context": "https://schema.org",
        "@type": "ScholarlyArticle",
        headline: paper.title,
        abstract: paper.abstract,
        author: paper.authors.map(({ author }) => ({ "@type": "Person", name: author.name })),
        keywords: paper.keywords,
        publisher: { "@type": "Organization", name: "Deux Voir" },
        url: canonical,
        ...(paper.seoImage ? { image: paper.seoImage } : {}),
      });
    }
    res.status(slug && !paper ? 404 : 200).type("html").send(html);
  } catch (error) {
    req.log.error({ err: error }, "Unable to render research metadata");
    res.status(500).type("text/plain").send("Unable to load the research archive.");
  }
});

router.get("/sitemap.xml", async (req, res) => {
  try {
    const origin = requestOrigin(req);
    const papers = await prisma.paper.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
      orderBy: [{ year: "desc" }, { sortOrder: "asc" }],
    });
    const entries = [
      { loc: `${origin}/`, lastmod: null },
      { loc: `${origin}/research`, lastmod: null },
      ...papers.map((paper) => ({
        loc: `${origin}/research/${encodeURIComponent(paper.slug)}`,
        lastmod: paper.updatedAt.toISOString().slice(0, 10),
      })),
    ];
    const urls = entries
      .map(
        ({ loc, lastmod }) =>
          `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
      )
      .join("\n");
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to generate the sitemap");
    res.status(500).type("text/plain").send("Unable to generate sitemap.");
  }
});

router.get("/robots.txt", (req, res) => {
  const sitemapUrl = `${requestOrigin(req)}/sitemap.xml`;
  res.type("text/plain").send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nSitemap: ${sitemapUrl}\n`,
  );
});

export default router;