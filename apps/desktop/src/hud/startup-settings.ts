// apps/desktop/src/hud/startup-settings.ts
// Wiring for the "Startup & Wake" section of the settings drawer (index.html).
// Four controls, all persisting via saveSetting() immediately on change (the
// drawer has no save button — same live-apply pattern as the TTS/PE toggles
// wired in main.ts):
//
//   #wake-enabled              → wakeEnabled          (+ live setWakeEnabled)
//   #startup-briefing-enabled  → startupBriefingEnabled
//   #open-on-start-list/-add   → startupOpenOnStart   (type select + value)
//   #startup-shortcuts-list/-add → startupShortcuts   (macOS Shortcuts names)
//
// The two list editors render their rows dynamically. Text edits persist on
// `change` (blur / Enter — Enter blurs the input so it commits immediately);
// add/remove persist at once. Empty-valued rows are kept visible for editing
// but filtered out of the persisted value, so the store only ever holds
// well-shaped entries (settings.ts sanitizers enforce the same on load).

import { saveSetting, type DesktopSettings, type StartupOpenItem } from "@/settings";
import { setWakeEnabled } from "@/wake/wake-probe";

/** Wire the whole Startup & Wake section. Called once from boot(). */
export function wireStartupWakeSettings(settings: DesktopSettings): void {
  wireWakeToggle(settings.wakeEnabled);
  wireBriefingToggle(settings.startupBriefingEnabled);
  wireOpenOnStartEditor(settings.startupOpenOnStart);
  wireShortcutsEditor(settings.startupShortcuts);
}

// ── Toggles ──────────────────────────────────────────────────────────────────

function wireWakeToggle(initial: boolean): void {
  const el = document.getElementById("wake-enabled") as HTMLInputElement | null;
  if (!el) return;
  el.checked = initial;
  el.addEventListener("change", () => {
    // Live-apply: starts/stops the idle wake listener without a restart
    // (logs "[wake] enabled — idle listener started" / "[wake] disabled —
    // idle listener stopped"). Persisting also writes the explicit-set
    // marker, so this user choice survives the opt-in default.
    setWakeEnabled(el.checked);
    void saveSetting("wakeEnabled", el.checked);
  });
}

function wireBriefingToggle(initial: boolean): void {
  const el = document.getElementById("startup-briefing-enabled") as HTMLInputElement | null;
  if (!el) return;
  el.checked = initial;
  el.addEventListener("change", () => {
    void saveSetting("startupBriefingEnabled", el.checked);
  });
}

// ── Shared list-editor plumbing ──────────────────────────────────────────────

/** Blur on Enter so the input's `change` handler commits immediately. */
function commitOnEnter(input: HTMLInputElement): void {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
  });
}

function makeRemoveButton(onRemove: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "stop-btn list-remove";
  btn.textContent = "✕";
  btn.setAttribute("aria-label", "Remove");
  btn.addEventListener("click", onRemove);
  return btn;
}

/** Show/refresh the "None yet" hint when the list has no rows. */
function syncEmptyHint(listEl: HTMLElement, hint: string): void {
  const existing = listEl.querySelector(".list-empty");
  const hasRows = listEl.querySelector(".list-item") !== null;
  if (hasRows) {
    existing?.remove();
    return;
  }
  if (!existing) {
    const el = document.createElement("div");
    el.className = "list-empty";
    el.textContent = hint;
    listEl.appendChild(el);
  }
}

// ── Open on start (type select + value) ──────────────────────────────────────

const OPEN_PLACEHOLDER: Record<StartupOpenItem["type"], string> = {
  url: "https://mail.google.com",
  app: "Spotify",
};

function wireOpenOnStartEditor(initial: StartupOpenItem[]): void {
  const listEl = document.getElementById("open-on-start-list");
  const addBtn = document.getElementById("open-on-start-add");
  if (!listEl || !addBtn) return;

  const collect = (): StartupOpenItem[] =>
    [...listEl.querySelectorAll<HTMLElement>(".list-item")]
      .map((row) => {
        const select = row.querySelector("select");
        const input = row.querySelector("input");
        const type: StartupOpenItem["type"] = select?.value === "app" ? "app" : "url";
        const value = input?.value.trim() ?? "";
        return { type, value };
      })
      .filter((item) => item.value.length > 0);

  const persist = (): void => {
    void saveSetting("startupOpenOnStart", collect());
  };

  const buildRow = (item: StartupOpenItem): HTMLDivElement => {
    const row = document.createElement("div");
    row.className = "list-item";

    const select = document.createElement("select");
    for (const [value, label] of [
      ["url", "URL"],
      ["app", "App"],
    ] as const) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    }
    select.value = item.type;
    select.setAttribute("aria-label", "Open on start type");

    const input = document.createElement("input");
    input.type = "text";
    input.value = item.value;
    input.placeholder = OPEN_PLACEHOLDER[item.type];
    input.setAttribute("aria-label", "Open on start value");
    commitOnEnter(input);

    select.addEventListener("change", () => {
      input.placeholder = OPEN_PLACEHOLDER[select.value === "app" ? "app" : "url"];
      persist();
    });
    input.addEventListener("change", persist);

    row.append(
      select,
      input,
      makeRemoveButton(() => {
        row.remove();
        persist();
        syncEmptyHint(listEl, "Nothing opens on start.");
      }),
    );
    return row;
  };

  for (const item of initial) listEl.appendChild(buildRow(item));
  syncEmptyHint(listEl, "Nothing opens on start.");

  addBtn.addEventListener("click", () => {
    const row = buildRow({ type: "url", value: "" });
    listEl.appendChild(row);
    syncEmptyHint(listEl, "Nothing opens on start.");
    row.querySelector("input")?.focus();
    // No persist here — an empty value is filtered out anyway; it lands in
    // the store on the input's first `change`.
  });
}

// ── Startup Shortcuts (macOS Shortcuts names) ────────────────────────────────

function wireShortcutsEditor(initial: string[]): void {
  const listEl = document.getElementById("startup-shortcuts-list");
  const addBtn = document.getElementById("startup-shortcuts-add");
  if (!listEl || !addBtn) return;

  const collect = (): string[] =>
    [...listEl.querySelectorAll<HTMLInputElement>(".list-item input")]
      .map((input) => input.value.trim())
      .filter((name) => name.length > 0);

  const persist = (): void => {
    void saveSetting("startupShortcuts", collect());
  };

  const buildRow = (name: string): HTMLDivElement => {
    const row = document.createElement("div");
    row.className = "list-item";

    const input = document.createElement("input");
    input.type = "text";
    input.value = name;
    input.placeholder = "Shortcut name (as in the Shortcuts app)";
    input.setAttribute("aria-label", "Startup Shortcut name");
    commitOnEnter(input);
    input.addEventListener("change", persist);

    row.append(
      input,
      makeRemoveButton(() => {
        row.remove();
        persist();
        syncEmptyHint(listEl, "No Shortcuts run on start.");
      }),
    );
    return row;
  };

  for (const name of initial) listEl.appendChild(buildRow(name));
  syncEmptyHint(listEl, "No Shortcuts run on start.");

  addBtn.addEventListener("click", () => {
    const row = buildRow("");
    listEl.appendChild(row);
    syncEmptyHint(listEl, "No Shortcuts run on start.");
    row.querySelector("input")?.focus();
  });
}
