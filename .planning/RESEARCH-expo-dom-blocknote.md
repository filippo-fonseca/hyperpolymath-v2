# Research: BlockNote in an Expo DOM Component (SDK 56, iOS)

Target env: Expo `~56.0.11`, React Native `0.85.3`, React `19.2`, pnpm monorepo, iOS Simulator via dev client / `expo run:ios`. Editor: `@blocknote/react` + `@blocknote/core`.

Date: 2026-07-23. All version numbers below are from official Expo/BlockNote sources current at that date.

---

## 1. Expo DOM Components on SDK 56

**How `'use dom'` works.** Add the string directive `'use dom'` as the first line of a `.tsx` file that has a **single default export**. Expo/Metro then bundles that file as a *web* bundle (React DOM) and renders it inside a native WebView. From the native side you import the file like a normal RN component; Expo wraps it in a WebView automatically. The component runs in a real browser DOM context (`document`, `window`, contenteditable, CSS all work).

**Dependencies / versions on SDK 56 (this is the big change vs SDK ≤55):**

- SDK 56 ships **`@expo/dom-webview`** as the *default* backing WebView for DOM components. It is pulled in transitively; you do **not** install `react-native-webview` for basic DOM component use.
  - Bundled version for SDK 56: **`@expo/dom-webview` `~56.0.6`** (main lists `~56.0.5`; SDK-56 branch lists `~56.0.6`).
- `react-native-webview` is now **optional / opt-in**. If you set `dom={{ useExpoDOMWebView: false }}` you fall back to it, and then you must install it:
  ```sh
  npx expo install react-native-webview
  # SDK 56 pins: react-native-webview 13.16.1
  ```
  Expo SDK 56 `bundledNativeModules.json` pins **`react-native-webview` = `13.16.1`** (exact, not a caret range). Recommendation: **stay on the default `@expo/dom-webview`** and do not add `react-native-webview` unless you hit a specific bug.
- Optional extras only needed if the project does NOT already use Expo Router / web:
  ```sh
  npx expo install @expo/metro-runtime react-dom react-native-web
  ```
  A BlockNote DOM component needs `react-dom` present in the graph; in a standard Expo Router app this is already satisfied. In a bare monorepo package, ensure `react-dom` and `react-native-web` resolve.

**Config changes.** None required for the directive itself. No `metro.config.js`, `babel.config.js`, or `app.json` edits are documented as necessary for DOM components. (Standard Expo Metro already enables CSS imports, which BlockNote needs — see §3.) Monorepo caveat: your existing Metro monorepo config (workspace `watchFolders` / `nodeModulesPaths`, pnpm symlink handling) must already be correct for the web bundle to resolve `@blocknote/*` from the workspace store.

**Expo Go vs dev build.** DOM components are officially supported in **Expo Go** (Fast Refresh, HMR, Safari/Chrome web debugging all work) — so `'use dom'` alone does **not** force a dev build. HOWEVER, this app already runs via `expo run:ios` / dev client because of other native modules, and `@expo/dom-webview` ships native code, so in practice you build a dev client anyway. Net: **a dev build is fine and is what you'll use; Expo Go is not required and not relevant here.**

---

## 2. Props / bridge contract (marshalling)

**Into the component (props):** only **serializable** values cross the bridge — `number`, `string`, `boolean`, `null`, `undefined`, `Array`, `Object`. The bridge is **asynchronous**: prop updates are not applied synchronously; there can be a frame or more of delay. Only **top-level** props are marshalled.

**Out of the component (callbacks):** pass **async functions as top-level props**. The DOM side calls them; they run on the native side. Hard rules:
- Functions must be **top-level props**, never nested inside an object/array prop.
- Calls are **async only** — you cannot synchronously return a value from native back into the DOM call.
- `children` is **not supported**.

**Typing / default export.** Every DOM component receives a special `dom` prop typed as `import('expo/dom').DOMProps`. The file must default-export a single component.

**Pattern for `initialContent` + `editable` + `onChange`:**

