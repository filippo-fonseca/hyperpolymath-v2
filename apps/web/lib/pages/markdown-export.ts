/**
 * Shared, client-safe Wiki markdown export (Phase 27, WIKI-EXPORT-01..05).
 *
 * This module is PURE + BROWSER-ONLY: it imports NOTHING from the DB/server
 * layer (no `postgres`, no Drizzle, no server actions) so it can be pulled into
 * any client island without dragging node-only code into the browser bundle.
 * It operates on data the caller has already fetched (PageWithProjects rows,
 * the prebuilt PagesTree, folder/project links) and provides the browser
 * download helpers.
 *
 * Single source of truth for two things:
 *   1. RECEIPT STRIPPING — every page's markdown passes through `stripReceipts`
 *      before it leaves the app, so JARVIS receipts never land in an export.
 *   2. BUNDLE LAYOUT — folder / project / whole-tree exports all produce a flat
 *      `Record<path, bytes>` map that mirrors the folder hierarchy, ready for
 *      fflate's `zipSync`.
 */

import { zipSync } from "fflate";
import {
  getEffectiveProjectIds,
  type FolderProjectLink,
  type FolderRow,
  type FolderWithProjects,
} from "@/lib/pages/folder-projects";
import type { PagesTree, TreeFolder } from "@/lib/pages/tree";
import type { PageWithProjects } from "@/lib/db/queries/pages";

/**
 * The minimal page shape the export needs: a title and the markdown mirror.
 * `PageWithProjects` satisfies this, but keeping the input structural lets
 * callers pass any object that carries the fields.
 */
export interface ExportablePage {
  id: string;
  title: string;
  /** The lossy markdown mirror (pages.content). The export source of truth. */
  content: string;
}

/* -------------------------------------------------------------------------- */
/* Receipt contract + stripping                                               */
/* -------------------------------------------------------------------------- */

/**
 * THE JARVIS RECEIPT CONTRACT (defined here in Phase 27, emitted in Phase
 * 31/32). In-document JARVIS receipts do NOT exist in the markdown yet, but the
 * convention is fixed NOW so future phases emit exactly this shape and every
 * export strips it through this one function.
 *
 * A receipt is either:
 *   1. A FENCED region delimited by the HTML-comment markers
 *        <!-- jarvis:receipt -->
 *        ...anything (possibly multi-line)...
 *        <!-- /jarvis:receipt -->
 *      The open marker, the close marker, and everything between them are
 *      removed (matched globally + across newlines).
 *   2. A CALLOUT block-quote whose first line begins `> [!jarvis]`. The callout
 *      line itself and any immediately-following block-quote continuation lines
 *      (lines that also start with `>`) are removed.
 *
 * Future emitters MUST wrap any JARVIS-authored receipt in one of these two
 * forms so that exported markdown stays clean (WIKI-EXPORT-05). After removal we
 * collapse the runs of blank lines the deletions can leave behind so the export
 * reads naturally.
 */
export function stripReceipts(markdown: string): string {
  if (!markdown) return markdown;

  let out = markdown;

  // 1. Fenced HTML-comment receipt regions (multiline, global).
  out = out.replace(
    /<!--\s*jarvis:receipt\s*-->[\s\S]*?<!--\s*\/jarvis:receipt\s*-->/g,
    "",
  );

  // 2. `> [!jarvis]` callout block-quotes: drop the callout line plus any
  //    consecutive block-quote continuation lines that follow it.
  const lines = out.split("\n");
  const kept: string[] = [];
  let inCallout = false;
  for (const line of lines) {
    if (inCallout) {
      // Continuation lines of a block-quote also begin with ">"; once a line
      // is not part of the quote, the callout ends and we resume keeping lines.
      if (/^\s*>/.test(line)) continue;
      inCallout = false;
    }
    if (/^\s*>\s*\[!jarvis\]/i.test(line)) {
      inCallout = true;
      continue;
    }
    kept.push(line);
  }
  out = kept.join("\n");

  // Collapse 3+ consecutive newlines (left by removals) down to a single blank
  // line so the export has no gaping holes where a receipt used to be.
  out = out.replace(/\n{3,}/g, "\n\n");

  return out;
}

/* -------------------------------------------------------------------------- */
/* Page -> markdown                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The exportable markdown for one page: a leading `# {title}` heading (only when
 * the content does not already open with an H1), then the receipt-stripped
 * markdown mirror. Trailing whitespace is trimmed; the result always ends with a
 * single trailing newline so files read cleanly.
 */
export function pageToMarkdown(page: ExportablePage): string {
  const body = stripReceipts(page.content ?? "").trimEnd();
  const title = (page.title ?? "").trim() || "Untitled page";

  // Does the body already open (ignoring leading blank lines) with an H1?
  const startsWithH1 = /^\s*#\s+\S/.test(body);

  const parts: string[] = [];
  if (!startsWithH1) parts.push(`# ${title}`);
  if (body.length > 0) parts.push(body);

  const joined = parts.join("\n\n").trimEnd();
  return `${joined}\n`;
}

