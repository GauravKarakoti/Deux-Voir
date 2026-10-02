# Deux Voir

An editorial research archive with a public paper library and a private, single-admin publishing studio.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/deux-voir run dev` — run the public site and publishing studio
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/api-server run db:migrate -- --name <migration>` — create and apply a development Prisma migration
- `pnpm --filter @workspace/api-server run db:seed` — seed the development database from the supplied research pages
- Required secrets: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- UI: React, Vite, TypeScript, Wouter, TanStack Query
- API: Express 5, generated OpenAPI validators and clients
- DB: PostgreSQL with Prisma (API package only)
- Images: Cloudinary uploads with server-side validation
- Build: pnpm workspaces and esbuild

## Where things live

- `artifacts/deux-voir/src/App.tsx` — public pages and administrator interface
- `artifacts/deux-voir/src/index.css` — editorial design system and responsive styles
- `artifacts/api-server/prisma/schema.prisma` — research archive schema
- `artifacts/api-server/prisma/seed.mjs` — imports supplied article content
- `lib/api-spec/openapi.yaml` — API contract and generated client source

## Architecture decisions

- Only published research appears on public endpoints.
- Admin sessions use a signed, HTTP-only cookie; no admin password is stored in the database.
- Paper HTML is sanitized on the server before persistence and public delivery.
- Schema changes use Prisma migrations; the post-merge setup applies existing migrations without modifying production.

## Product

Visitors can browse and read published research. The single administrator can create, edit, preview, publish, unpublish, and delete papers, and upload images through Cloudinary.

## User preferences

- Preserve supplied research text; do not invent authors or exact submission dates absent from the source.
- Keep the existing cream, near-black, Cormorant Garamond, and Inter editorial style.

## Gotchas

- Run the API-spec code generator after changing `lib/api-spec/openapi.yaml`.
- Run migrations and seed only against the development database; production schema changes are applied through Publish.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
