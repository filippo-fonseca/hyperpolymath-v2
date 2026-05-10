import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/get-user";
import { Card } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings-form";
import { SignOutButton } from "@/components/sign-out-button";

export default async function SettingsPage() {
  const user = await requireOnboarded();

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-4xl font-serif">Settings</h1>
          <Link href="/today" className="underline text-sm">Back to today</Link>
        </header>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-medium">Account</h2>
          <p className="text-sm text-neutral-600">{user.email}</p>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-medium">Graduation year</h2>
          <SettingsForm currentYear={user.graduationYear ?? new Date().getFullYear() + 4} />
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-medium">Sign out</h2>
          <SignOutButton />
        </Card>
      </div>
    </main>
  );
}
