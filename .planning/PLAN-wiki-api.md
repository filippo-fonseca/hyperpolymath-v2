# PLAN — unit-wiki-api (issue #329)

Device wiki API: bearer-authed routes for tree, page CRUD, daily get-or-create.
Contract SEALED in `.planning/API-CONTRACT.md`. Fence: own
`apps/web/app/api/device/wiki/**` + `apps/web/lib/wiki/device-serializers.ts`.

## Established facts (from codebase study)
- Auth idiom: `validateDesktopBearer(req)` -> userId | null; 401 = `new
  Response("Unauthorized", { status: 401, headers: CORS })`. Mirror
  `app/api/device/tasks/route.ts`: `runtime="nodejs"`,
  `dynamic="force-dynamic"`, CORS const, `OPTIONS` handler, `Response.json`.
- Next 16 dynamic routes: `{ params }: { params: Promise<{ id: string }> }`,
  `const { id } = await params`.
- `pages` cols: id, userId, title, content (lossy md mirror), contentJson
  (jsonb), emoji, url, pinned, folderId, dailyDate (date), positionKey,
  createdAt, updatedAt. Partial unique index `pages_user_daily_date_uniq` on
  (userId, dailyDate) WHERE daily_date IS NOT NULL.
- `pageFolders` cols: id, userId, parentId, name, positionKey, ...
- Web markdown mirror path is CLIENT-ONLY (PageBlockEditor onChange):
  `editor.blocksToMarkdownLossy(blocksWithReferenceTokens(editor.document))`.
  `blocksWithReferenceTokens` (lib/references/page-mirror.ts) is a pure,
  server-safe util -> reuse it verbatim. The editor half is client-only ->
  contract-sanctioned fallback `@blocknote/server-util`
  `ServerBlockNoteEditor.blocksToMarkdownLossy`.
- `@blocknote/core@0.51.4` installed; add `@blocknote/server-util@0.51.4`.

## Files
1. `apps/web/lib/wiki/device-serializers.ts` — `contentJsonToMarkdown(json)`:
   guard non-array -> ""; `blocksWithReferenceTokens` pre-pass; server-util
   default-schema `blocksToMarkdownLossy`; try/catch -> "" on unknown-block
   throw. Plus `pageShape(row)` builder (#2 full-page response) + PAGE_COLS.
2. `apps/web/app/api/device/wiki/tree/route.ts` — GET tree.
3. `apps/web/app/api/device/wiki/pages/route.ts` — POST create.
4. `apps/web/app/api/device/wiki/pages/[id]/route.ts` — GET one + PATCH update.
5. `apps/web/app/api/device/wiki/daily/route.ts` — GET get-or-create.

## Sorting (contract #1)
- folders: by name asc.
- pages: pinned-first at root; within folder by (positionKey NULLS LAST, title).
  Null-last + title tiebreak in JS for exactness.

## Verification
- `pnpm install`, add server-util. Gates: `pnpm --filter web typecheck`,
  `pnpm --filter web build`. Smoke on PORT=3210 with a minted `hpd_` bearer for
  local user bfad3110-65df-45f2-85d6-58df4845744d; curl 5 routes + 401.
  Delete `[bgsd-test]` pages before done.

## Commit plan (atomic, explicit pathspecs)
c1 dep; c2 serializers; c3 tree; c4 pages POST; c5 pages/[id]; c6 daily.
