import { getUserOrRedirect } from "@/lib/auth/get-user";
import { loadStudioSeed } from "@/lib/studio/load-studio-seed";
import { StudioLoader } from "@/components/studio/StudioLoader";

/**
 * /studio — The Studio, the 3D theatre of the life-OS.
 *
 * Server Component in the authenticated `(app)` route group, so it inherits the
 * full provider stack (auth gate, QueryProvider, AppShell). The studio island
 * therefore sits INSIDE the existing QueryClient and reads the SAME shared
 * caches the 2D app uses (no parallel store).
 *
 * All SSR seeding is encapsulated in `loadStudioSeed` (parallel fetches + the
 * gcal calendar-slab read). gcal is the ONLY source of truth for events —
 * nothing is mirrored in Postgres — so this route is `force-dynamic`. All
 * three-touching code lives behind StudioLoader's ssr:false boundary; this file
 * ships zero 3D bytes.
 */

// Never cache — gcal is the source of truth (no Postgres mirror).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StudioPage() {
  const user = await getUserOrRedirect();
  const seed = await loadStudioSeed(user.id);

  return (
    <main
      className="relative min-h-full w-full overflow-hidden bg-[#120E0B]"
      style={{ height: "100%" }}
    >
      <StudioLoader userId={user.id} seed={seed} />
    </main>
  );
}
