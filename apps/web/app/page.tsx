import { LandingPage } from "@/components/landing/LandingPage";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

/**
 * Root route — Phase 8 (LAND-ROUTE / SC-1).
 *
 * Logged in → redirect to /today (preserves existing app-shell behavior)
 * Logged out → render <LandingPage /> (the public manifesto)
 *
 * page.tsx stays DYNAMIC (NO route-level ISR export) per RESEARCH §Pitfall 1.
 * The getClaims() cookie auth check must run per-request. ISR for the BuildLog
 * GitHub fetch lives INSIDE BuildLog via per-call fetch cache hints.
 */

export const metadata: Metadata = {
  title: "Hyperpolymath · Type one sentence.",
  description:
    "A personal life-OS for people who refuse to specialize. One inbox. One agent. One sentence.",
  openGraph: {
    title: "Hyperpolymath · Type one sentence.",
    description: "A personal life-OS for people who refuse to specialize.",
    type: "website",
    siteName: "Hyperpolymath",
    // Note: url field intentionally OMITTED until production URL is confirmed
    // by the user (see 08-RESEARCH.md Open Question 1). Next 16 emits the
    // canonical URL from the request domain automatically when url is missing.
  },
  twitter: {
    card: "summary_large_image",
    title: "Hyperpolymath · Type one sentence.",
    description: "A personal life-OS for people who refuse to specialize.",
  },
};

export default async function Root() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    redirect("/lifeos");
  }
  return <LandingPage />;
}
