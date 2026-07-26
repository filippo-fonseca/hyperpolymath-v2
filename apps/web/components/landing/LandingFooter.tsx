import Link from "next/link";
import { Github, Globe, Palette, Scale, FileText, Mail } from "lucide-react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { Logotype } from "@/components/ui/Logotype";

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
    <footer className="border-t border-[var(--sd-line)] pt-16 md:pt-20 pb-14">
      <div className="max-w-[1080px] mx-auto px-6 md:px-10 space-y-12">
        {/* ── Top: wordmark row ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-4">
            <KiwiIcon
              size={48}
              className="text-[var(--sd-ink)]"
            />
            <span className="min-w-0 text-[clamp(1.75rem,8vw,2.75rem)] leading-none text-[var(--sd-ink)] md:text-[44px]">
              <Logotype />.
            </span>
          </div>
          <p className="italic text-[16px] md:text-[18px] leading-[1.5] text-[var(--sd-ink-faint)] max-w-[320px] md:text-right">
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
                className="group flex items-start gap-3 rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)] px-4 py-3.5 transition-all hover:border-[var(--sd-accent)]/40"
                style={{
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.06) inset",
                }}
              >
                <span
                  className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-[var(--sd-input)] border border-[var(--sd-line)] text-[var(--sd-ink)] transition-colors group-hover:text-[var(--sd-accent)]"
                  aria-hidden="true"
                >
                  <Icon size={15} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--sd-ink)]">
                    {link.label}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-[1.4] text-[var(--sd-ink-faint)] truncate">
                    {link.hint}
                  </p>
                </div>
                {link.external && (
                  <span
                    className="font-mono text-[11px] text-[var(--sd-ink-faint)] opacity-0 group-hover:opacity-100 transition-opacity self-center"
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
          className="flex items-center justify-center gap-[2.5em] text-[var(--sd-ink-faint)] opacity-60 sm:gap-[4em]"
          aria-hidden="true"
        >
          <KiwiIcon size={14} />
          <KiwiIcon size={14} />
          <KiwiIcon size={14} />
        </div>

        {/* ── Quiet system links: the campaign design system ── */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--sd-ink-faint)]">
          <Link
            href="/changelog"
            className="transition-colors hover:text-[var(--sd-accent)]"
          >
            Changelog
          </Link>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <Link
            href="/design"
            className="transition-colors hover:text-[var(--sd-accent)]"
          >
            Design system
          </Link>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <a
            href="https://github.com/filippo-fonseca/hyperpolymath-v2/blob/main/docs/DESIGN-SYSTEM.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-[var(--sd-accent)]"
          >
            DESIGN-SYSTEM.md
            <span aria-hidden="true">↗</span>
          </a>
        </div>

        {/* ── Sign-off + signature ── */}
        <div className="space-y-2 text-center">
          <p className="italic text-[14px] text-[var(--sd-ink-faint)]">
            how you do one thing is how you do everything. love what you do.
          </p>
          <p className="text-[14px] text-[var(--sd-ink-faint)]">
            Made with{" "}
            <span
              aria-label="love"
              style={{ color: "var(--sd-accent)" }}
              className="align-middle"
            >
              ♥
            </span>{" "}
            by{" "}
            <a
              href="https://filippofonseca.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--sd-ink-faint)] decoration-1 underline-offset-[3px] transition-colors hover:text-[var(--sd-accent)] hover:decoration-[var(--sd-accent)]"
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
