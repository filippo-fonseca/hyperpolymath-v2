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

  // No bare full-bleed centering — the page renders inside (app)/layout's
  // AppShell, so the sidebar is visible and the canvas/ink tokens already
  // match the rest of the app. We just pad like any other page and pin
  // content to a comfortable reading width near the top.
  return (
    <div className="flex justify-center px-6 pt-20 pb-16">
      <OnboardingFlow
        initialDisplayName={initialDisplayName}
        email={user.email}
      />
    </div>
  );
}