/* -------------------------------------------------------------------------- */
/* Filenames + bundle helpers                                                 */
/* -------------------------------------------------------------------------- */

const RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

// ASCII control characters (0x00-0x1F and 0x7F). Built from a string so no
// literal control characters live in this source file.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

/**
 * Slug a title into a filesystem-safe name (NO extension):
 *   - strip ASCII control characters,
 *   - strip path separators and characters reserved on Windows/macOS,
 *   - drop leading dots (no hidden files) and trailing dots/spaces,
 *   - collapse any run of whitespace to a single hyphen,
 *   - fall back to "untitled" when nothing usable remains (and guard the
 *     Windows device names like CON/NUL by suffixing them).
 */
export function safeFileName(title: string): string {
  let name = (title ?? "")
    .replace(CONTROL_CHARS, " ")
    .replace(/[\\/:*?"<>|]/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[.\s]+$/, "")
    .replace(/\s+/g, "-")
    .trim();

  if (!name) name = "untitled";
  if (RESERVED_NAMES.has(name.toLowerCase())) name = `${name}-file`;
  return name;
}

/**
 * Tracks names already used inside one directory so collisions get a numeric
 * suffix (`name`, `name-2`, `name-3`, …). Keyed per directory path so the same
 * file name can live in different folders.
 */
class NameRegistry {
  private used = new Map<string, Set<string>>();

  /** A unique base name for `title` within directory `dir`. */
  unique(dir: string, title: string): string {
    const base = safeFileName(title);
    const set = this.used.get(dir) ?? new Set<string>();
    let candidate = base;
    let n = 2;
    while (set.has(candidate.toLowerCase())) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    set.add(candidate.toLowerCase());
    this.used.set(dir, set);
    return candidate;
  }
}

const encoder = new TextEncoder();

/** Encode a markdown string into the bytes fflate expects in its path map. */
function encode(markdown: string): Uint8Array {
  return encoder.encode(markdown);
}

/** Join path segments, skipping empty ones. */
function joinPath(...segments: string[]): string {
  return segments.filter((s) => s.length > 0).join("/");
}

/* -------------------------------------------------------------------------- */
/* Bundle builders -> Record<path, bytes>                                     */
/* -------------------------------------------------------------------------- */

/** A flat path -> bytes map, the input shape fflate's `zipSync` consumes. */
export type ZipFiles = Record<string, Uint8Array>;

/**
 * Index exportable content by page id. Bundle builders walk the TREE (which
 * carries the directory structure) but pull each page's content from this map
 * (built from the raw PageWithProjects rows, since tree nodes carry only ids).
 */
function buildContentMap(pages: ExportablePage[]): Map<string, ExportablePage> {
  const map = new Map<string, ExportablePage>();
  for (const p of pages) map.set(p.id, p);
  return map;
}

/**
 * Recursively lay out one folder node's pages + subfolders under `dirPrefix`,
 * writing each page as `{dir}/{Page}.md` and recursing into a `{Folder}/`
 * subdirectory per subfolder. Per-directory name uniqueness is enforced via the
 * shared registries; pages whose id is missing from `contentById` are skipped.
 */
function layoutFolder(
  folder: TreeFolder,
  dirPrefix: string,
  contentById: Map<string, ExportablePage>,
  files: ZipFiles,
  pageRegistry: NameRegistry,
  folderRegistry: NameRegistry,
): void {
  for (const page of folder.pages) {
    const source = contentById.get(page.id);
    if (!source) continue;
    const fileName = pageRegistry.unique(dirPrefix, page.title);
    files[joinPath(dirPrefix, `${fileName}.md`)] = encode(pageToMarkdown(source));
  }
  for (const sub of folder.subfolders) {
    const subDirName = folderRegistry.unique(dirPrefix, sub.name);
    layoutFolder(
      sub,
      joinPath(dirPrefix, subDirName),
      contentById,
      files,
      pageRegistry,
      folderRegistry,
    );
  }
}

/**
 * WIKI-EXPORT-02: a single folder and all its descendants as a path map. The
 * top-level directory is the folder's own (safe) name; subfolders nest as
 * subdirectories and each page becomes a `.md` file at its folder's depth.
 *
 * `pages` supplies the markdown content for the tree's page ids (the tree node
 * itself only carries titles/ids).
 */
export function buildFolderZip(
  folder: TreeFolder,
  pages: ExportablePage[],
): ZipFiles {
  const files: ZipFiles = {};
  const contentById = buildContentMap(pages);
  const pageRegistry = new NameRegistry();
  const folderRegistry = new NameRegistry();
  const rootDir = safeFileName(folder.name);
  layoutFolder(folder, rootDir, contentById, files, pageRegistry, folderRegistry);
  return files;
}

/**
 * WIKI-EXPORT-04: the ENTIRE wiki as a path map. Root folders become top-level
 * directories (nesting preserved); standalone pages (no folder) go into a
 * top-level `Unfiled/` directory so they never collide with a real folder named
 * the same thing and the bundle root stays a clean list of folders.
 */
export function buildTreeZip(
  tree: PagesTree,
  pages: ExportablePage[],
): ZipFiles {
  const files: ZipFiles = {};
  const contentById = buildContentMap(pages);
  const pageRegistry = new NameRegistry();
  const folderRegistry = new NameRegistry();

  for (const root of tree.roots) {
    const rootDir = folderRegistry.unique("", root.name);
    layoutFolder(root, rootDir, contentById, files, pageRegistry, folderRegistry);
  }

  if (tree.standalonePages.length > 0) {
    const unfiledDir = folderRegistry.unique("", "Unfiled");
    for (const page of tree.standalonePages) {
      const source = contentById.get(page.id);
      if (!source) continue;
      const fileName = pageRegistry.unique(unfiledDir, page.title);
      files[joinPath(unfiledDir, `${fileName}.md`)] = encode(
        pageToMarkdown(source),
      );
    }
  }

  return files;
}

/**
 * Resolve the FULL folder path (root-first names) a folder sits at, walking
 * parentId up the chain. Cycle-safe via a visited guard.
 */
function folderPathNames(
  folderId: string,
  folderById: Map<string, FolderRow>,
): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: string | null = folderId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const node = folderById.get(current);
    if (!node) break;
    chain.push(node.name);
    current = node.parentId;
  }
  return chain.reverse();
}

