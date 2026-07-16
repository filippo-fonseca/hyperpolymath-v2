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
