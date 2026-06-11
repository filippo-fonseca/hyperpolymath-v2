import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInButton } from "@/components/sign-in-button";
import { KiwiIcon } from "@/components/shared/KiwiIcon";

export default async function SignInPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/today");

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "var(--canvas)", color: "var(--ink)" }}
    >
      {/* Eyebrow header — matches the landing chrome register. */}
      <header className="h-12 border-b border-[var(--edge)]">
        <div className="h-full max-w-[1200px] mx-auto px-6 md:px-10 flex items-center justify-between">
          <Link
            href="/"
            className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
          >
            ← HYPERPOLYMATH
          </Link>
          <span className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            EST. 2026 / MIT
          </span>
        </div>
      </header>

      <section className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[440px]">
          {/* Hero — wordmark + kiwi, like the README flyer. */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center gap-3 text-[var(--ink)]">
              <KiwiIcon size={44} aria-hidden="true" />
              <h1 className="font-serif text-[44px] leading-none font-semibold tracking-[-0.01em] m-0">
                Hyperpolymath
              </h1>
            </div>
            <p className="mt-4 font-serif text-[15px] italic text-[var(--ink-muted)]">
              A personal life-OS for people who refuse to specialize.
            </p>
          </div>

          {/* Auth card — Notion-clean surface with hairline border. */}
          <div
            className="rounded-xl p-7 space-y-5"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--edge)",
              boxShadow:
                "0 1px 0 color-mix(in oklch, var(--ink) 3%, transparent), 0 8px 32px color-mix(in oklch, var(--ink) 6%, transparent)",
            }}
          >
            <div className="space-y-1.5 text-center">
              <h2 className="font-serif text-[20px] font-semibold tracking-tight">
                Sign in to continue
              </h2>
              <p className="font-serif text-[13px] text-[var(--ink-muted)] leading-[1.55]">
                One account. One inbox. One sentence.
                <br />
                Use the Google identity tied to your Calendar.
              </p>
            </div>

            <SignInButton />

            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-center text-[var(--ink-muted)]">
              By continuing, you agree to use Hyperpolymath responsibly.
            </p>
          </div>

          {/* Closing tagline — the brand voice. */}
          <p className="mt-8 text-center font-serif italic text-[13px] text-[var(--ink-muted)]">
            &ldquo;I brought back the Renaissance.&rdquo;
          </p>
        </div>
      </section>

      <footer className="h-12 border-t border-[var(--edge)]">
        <div className="h-full max-w-[1200px] mx-auto px-6 md:px-10 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          <span>be goated. well.</span>
          <Link
            href="https://github.com/filippo-fonseca/hyperpolymath-v2"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--ink)] transition-colors"
          >
            open source · MIT
          </Link>
        </div>
      </footer>
    </main>
  );
}
