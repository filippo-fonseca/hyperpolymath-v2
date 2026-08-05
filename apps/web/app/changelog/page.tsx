/**
 * /changelog - what shipped, and when.
 *
 * Static, prose-first, and deliberately mirrors /manifesto's chrome
 * (back-link header, SectionEyebrow, single column, dated sections) so the
 * reference routes read as one set. The source of truth for release content
 * is CHANGELOG.md at the repo root; this page is the human-facing rendering
 * of it, not a second ledger. When you add a release there, add it here.
 *
 * Voice: plain, declarative, no marketing. Removals and breakage lead, since
 * a reader who lost a route cares about that before they care about what is
 * new. No em dashes per house style on this branch.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow";

// The root layout supplies `template: "%s · Hyperpolymath"`, so the suffix is
// appended for us. Naming it here too renders it twice.
export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What shipped in Hyperpolymath, and when. Releases are dated, newest first.",
};

/** One dated release block. */
function Release({
  date,
  title,
  summary,
  children,
}: {
  date: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="space-y-4">
        <SectionEyebrow label={date} />
        <h2
          className="font-semibold text-[28px] leading-[1.2] text-[var(--sd-ink)]"
          style={{ letterSpacing: "-0.015em" }}
        >
          {title}
        </h2>
        <p className="text-[18px] leading-[1.65] text-[var(--sd-ink)]">
          {summary}
        </p>
      </div>
      <div className="space-y-8">{children}</div>
    </section>
  );
}

/**
 * A labelled group inside a release. `tone="break"` marks removals and
 * breaking changes, which get the accent rule so they cannot be skimmed past.
 */
function Group({
  label,
  tone = "default",
  children,
}: {
  label: string;
  tone?: "default" | "break";
  children: React.ReactNode;
}) {
  const isBreak = tone === "break";
  return (
    <div
      className={
        isBreak
          ? "border-l-2 border-[var(--sd-accent)] pl-5 space-y-3"
          : "border-l border-[var(--sd-line)] pl-5 space-y-3"
      }
    >
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--sd-ink-faint)]">
        {label}
      </p>
      <ul className="space-y-2.5 text-[16px] leading-[1.6] text-[var(--sd-ink)]">
        {children}
      </ul>
    </div>
  );
}

/** One entry. `lead` is the bolded claim; children carry the detail. */
function Entry({
  lead,
  children,
}: {
  lead: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-[0.6em] h-px w-3 shrink-0 bg-[var(--sd-line)]"
      />
      <span>
        <span className="font-medium text-[var(--sd-ink)]">{lead}</span>
        {children ? (
          <span className="text-[var(--sd-ink-dull)]"> {children}</span>
        ) : null}
      </span>
    </li>
  );
}