/**
 * WIKI-EXPORT-03: every page whose EFFECTIVE project set includes `projectId`,
 * laid out by the page's folder path. A page is included when it links to the
 * project DIRECTLY or sits in a folder whose effective project set includes the
 * project (inheritance). Pages with no folder go to the bundle root.
 *
 * The bundle's top-level directory is the (safe) project name so the unzipped
 * tree is self-describing.
 */
export function buildProjectZip(
  folders: FolderRow[],
  folderProjectLinks: FolderProjectLink[],
  pages: PageWithProjects[],
  projectId: string,
  projectName: string,
): ZipFiles {
  const files: ZipFiles = {};

  // Folder map for both the effective-set walk and the path resolution.
  const folderById = new Map<string, FolderRow>();
  for (const f of folders) folderById.set(f.id, f);

  const folderWithProjects = new Map<string, FolderWithProjects>();
  for (const f of folders) {
    folderWithProjects.set(f.id, { ...f, ownProjectIds: [] });
  }
  for (const link of folderProjectLinks) {
    folderWithProjects.get(link.folderId)?.ownProjectIds.push(link.projectId);
  }

  // Cache each folder's effective project set (own ∪ inherited).
  const effectiveCache = new Map<string, string[]>();
  const effectiveFor = (folderId: string): string[] => {
    const cached = effectiveCache.get(folderId);
    if (cached) return cached;
    const ids = getEffectiveProjectIds(folderId, folderWithProjects);
    effectiveCache.set(folderId, ids);
    return ids;
  };

  const rootDir = safeFileName(projectName);
  // One registry across the bundle; uniqueness is scoped per directory inside.
  const registry = new NameRegistry();

  for (const page of pages) {
    const directlyLinked = page.projects.some((p) => p.id === projectId);
    const folderId = page.folderId;
    const viaFolder =
      folderId != null &&
      folderById.has(folderId) &&
      effectiveFor(folderId).includes(projectId);
    if (!directlyLinked && !viaFolder) continue;

    // Lay the page out under projectName/<folder path>/Page.md; a folderless
    // page goes directly under projectName/.
    const pathSegments =
      folderId != null && folderById.has(folderId)
        ? folderPathNames(folderId, folderById).map((n) => safeFileName(n))
        : [];
    const dir = joinPath(rootDir, ...pathSegments);
    const fileName = registry.unique(dir, page.title);
    files[joinPath(dir, `${fileName}.md`)] = encode(pageToMarkdown(page));
  }

  return files;
}

/* -------------------------------------------------------------------------- */
/* Browser download helpers                                                   */
/* -------------------------------------------------------------------------- */

/** Trigger a browser download of `content` as a text file named `filename`. */
export function downloadTextFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, filename);
}

/** Zip a path map with fflate and download it as `filename`. */
export function downloadZipFiles(files: ZipFiles, filename: string): void {
  const bytes = zipSync(files);
  downloadZip(bytes, filename);
}

/** Trigger a browser download of already-zipped bytes named `filename`. */
export function downloadZip(zipBytes: Uint8Array, filename: string): void {
  const blob = new Blob([zipBytes as BlobPart], { type: "application/zip" });
  triggerDownload(blob, filename);
}

/** Shared Blob -> object URL -> anchor click -> revoke download mechanism. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
