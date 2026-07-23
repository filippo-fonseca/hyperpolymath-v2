// Throwaway mock of the sealed device wiki API (specs/API-CONTRACT.md) so the
// mobile editor client can round-trip for REAL during verification. U1's real
// routes don't exist in this worktree base; this stands in at the contract
// boundary only — it is NOT app code and never ships.
//
// In-memory store, bearer ignored (dev). Logs every request so the PATCH 200 +
// the reload GET can be captured as evidence.
//
//   node .planning/evidence/mock-wiki-server.mjs   # binds 0.0.0.0:3215

import { createServer } from "node:http";

const PORT = 3215;
const pages = new Map();
const folders = [];
let seq = 1;

function nid(prefix) {
  return `${prefix}_${(seq++).toString(36)}${Math.floor(performance.now()).toString(36)}`;
}

/** Naive markdown mirror (server's job §4) — enough to prove regeneration. */
function blocksToMarkdown(contentJson) {
  if (!Array.isArray(contentJson)) return "";
  const line = (b) => {
    const text = Array.isArray(b.content)
      ? b.content.map((c) => (typeof c === "string" ? c : (c?.text ?? ""))).join("")
      : typeof b.content === "string"
        ? b.content
        : "";
    switch (b.type) {
      case "heading":
        return `${"#".repeat(b.props?.level ?? 1)} ${text}`;
      case "bulletListItem":
        return `- ${text}`;
      case "numberedListItem":
        return `1. ${text}`;
      case "checkListItem":
        return `- [${b.props?.checked ? "x" : " "}] ${text}`;
      case "quote":
        return `> ${text}`;
      default:
        return text;
    }
  };
  return contentJson.map(line).join("\n\n");
}

function shape(p) {
  return {
    id: p.id,
    title: p.title,
    emoji: p.emoji ?? null,
    folderId: p.folderId ?? null,
    pinned: p.pinned ?? false,
    url: p.url ?? null,
    contentJson: p.contentJson ?? null,
    content: p.content ?? null,
    updatedAt: p.updatedAt,
  };
}

function makePage(init = {}) {
  const id = init.id ?? nid("pg");
  const now = new Date().toISOString();
  const p = {
    id,
    title: init.title ?? "",
    emoji: init.emoji ?? null,
    folderId: init.folderId ?? null,
    pinned: false,
    url: null,
    contentJson: init.contentJson ?? null,
    content: init.contentJson ? blocksToMarkdown(init.contentJson) : null,
    dailyDate: init.dailyDate ?? null,
    updatedAt: now,
  };
  pages.set(id, p);
  return p;
}

// Seed one legacy (markdown-only) page and one with a web-only custom block so
// the read-only guard can be exercised too.
makePage({ id: "seed-legacy", title: "Legacy note", contentJson: null }).content =
  "# Legacy\n\nWritten before content_json existed.";
makePage({
  id: "seed-custom",
  title: "Has a callout",
  contentJson: [
    { id: "c1", type: "heading", props: { level: 1 }, content: "Roadmap" },
    { id: "c2", type: "callout", props: { tone: "info" }, content: [{ type: "text", text: "web-only", styles: {} }] },
  ],
});

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;
  const method = req.method ?? "GET";
  let status = 200;

  try {
    const pageMatch = pathname.match(/^\/api\/device\/wiki\/pages\/([^/]+)$/);

    if (pathname === "/api/device/wiki/tree" && method === "GET") {
      send(res, 200, {
        folders,
        pages: [...pages.values()].map((p) => ({
          id: p.id,
          title: p.title,
          emoji: p.emoji,
          folderId: p.folderId,
          pinned: p.pinned,
          dailyDate: p.dailyDate,
          updatedAt: p.updatedAt,
        })),
      });
    } else if (pathname === "/api/device/wiki/pages" && method === "POST") {
      const body = await readBody(req);
      if (body === null) { status = 400; send(res, 400, { error: "bad body" }); }
      else send(res, 200, shape(makePage({ title: body.title, folderId: body.folderId, contentJson: body.contentJson })));
    } else if (pageMatch && method === "GET") {
      const p = pages.get(pageMatch[1]);
      if (!p) { status = 404; send(res, 404, { error: "not found" }); }
      else send(res, 200, shape(p));
    } else if (pageMatch && method === "PATCH") {
      const p = pages.get(pageMatch[1]);
      if (!p) { status = 404; send(res, 404, { error: "not found" }); }
      else {
        const body = await readBody(req);
        if (body === null) { status = 400; send(res, 400, { error: "bad body" }); }
        else {
          if (typeof body.title === "string") p.title = body.title;
          if ("emoji" in body) p.emoji = body.emoji;
          if ("folderId" in body) p.folderId = body.folderId;
          if ("contentJson" in body) {
            p.contentJson = body.contentJson;
            p.content = blocksToMarkdown(body.contentJson); // §4 regenerate mirror
          }
          p.updatedAt = new Date().toISOString();
          send(res, 200, shape(p));
        }
      }
    } else if (pathname === "/api/device/wiki/daily" && method === "GET") {
      const date = url.searchParams.get("date");
      if (!date) { status = 400; send(res, 400, { error: "date required" }); }
      else {
        let p = [...pages.values()].find((x) => x.dailyDate === date);
        if (!p) p = makePage({ title: date, dailyDate: date });
        send(res, 200, shape(p));
      }
    } else {
      status = 404;
      send(res, 404, { error: "no route" });
    }
  } catch (err) {
    status = 500;
    send(res, 500, { error: String(err) });
  }

  console.log(`${new Date().toISOString().slice(11, 19)} ${method} ${pathname}${url.search} -> ${status}`);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock-wiki] listening on http://0.0.0.0:${PORT} (seeded: ${[...pages.keys()].join(", ")})`);
});
