"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Official Google "G" mark. Multi-color SVG (the only Google-approved way
 * to render the logo on a Sign-in-with-Google button). Inline so we don't
 * have to ship another image asset.
 */
function GoogleGMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.997 10.997 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.12A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.45.34-2.12V7.04H2.18A10.997 10.997 0 0 0 1 12c0 1.77.42 3.45 1.18 4.96l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function SignInButton({
  className,
}: {
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      console.error("Sign-in failed:", error);
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={loading}
      className={cn(
        "group inline-flex w-full items-center justify-center gap-3",
        "h-12 px-5 rounded-lg",
 "font-serif text-body tracking-tight text-[var(--ink)]",
        "bg-[var(--surface)] border border-[var(--edge)]",
        "shadow-[0_1px_0_color-mix(in_oklch,var(--ink)_4%,transparent),0_2px_8px_color-mix(in_oklch,var(--ink)_6%,transparent)]",
        "hover:bg-[var(--surface-raised)] hover:border-[color-mix(in_oklch,var(--ink)_18%,var(--edge))]",
        "active:translate-y-px",
        "transition-[background-color,border-color,transform,box-shadow] duration-150 ease-out",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        className,
      )}
      aria-label="Continue with Google"
    >
      <GoogleGMark size={18} />
      <span>{loading ? "Redirecting…" : "Continue with Google"}</span>
    </button>
  );
}
