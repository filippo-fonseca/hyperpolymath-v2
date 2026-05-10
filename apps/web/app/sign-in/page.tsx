import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInButton } from "@/components/sign-in-button";

export default async function SignInPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/today");

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-10">
        <h1 className="text-6xl font-serif tracking-tight">Hyperpolymath</h1>
        <SignInButton />
        <p className="text-sm italic text-neutral-600">I brought back the Renaissance.</p>
      </div>
    </main>
  );
}
