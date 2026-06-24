import { Keyboard, Monitor, Cpu, ExternalLink } from "lucide-react";
import { SectionEyebrow } from "./SectionEyebrow";
import { LifeosCanvasPreview } from "./LifeosCanvasPreview";

/**
 * §07 — The Surface (LifeOS canvas + two input paths).
 *
 * Two halves:
 *   - Top: LifeOS as the unified canvas — areas, captures, habits, tasks,
 *     and Life analytics all live on one page. The point is convergence.
 *   - Bottom: getting sentences IN. Two equally-weighted cards.
 *       Card 1 (Desktop App): the default. Software middleman, global
 *         hotkey, no hardware. Works on any Mac.
 *       Card 2 (Polypad): the optional hardware path. Open-source ESP32
 *         build, anyone can fork the firmware + 3D-print the case + drop
 *         their own keys onto it. Plugs into the same bridge.
 *
 * Visual register matches Engine + Choice: max-w-[920px] section, mono
 * eyebrow, Display 2 heading, serif body, then a 2-col card grid.
 */

const POLYPAD_REPO_URL =
  "https://github.com/filippo-fonseca/hyperpolymath-v2/tree/main/tools/jarvis-physical";

export function SurfaceSection() {
  return (
    <section className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 07 · THE SURFACE" />

      <h2 className="mt-2 font-serif font-semibold text-[32px] leading-[1.2] text-[var(--ink)]">
        One canvas. Any input.
      </h2>

      <p className="mt-4 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        Areas, projects, tasks, captures, wiki pages, habits, training,
        health, your Google Calendar, the relationship graph between all of
        it, and the insights that fall out: every signal worth tracking lives on a
        single page called <em>LifeOS</em>. The whole system converges into
        one document so the agent and I are always looking at the same
        thing. One global search reaches across all of it: hit
        <span className="font-mono"> ⌘K</span> from anywhere, or open the
        Search surface, and every task, capture, project, area, and habit
        is one substring away.
      </p>

      <p className="mt-4 font-mono text-[13px] leading-[1.6] tracking-[0.02em] text-[var(--ink-muted)]">
        SURFACES&nbsp;·&nbsp; LifeOS · Today · Search · Areas · Projects ·
        Tasks · Captures · Wiki · Calendar · Habits · Training · Health ·
        Graph · Insights · JARVIS
      </p>

      {/* Twin visual artifact: the Areas tree (spine) + the Knowledge
          Graph (relationships). Renders what "one canvas" actually means
          before pivoting into the input-paths card grid below. */}
      <LifeosCanvasPreview />

      <p className="mt-12 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        Getting sentences <em>into</em> JARVIS has two paths. Neither
        depends on the other. Both feed the same agent, the same router,
        the same hierarchy.
      </p>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1 — Desktop App (software middleman) */}
        <div
          className="border border-[var(--edge)] rounded-lg bg-[var(--surface)] p-6 flex flex-col"
          style={{
            boxShadow:
              "0 1px 0 color-mix(in oklch, white 70%, transparent) inset, 0 8px 24px -16px color-mix(in oklch, black 28%, transparent)",
          }}
        >
          <div className="flex items-center gap-2">
            <Monitor size={16} className="text-[var(--ink-muted)]" aria-hidden="true" />
            <p className="font-mono text-[14px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              DESKTOP APP
            </p>
          </div>

          <h3 className="mt-4 font-serif font-semibold text-[22px] leading-[1.2] text-[var(--ink)]">
            The default path.
          </h3>

          <p className="mt-3 font-serif text-[16px] leading-[1.55] text-[var(--ink)]">
            A small Mac app sits in your menu bar, listens for a global
            hotkey, opens a single composer, and ships the sentence
            straight to JARVIS. No hardware, no setup beyond installing
            the app. If you only want one path, this is it.
          </p>

          <ul className="mt-4 space-y-1.5 font-serif text-[15px] text-[var(--ink-muted)]">
            <li>· Global hotkey, anywhere on macOS</li>
            <li>· Voice or text, same composer</li>
            <li>· Always-on; no browser needed</li>
          </ul>
        </div>

        {/* Card 2 — Polypad (hardware middleman, open-source) */}
        <div
          className="rounded-lg bg-[var(--surface-raised)] p-6 flex flex-col"
          style={{
            border: "1px solid var(--edge-hud)",
            boxShadow:
              "var(--glow-hud-subtle), 0 1px 0 color-mix(in oklch, white 50%, transparent) inset, 0 10px 28px -18px color-mix(in oklch, black 35%, transparent)",
          }}
        >
          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
            <Cpu size={16} style={{ color: "var(--hud-cyan-light)" }} aria-hidden="true" />
            <p
              className="font-mono text-[14px] font-medium uppercase tracking-[0.14em]"
              style={{ color: "var(--hud-cyan-light)" }}
            >
              MACROPAD + VOICE DETECTOR HARDWARE
            </p>
          </div>

          <h3 className="mt-4 font-serif font-semibold text-[22px] leading-[1.2] text-[var(--ink)]">
            The Polypad.
          </h3>

          <p className="mt-3 font-serif text-[16px] leading-[1.55] text-[var(--ink)]">
            I built a small ESP32-based macropad that sits on the desk and
            fires JARVIS turns over a USB-serial bridge. Push a key to
            talk, push another to capture. The firmware, bridge, and CAD
            files are in the repo. Fork it, change the layout, mount
            different switches, ship your own.
          </p>

          <ul className="mt-4 space-y-1.5 font-serif text-[15px] text-[var(--ink-muted)]">
            <li>
              <Keyboard
                size={12}
                className="inline-block mr-1 -mt-0.5"
                aria-hidden="true"
              />
              ESP32 + custom keys, USB-serial bridge
            </li>
            <li>· Open-source firmware + case</li>
            <li>· Works alongside the desktop app, not instead of it</li>
          </ul>

          <a
            href={POLYPAD_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 font-mono text-[13px] font-medium tracking-[0.04em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors w-fit"
          >
            <span>Build your own →</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      </div>

      <p className="mt-6 font-mono text-[14px] text-[var(--ink-muted)]">
        Same agent. Same contract. Two surfaces. Pick whichever fits your
        hands.
      </p>
    </section>
  );
}