```tsx
// WikiEditor.dom.tsx
'use dom';

import type { DOMProps } from 'expo/dom';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';
import type { PartialBlock, Block } from '@blocknote/core';

type Props = {
  dom?: DOMProps;                 // WebView config, injected by Expo
  initialContent?: PartialBlock[]; // serializable JSON array
  editable?: boolean;
  onChange?: (doc: Block[]) => Promise<void>; // async native callback
};

export default function WikiEditor({ initialContent, editable = true, onChange }: Props) {
  const editor = useCreateBlockNote({ initialContent });
  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      onChange={() => { void onChange?.(editor.document); }}
    />
  );
}
```

Native side:

```tsx
import WikiEditor from './WikiEditor.dom';

<WikiEditor
  initialContent={blocksJson}
  editable
  onChange={async (doc) => { await saveDoc(doc); }}
  dom={{ scrollEnabled: true, matchContents: false, style: { flex: 1 } }}
/>
```

Note: because the bridge is async + serialize-heavy, avoid pushing a fresh `onChange` payload on every keystroke without debouncing (see §5 gotcha on large payloads).

---

## 3. BlockNote inside a DOM component

**Does it mount?** Yes — a DOM component IS a web React bundle, which is exactly BlockNote's native habitat. `useCreateBlockNote` + `<BlockNoteView>` mount the same as in any web app. No RN-specific shim needed.

**Package layout (important):** in current BlockNote, `<BlockNoteView>` is imported from a **UI package**, not `@blocknote/react`:
- `@blocknote/mantine` (recommended) — or `@blocknote/shadcn` / `@blocknote/ariakit`.
- `useCreateBlockNote` and the React hooks come from `@blocknote/react`.
- Core types/logic from `@blocknote/core`.

**Minimal mount:**
```tsx
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';

const editor = useCreateBlockNote();
return <BlockNoteView editor={editor} />;
```

