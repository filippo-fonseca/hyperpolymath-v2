import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/get-user";
import { Card } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";

export default async function TodayPage() {
  const user = await requireOnboarded();

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-4xl font-serif">Today</h1>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/settings" className="underline">Settings</Link>
            <SignOutButton />
          </div>
        </header>

        <Card className="p-8 text-center">
          <p className="text-neutral-600">Coming soon.</p>
          <p className="text-sm text-neutral-400 mt-2">
            Signed in as {user.email} • Class of {user.graduationYear}
          </p>
        </Card>
      </div>
    </main>
  );
}
