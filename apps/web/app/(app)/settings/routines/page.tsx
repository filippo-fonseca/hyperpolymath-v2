/**
 * /settings/routines → /jarvis?section=routines
 *
 * Routines authoring moved OUT of Settings and INTO the centralized JARVIS tab.
 * This stub keeps old bookmarks and any lingering deep links alive by
 * permanently redirecting into the JARVIS management hub's Routines section.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RoutinesRedirect() {
  redirect("/jarvis?section=routines");
}
