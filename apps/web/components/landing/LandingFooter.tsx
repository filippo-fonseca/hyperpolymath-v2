import { Github, Globe, Palette, Scale, FileText, Mail } from "lucide-react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";

/**
 * Landing footer — banner-aesthetic close-out.
 *
 * Top: a wordmark row with the kiwi glyph + "Hyperpolymath." set in
 * EB Garamond so the footer echoes the README hero banner.
 * Middle: a grid of distinctive link tiles for github, personal site,
 * branding & logos page, license, and contact. Each tile gets its own
 * Lucide icon + mono label so the row stops looking like flat text.
 * Bottom: a three-kiwi divider (matching the new SectionDivider),
 * sign-off italic line, and a "Made with ♥" caption.
 */

interface LinkTile {
  href: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; "aria-hidden"?: boolean }>;
  external?: boolean;
}

const LINKS: LinkTile[] = [
  {
    href: "https://github.com/filippo-fonseca/hyperpolymath-v2",
    label: "GitHub",
    hint: "Read the source. Fork the schema.",
    icon: Github,
    external: true,
  },
  {
    href: "https://filippofonseca.com",
    label: "filippofonseca.com",
    hint: "The personal site. Writing, projects, more.",
    icon: Globe,
    external: true,
  },
  {
    href: "/branding",
    label: "Branding & Logos",
    hint: "Wordmark, colors, kiwi assets.",
    icon: Palette,
  },
  {
    href: "https://opensource.org/licenses/MIT",
    label: "MIT License",
    hint: "Open source by commitment.",
    icon: Scale,
    external: true,
  },
  {
    href: "/manifesto",
    label: "Manifesto",
    hint: "The thesis behind the system.",
    icon: FileText,
  },
  {
    href: "mailto:hello@hyperpolymath.com",
    label: "Get in touch",
    hint: "Questions, ideas, collabs.",
    icon: Mail,
    external: true,
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--edge)] pt-16 md:pt-20 pb-14">
      <div className="max-w-[1080px] mx-auto px-6 md:px-10 space-y-12">
        {/* ── Top: wordmark row ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-4">
            <KiwiIcon
              size={48}
              className="text-[var(--ink)]"
            />
            <span className="font-serif font-semibold text-[40px] md:text-[44px] leading-none tracking-[-0.01em] text-[var(--ink)]">
              Hyperpolymath.
            </span>
          </div>
          <p className="font-serif italic text-[16px] md:text-[18px] leading-[1.5] text-[var(--ink-muted)] max-w-[320px] md:text-right">
            A personal life-OS for people who refuse to specialize.
          </p>
        </div>

        {/* ── Middle: distinctive link tiles ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {LINKS.map((link) => {
            const Icon = link.icon;
            const externalProps = link.external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {};
            return (
              <a
                key={link.label}
                href={link.href}
                {...externalProps}
                className="group flex items-start gap-3 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-4 py-3.5 transition-all hover:border-[var(--ink)]/30 hover:bg-[var(--surface-raised)] hover:-translate-y-px"
                style={{
                  boxShadow:
                    "0 1px 0 color-mix(in oklch, white 60%, transparent) inset",
                }}
              >
                <span
                  className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-[var(--surface-raised)] border border-[var(--edge)] text-[var(--ink)] transition-colors group-hover:text-[var(--hud-cyan)] group-hover:border-[var(--hud-cyan)]/40"
                  aria-hidden="true"
                >
                  <Icon size={15} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--ink)]">
                    {link.label}
                  </p>
                  <p className="mt-0.5 font-serif text-[13px] leading-[1.4] text-[var(--ink-muted)] truncate">
                    {link.hint}
                  </p>
                </div>
                {link.external && (
                  <span
                    className="font-mono text-[11px] text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 transition-opacity self-center"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                )}
              </a>
            );
          })}
        </div>

        {/* ── Three-kiwi ornament (matches SectionDivider) ── */}
        <div
          className="flex items-center justify-center gap-[4em] text-[var(--ink-muted)] opacity-60"
          aria-hidden="true"
        >
          <KiwiIcon size={14} />
          <KiwiIcon size={14} />
          <KiwiIcon size={14} />
        </div>

        {/* ── Sign-off + signature ── */}
        <div className="space-y-2 text-center">
          <p className="font-serif italic text-[14px] text-[var(--ink-muted)]">
            how you do one thing is how you do everything. love what you do.
          </p>
          <p className="font-serif text-[14px] text-[var(--ink-muted)]">
            Made with{" "}
            <span
              aria-label="love"
              style={{ color: "var(--hud-cyan)" }}
              className="align-middle"
            >
              ♥
            </span>{" "}
            by{" "}
            <a
              href="https://filippofonseca.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--ink-muted)] decoration-1 underline-offset-[3px] transition-colors hover:text-[var(--hud-cyan)] hover:decoration-[var(--hud-cyan)]"
            >
              Filippo Fonseca
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