export default function ChangelogPage() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-6 md:px-10 py-16 space-y-16">
      <header className="flex flex-col gap-4">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)] transition-colors w-fit"
        >
          ← Hyperpolymath
        </Link>
        <div>
          <SectionEyebrow label="§ 00 · CHANGELOG" />
          <h1
            className="mt-4 font-semibold text-[40px] md:text-[48px] leading-[1.05] text-[var(--sd-ink)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            What shipped, and when.
          </h1>
          <p className="mt-5 text-[18px] leading-[1.65] text-[var(--sd-ink-dull)]">
            Releases are dated rather than numbered. Removals and breaking
            changes lead each entry, because the thing you lost matters more
            than the thing you gained.
          </p>
        </div>
      </header>

      <Release
        date="2026-08-04"
        title="Craft v2: the canvas learned its place."
        summary="The July release made everything glass; this one teaches the shell restraint. One flat, calm canvas now carries all the chrome — a quiet borderless sidebar, a minimal top bar with a centered command pill, dock widgets that float as plain white cards — and elevation belongs to content alone: the stage sheet, the cards, and frosted glass popovers everywhere. LifeOS, Tasks, and Wiki all speak the new register."
      >
        <Group label="Removed · Breaking" tone="break">
          <Entry lead="The top tab strip is gone.">
            Navigation lives in the sidebar; the top bar now holds nav arrows,
            the route title, and a centered &ldquo;Open anything&rdquo; pill
            that summons the command menu.
          </Entry>
          <Entry lead="The cyan scrollbar retired from civilian life.">
            Scroll thumbs are quiet neutral ink app-wide; JARVIS keeps its
            cyan instrumentation inside agent surfaces only.
          </Entry>
        </Group>

        <Group label="The shell">
          <Entry lead="Canvas-vs-sheet architecture.">
            The sidebar and dock shed their glass boxes and sit directly on
            the canvas; the stage sheet is the one floating surface, and dock
            widgets carry their own elevation as lifted white cards.
          </Entry>
          <Entry lead="JARVIS idles as a centered pill">
            and expands into the full glass panel the moment you engage it.
          </Entry>
          <Entry lead="Every menu, popover, and dialog frosts.">
            One glass recipe upgrades the entire overlay layer, with a solid
            fallback where backdrop blur is unsupported.
          </Entry>
        </Group>

        <Group label="Feature passes">
          <Entry lead="Tasks reads like a hub:">
            segmented chip filters, bare rows on the sheet with tinted meta
            chips, borderless pastel kanban wells with hover-lifted cards.
          </Entry>
          <Entry lead="Wiki joined the register for real.">
            Doc and folder tiles are white cards with pastel icon plates and
            live page previews; journal days are proper day tiles; the editor
            column narrowed to a calm 720px.
          </Entry>
          <Entry lead="LifeOS calmed down:">
            a one-accent hero, a pill quick-send, chip view toggles, and bento
            tiles that finally let their titles breathe on small spans.
          </Entry>
        </Group>
      </Release>

      <Release
        date="2026-07-29"
        title="The craft release: the whole app got color."
        summary="A ground-up visual rebuild in the Craft.do spirit: floating glass chrome, a cream canvas, soft depth everywhere, and a pastel tint system that gives every entity in the app a color of its own. Every feature surface was repainted in one campaign, and a few long-broken details got fixed on the way through."
      >
        <Group label="Removed · Breaking" tone="break">
          <Entry lead="The sidebar HOME strip is gone.">
            Its wifi indicator, link tally, and device list moved into the
            dock&apos;s Home card — which also gained the power switches the
            strip never had.
          </Entry>
          <Entry lead="The wiki's always-dark palette is retired.">
            The explorer now follows the app theme like every other surface.
          </Entry>
        </Group>

        <Group label="The craft register">
          <Entry lead="Floating glass cockpit:">
            the sidebar, dock, and side panels are detached blurred-glass
            panels; the active route sits on a rounded sheet over a pastel
            wash; Kiwi is a floating glass pill.
          </Entry>
          <Entry lead="Eight-hue pastel tint system.">
            Kanban columns tint by status, habits and people and hashtags and
            journal days each keep a stable hue of their own, training types
            paint with their stored color, and calendar events wear their
            calendar&apos;s pastel with a saturated edge.
          </Entry>
          <Entry lead="One shadow ladder, one radius scale,">
            applied from task cards to settings sections to the JARVIS console
            — which kept its cyan identity and only borrowed the depth.
          </Entry>
        </Group>

        <Group label="New">
          <Entry lead="Star wiki pages.">
            A star in the page toolbar and the explorer&apos;s context menu;
            starred pages badge in amber and sort first.
          </Entry>
          <Entry lead="Control your lights from the dock.">
            The Home card now flips Govee lights directly, with live state,
            a wifi indicator, and lit bulbs glowing in their actual color.
          </Entry>
          <Entry lead="The dock got substance:">
            today&apos;s actual tasks with status dots, per-habit tinted
            check rings with a completion bar, and the next event rendered as
            a miniature calendar plate.
          </Entry>
        </Group>

        <Group label="Fixed">
          <Entry lead="The LifeOS space loop is visible again.">
            A stacking-context regression had hidden the ISS timelapse
            entirely; it now drifts at half speed behind the glass widgets in
            both themes.
          </Entry>
          <Entry lead="Composer placeholders returned from the dead.">
            Every TipTap composer had silently shipped promptless since the
            editor migration.
          </Entry>
          <Entry lead="Long wiki names no longer walk across the grid.">
            Tiles truncate at their column instead of painting over their
            neighbors.
          </Entry>
        </Group>
      </Release>

      <Release
        date="2026-07-16"
        title="JARVIS left the browser tab."
        summary="The release where Hyperpolymath stopped being a web app with an agent and became a desktop-native ambient computer. JARVIS moved onto the desktop as a floating HUD you can drive with your hands, learned to read and send real messages, and the entire web surface was repainted."
      >
        <Group label="Removed · Breaking" tone="break">
          <Entry lead="The 3D web /studio route is gone.">
            It was built, evaluated, and deliberately stripped in the same
            cycle. The amphitheater proved to be the wrong container for the
            idea, so Studio now exists only as the desktop HUD.
          </Entry>
          <Entry lead="Widget pinch-pull resize was dropped">
            from the studio input contract. Open-hand and pinch-corner resize
            returned as different mechanisms, so the capability survives; the
            old gesture does not.
          </Entry>
        </Group>

        <Group label="Studio HUD · desktop">
          <Entry lead="A full-window HUD floats widgets over the desktop:">
            weather, news, browser, camera, clock, WhatsApp, and a persistent
            JARVIS orb.
          </Entry>
          <Entry lead="Browser widgets render real sites">
            through a native webview bridge rather than an iframe. Popups
            reopen as managed widgets instead of escaping.
          </Entry>
          <Entry lead="Widgets are draggable, stowable, and summonable by name.">
            Throw one at a screen edge and it bursts away to dismiss. Layouts
            persist across sessions.
          </Entry>
        </Group>

        <Group label="Hand tracking · desktop">
          <Entry lead="Drive the HUD with your hands through the webcam,">
            behind a consent flow and a persistent kill switch.
          </Entry>
          <Entry lead="Quick-pinch clicks, fist-drag scrolls, open hands resize.">
            Gestures synthesize real DOM pointer events, so they drive ordinary
            UI and not just bespoke targets.
          </Entry>
          <Entry lead="A thumb-confirm gesture gates outgoing messages.">
            You approve a send with your hand.
          </Entry>
        </Group>

        <Group label="Messaging">
          <Entry lead="WhatsApp ships as a supervised bridge">
            with QR pairing in the HUD. The widget is a two-level client: chat
            list plus per-chat history. Names resolve from macOS Contacts, so a
            raw JID never surfaces as a chat name.
          </Entry>
          <Entry lead="iMessage is mirrored into the app">
            by a background worker, with SMS fallback on send.
          </Entry>
          <Entry lead="Incoming messages raise a toast near the orb,">
            open the relevant widget, and are spoken aloud. Storms collapse
            against a watermark.
          </Entry>
        </Group>

        <Group label="JARVIS">
          <Entry lead="A new /jarvis tab">
            consolidates routines, a personality editor (preset, formality,
            verbosity, and wit dials), and a startup editor.
          </Entry>
          <Entry lead="Routines fire mid-conversation">
            from a spoken utterance, via voice-tolerant phrase matching.
          </Entry>
          <Entry lead="Quick web questions are answered and paired to a widget,">
            so the answer arrives with something to look at.
          </Entry>
        </Group>

        <Group label="Wiki · LifeOS">
          <Entry lead="The wiki explorer was rebuilt at Spacedrive fidelity:">
            grid and list views, keyboard selection, context menus, an
            inspector, rubber-band drag, and drag-to-reorder with optimistic
            moves.
          </Entry>
          <Entry lead="A journal rail">
            carries a today card, a trail of recent days, and a calendar
            popover.
          </Entry>
          <Entry lead="LifeOS became a one-screen command deck">
            with a fixed bento layout and dynamic widget resize.
          </Entry>
        </Group>

        <Group label="Design">
          <Entry lead="Glass was retired app-wide">
            in favor of solid plates, hairlines, and a single cyan accent.
          </Entry>
          <Entry lead="Space Grotesk is the new app-wide sans.">
            EB Garamond is now reserved solely for the logotype.
          </Entry>
          <Entry lead="Light and dark are both first-class,">
            and a /design route documents the system.
          </Entry>
        </Group>

        <Group label="Fixed">
          <Entry lead="iMessage double-send eliminated">
            via normalized dedupe and a dispatch latch.
          </Entry>
          <Entry lead="A multi-user leak seam was closed">
            by threading the user id through studio action emission and
            filtering at the stream boundary.
          </Entry>
          <Entry lead="Link previews were hardened against SSRF,">
            with bounds on response body reads.
          </Entry>
        </Group>
      </Release>

      <footer className="pt-8 border-t border-[var(--sd-line)]">
        <p className="text-[16px] leading-[1.55] text-[var(--sd-ink-dull)]">
          The full engineering record, including database migrations and known
          issues, lives in{" "}
          <code className="font-mono text-[14px] text-[var(--sd-ink)]">
            CHANGELOG.md
          </code>{" "}
          in the repository.
        </p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--sd-ink-dull)]">
          ❦ Filippo Fonseca · New Haven
        </p>
      </footer>
    </main>
  );
}
