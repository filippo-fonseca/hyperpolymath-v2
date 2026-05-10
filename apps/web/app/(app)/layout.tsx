import { getUserOrRedirect } from "@/lib/auth/get-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Single AUTH-03 gate: validates session via getClaims; redirects unauthenticated to /sign-in.
  // Per-page calls to requireOnboarded() handle the onboarding redirect downstream
  // (this layout itself doesn't enforce onboarded — /onboarding sits inside (app) too).
  await getUserOrRedirect();
  return <>{children}</>;
}
