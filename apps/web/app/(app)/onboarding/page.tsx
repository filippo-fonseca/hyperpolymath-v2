import { redirect } from "next/navigation";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  const user = await getUserOrRedirect();
  if (user.onboardedAt) redirect("/today");

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md space-y-10">
        <h1 className="text-3xl font-serif text-center">When do you graduate?</h1>
        <OnboardingForm />
      </div>
    </main>
  );
}
