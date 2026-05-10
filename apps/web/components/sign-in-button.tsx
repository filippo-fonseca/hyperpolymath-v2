"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignInButton() {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      console.error("Sign-in failed:", error);
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleSignIn} disabled={loading} size="lg" className="w-full">
      {loading ? "Redirecting..." : "Sign in with Google"}
    </Button>
  );
}