**CSS imports in a DOM file.** Standard ESM CSS imports work because Metro (Expo's default) supports CSS imports for web bundles. Import both:
- `@blocknote/mantine/style.css` (component styles)
- `@blocknote/core/fonts/inter.css` (default font — or drop it and supply your own EB Garamond / Louize CSS)

These go at the top of the `'use dom'` file. No Metro config change needed; CSS-in-DOM is one of the documented supported Metro features for DOM components.

**Versions (current, early/mid 2026):**
- `@blocknote/core` **0.51.x** (0.51.4 seen)
- `@blocknote/react` **0.51.x** (0.51.3 seen)
- `@blocknote/mantine` **0.51.x** (keep all `@blocknote/*` on the **same minor** — they release in lockstep; mismatched versions break).
- `@blocknote/server-util` **0.51.x** (for server round-trip, §4).

**React 19 compatibility.** The old blocker (#1021, "doesn't work with React 19 RC" because it touched React internals, Aug 2024) is resolved in current 0.5x releases; BlockNote supports React 19. Pin all `@blocknote/*` to one recent 0.51.x to be safe.

**Known BlockNote + React 19 + Metro issues:** none specific to Metro documented, but (a) keep every `@blocknote/*` package on the identical version, and (b) in a pnpm monorepo enforce a **single** React / React-DOM instance across the web bundle (BlockNote/ProseMirror break with duplicate React copies — use pnpm `overrides`/`resolutions` or `nodeLinker` hoisting to dedupe).

---

## 4. Content round-trip (JSON, markdown, server)

**Block JSON shape** (`Block` / `PartialBlock`):
```ts
type PartialBlock = {
  id?: string;          // auto-generated if omitted
  type?: string;        // "paragraph" | "heading" | "bulletListItem" | ...
  props?: Record<string, any>;      // e.g. { level: 1 } for heading
  content?: string | InlineContent[] | TableContent;
  children?: PartialBlock[];        // nested blocks
};
```
Example:
```json
[
  { "id": "b1", "type": "heading", "props": { "level": 1 }, "content": "Welcome" },
  { "id": "b2", "type": "paragraph", "content": "Body text" }
]
```

**Read current doc:** `const doc: Block[] = editor.document;` (snapshot of top-level blocks). Same value delivered by `onChange`.

**Seed initial content:** pass a `PartialBlock[]` to the hook:
```ts
const editor = useCreateBlockNote({ initialContent: blocksJson });
```
`initialContent` is read once at creation. To swap content later on an already-mounted editor, use `editor.replaceBlocks(editor.document, newBlocks)`.

**Manipulation signatures:**
```ts
editor.replaceBlocks(blocksToRemove: BlockIdentifier[], blocksToInsert: PartialBlock[]): void
editor.insertBlocks(blocksToInsert: PartialBlock[], referenceBlock: BlockIdentifier, placement?: "before" | "after"): void
```

**Markdown ↔ blocks (client editor instance):**
```ts
const blocks = await editor.tryParseMarkdownToBlocks(md); // markdown -> blocks
const md     = await editor.blocksToMarkdownLossy(blocks); // blocks -> markdown
```
Treat both as **async — `await` them** (they are Promise-based in current BlockNote; the parser HTML-conversion sibling uses `await`). Markdown support is a lossy CommonMark + GFM subset (headings, lists, task lists, tables, code, blockquote, links, images, emphasis, strikethrough, hard breaks). Do not rely on it for exotic Markdown.

**Server-side (no DOM):** `@blocknote/server-util` gives a headless editor for Node (API routes, cron, Kiwi):
```ts
import { ServerBlockNoteEditor } from '@blocknote/server-util';
const server = ServerBlockNoteEditor.create(); // same options as useCreateBlockNote
const md     = await server.blocksToMarkdownLossy(blocks);
const blocks = await server.tryParseMarkdownToBlocks(md);
```
Useful for converting stored block JSON to Markdown for Kiwi context, or seeding block JSON from Markdown you already have — no browser/WebView needed.

---

## 5. Sizing / scroll / keyboard on iOS

The DOM component is a WebView; the classic RN-WebView-editor pains apply. Levers via the `dom` prop (`import('expo/dom').DOMProps`):

- **`style`** — set explicit `{ width, height }` or `{ flex: 1 }` on the WebView container. For a full-page editor give it `flex: 1` inside a flex parent; the editor then scrolls internally.
- **`scrollEnabled`** — `true` to let the WebView own vertical scroll (right for a long document editor); `false` if the outer RN screen should scroll and the editor should auto-grow.
- **`matchContents`** — auto-measure the DOM content and resize the native view to fit. Good for a short, embedded, non-scrolling editor; **bad for a large document** (it defeats internal scroll and forces the outer view to grow unbounded). For a full editor prefer fixed/flex height + `scrollEnabled: true`, not `matchContents`.
- **`containerStyle`** — wrapper styling around the WebView.

**Keyboard / focus gotchas:**
- iOS keyboard avoidance is not automatic for content inside a WebView. Wrap the native `<WikiEditor .../>` in `KeyboardAvoidingView`, and/or use the WebView's own viewport behavior; test caret-follows-keyboard on real focus.
- Programmatic focus from native must go through a DOM ref: expose `focus()` via `useDOMImperativeHandle(props.ref, () => ({ focus: () => editor.focus() }), [])` (React 19 / SDK 53+ ref pattern) and call it from native.
- contenteditable + iOS: watch for double-tap selection, autocorrect bar overlap, and scroll jumps on focus. Give the editor bottom padding so the last lines clear the keyboard.

---

## 6. Bundle size / Metro pitfalls

- `@blocknote/react` pulls in **ProseMirror** (many `prosemirror-*` packages), **TipTap** core, plus the chosen UI kit (`@blocknote/mantine` → Mantine + Floating UI). This is a **heavy web bundle** (hundreds of KB). It ships inside the WebView bundle, not the RN JS bundle, so it does not bloat native startup, but it does add to the DOM component's load time — relevant to the iOS blank-WebView risk below.
- **pnpm dedupe:** ensure a single copy of `react`, `react-dom`, and each `prosemirror-*` in the web graph. Duplicate ProseMirror or React instances are the classic "editor mounts blank / cursor errors" failure. Use `pnpm.overrides` / a root `resolutions` to pin.
- **Metro monorepo resolution:** the DOM/web bundle must resolve `@blocknote/*` from the workspace; verify `watchFolders` + `nodeModulesPaths` cover the pnpm store, or Metro throws "unable to resolve" only for the web bundle.
- Keep initial `onChange`/`initialContent` payloads lean (see gotchas).

---

## Gotchas / risks

1. **iOS blank WebView with large initial props (SDK 56, New Arch) — HIGH RISK.** Open Expo issue **#46374**: with `'use dom'` and non-trivial initial prop payloads (several KB), the WKWebView content process is killed by iOS before the JS bundle executes, leaving a blank editor with no error. Reported on **SDK 56.0.0 / `@expo/dom-webview ~56.0.5` / RN 0.85.3 / New Architecture (Fabric) / iOS 17.5+** — i.e. exactly this app's stack. **Not fixed in SDK 56** as of research date. A large `initialContent` block-JSON array is precisely the trigger. Mitigations reported (partial): mount a hidden "warmup" DOM component at app root to keep the WKWebView pool warm; deliver `initialContent` *after* mount via a bridged async fetch / `replaceBlocks` rather than as a big initial prop; keep the initial prop payload tiny. **Validate this early on-device/simulator before committing to the approach.**
2. **`@expo/dom-webview` missing from `bundledNativeModules.json` history (#47076)** caused silent version mismatch → Android startup crash on SDK upgrade. SDK 56 now lists it (`~56.0.5/6`), but after any SDK bump run `npx expo install --check` / `--fix` to keep `@expo/dom-webview` in lockstep.
3. **Async bridge, no sync returns.** `onChange` → native is fire-and-forget async; debounce saves. Prop updates are not synchronous.
4. **No `children`** on DOM components — the editor config must come via serializable props, not composition.
5. **Version lockstep** across all `@blocknote/*` packages; mismatch breaks the editor.
6. **`BlockNoteView` is NOT in `@blocknote/react`** — import it from `@blocknote/mantine` (or shadcn/ariakit). Easy to miss.
7. **CSS/font:** you must import both `@blocknote/mantine/style.css` and a font CSS; to match the app's EB Garamond / Louize aesthetic, override BlockNote's Inter with your own font CSS inside the DOM file.
8. **Markdown is lossy** (CommonMark+GFM subset) — store the block JSON as source of truth, use Markdown only for Kiwi/interchange.
9. **pnpm React/ProseMirror duplication** → blank editor; dedupe explicitly.

---

## Sources

- Expo DOM Components guide: https://docs.expo.dev/guides/dom-components/
- Expo DOM docs source (mdx): https://github.com/expo/expo/blob/main/docs/pages/guides/dom-components.mdx
- Expo `use-dom` skill: https://github.com/expo/skills/blob/main/plugins/expo/skills/use-dom/SKILL.md
- `@expo/dom-webview` (npm): https://www.npmjs.com/package/@expo/dom-webview
- Expo SDK 56 `bundledNativeModules.json` (react-native-webview 13.16.1, @expo/dom-webview ~56.0.6): https://github.com/expo/expo/blob/main/packages/expo/bundledNativeModules.json
- Expo SDK 56 changelog: https://expo.dev/changelog/sdk-56
- iOS blank WebView issue #46374: https://github.com/expo/expo/issues/46374
- bundledNativeModules mismatch issue #47076: https://github.com/expo/expo/issues/47076
- BlockNote getting started: https://www.blocknotejs.org/docs/getting-started
- BlockNote manipulating blocks: https://www.blocknotejs.org/docs/editor-api/manipulating-blocks
- BlockNote markdown import: https://www.blocknotejs.org/docs/features/import/markdown
- BlockNote blocks → markdown example: https://www.blocknotejs.org/examples/interoperability/converting-blocks-to-md
- BlockNote server-side processing (`@blocknote/server-util`): https://www.blocknotejs.org/docs/editor-api/server-processing
- BlockNote React 19 RC issue #1021: https://github.com/TypeCellOS/BlockNote/issues/1021
- `@blocknote/core` (npm): https://www.npmjs.com/package/@blocknote/core
- `@blocknote/react` (npm): https://www.npmjs.com/package/@blocknote/react
