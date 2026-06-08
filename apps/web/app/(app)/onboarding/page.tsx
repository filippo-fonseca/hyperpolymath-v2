import { redirect } from "next/navigation";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { getOnboardingInitialValues } from "@/app/(app)/onboarding/actions";
import { OnboardingFlow } from "@/components/onboarding-flow";

export default async function OnboardingPage() {
  const user = await getUserOrRedirect();
  if (user.onboardedAt) redirect("/today");

  // Prefer the user's previously-typed displayName if they bounced mid-flow;
  // otherwise fall back to whatever Google OAuth gave us.
  const initial = await getOnboardingInitialValues();
  const initialDisplayName = user.displayName ?? initial.displayName;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <OnboardingFlow
        initialDisplayName={initialDisplayName}
        email={user.email}
      />
    </main>
  );
}
