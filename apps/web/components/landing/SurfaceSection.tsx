import { Keyboard, Monitor, Cpu, ExternalLink } from "lucide-react";
import { SectionEyebrow } from "./SectionEyebrow";
import { LifeosCanvasPreview } from "./LifeosCanvasPreview";
import { Reveal } from "./Reveal";

const SURFACES = [
  "LifeOS", "Today", "Search", "Areas", "Projects", "Tasks", "Captures",
  "Wiki", "Calendar", "Habits", "Training", "Health", "Graph", "Insights",
  "JARVIS",
] as const;

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
    <Reveal as="section" className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 07 · THE SURFACE" />

      <h2 className="mt-2 font-semibold text-headline leading-[1.15] tracking-[-0.01em] text-[var(--sd-ink)]">
        One canvas. Any input.
      </h2>

      <p className="mt-4 text-lead leading-[1.6] text-[var(--sd-ink)]">
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

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-micro font-medium uppercase tracking-[0.14em] text-[var(--sd-ink-faint)]">
          Surfaces
        </span>
        {SURFACES.map((s) => (
          <span
            key={s}
            className="inline-flex items-center rounded border border-[var(--sd-line)] bg-[var(--sd-box)] px-1.5 py-[1px] text-tiny font-medium tracking-wide text-[var(--sd-ink-dull)]"
          >
            {s}
          </span>
        ))}
      </div>

      {/* Twin visual artifact: the Areas tree (spine) + the Knowledge
          Graph (relationships). Renders what "one canvas" actually means
          before pivoting into the input-paths card grid below. */}
      <LifeosCanvasPreview />

      <p className="mt-12 text-lead leading-[1.6] text-[var(--sd-ink)]">
        Getting sentences <em>into</em> JARVIS has two paths. Neither
        depends on the other. Both feed the same agent, the same router,
        the same hierarchy.
      </p>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1 — Desktop App (software middleman) */}
        <div className="flex flex-col rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-6 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex size-7 items-center justify-center rounded-[7px] border border-[var(--sd-line)] bg-[var(--sd-input)] text-[var(--sd-ink-faint)]"
              aria-hidden="true"
            >
              <Monitor size={15} strokeWidth={1.75} />
            </span>
            <p className="font-mono text-micro font-medium uppercase tracking-[0.14em] text-[var(--sd-ink-faint)]">
              DESKTOP APP
            </p>
          </div>

          <h3 className="mt-4 font-semibold text-title leading-[1.2] text-[var(--sd-ink)]">
            The default path.
          </h3>

          <p className="mt-3 text-subtitle leading-[1.55] text-[var(--sd-ink)]">
            A small Mac app sits in your menu bar, listens for a global
            hotkey, opens a single composer, and ships the sentence
            straight to JARVIS. No hardware, no setup beyond installing
            the app. If you only want one path, this is it.
          </p>

          <ul className="mt-4 space-y-1.5 text-subtitle text-[var(--sd-ink-faint)]">
            <li>· Global hotkey, anywhere on macOS</li>
            <li>· Voice or text, same composer</li>
            <li>· Always-on; no browser needed</li>
          </ul>
        </div>

        {/* Card 2 — Polypad (hardware middleman, open-source). The accent
            path: a cyan-tinted edge (no glow) marks it as the optional one. */}
        <div
          className="flex flex-col rounded-[14px] bg-[var(--sd-box)] p-6 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]"
          style={{
            border:
              "1px solid color-mix(in oklch, var(--sd-accent) 30%, var(--sd-line))",
          }}
        >
          <div className="flex items-center justify-center gap-2">
            <span
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] border border-[var(--sd-line)] bg-[var(--sd-input)] text-[var(--sd-accent)]"
              aria-hidden="true"
            >
              <Cpu size={15} strokeWidth={1.75} />
            </span>
            <p className="min-w-0 text-center font-mono text-micro font-medium uppercase leading-snug tracking-[0.12em] text-[var(--sd-accent)] sm:text-micro sm:tracking-[0.14em]">
              MACROPAD + VOICE DETECTOR HARDWARE
            </p>
          </div>

          <h3 className="mt-4 font-semibold text-title leading-[1.2] text-[var(--sd-ink)]">
            The Polypad.
          </h3>

          <p className="mt-3 text-subtitle leading-[1.55] text-[var(--sd-ink)]">
            I built a small ESP32-based macropad that sits on the desk and
            fires JARVIS turns over a USB-serial bridge. Push a key to
            talk, push another to capture. The firmware, bridge, and CAD
            files are in the repo. Fork it, change the layout, mount
            different switches, ship your own.
          </p>

          <ul className="mt-4 space-y-1.5 text-subtitle text-[var(--sd-ink-faint)]">
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
            className="mt-5 inline-flex items-center gap-1.5 font-mono text-meta font-medium tracking-[0.04em] text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)] transition-colors w-fit"
          >
            <span>Build your own →</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      </div>

      <p className="mt-6 font-mono text-body text-[var(--sd-ink-faint)]">
        Same agent. Same contract. Two surfaces. Pick whichever fits your
        hands.
      </p>
    </Reveal>
  );
}
