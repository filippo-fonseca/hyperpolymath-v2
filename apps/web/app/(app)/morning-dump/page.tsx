import { MorningDump } from "@/components/jarvis/MorningDump";
import { requireOnboarded } from "@/lib/auth/get-user";

/**
 * /morning-dump — dedicated daily-planning surface (issues #32/#33).
 *
 * Server Component shell that gates on onboarding, then mounts the MorningDump
 * client island. The island handles the dump → parse → review → commit flow
 * against /api/jarvis/morning-dump. No console/undo coupling.
 */
export default async function MorningDumpPage() {
  await requireOnboarded();
  return <MorningDump />;
}
