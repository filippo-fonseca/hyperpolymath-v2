"use client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="POST">
      <Button type="submit" variant="outline" size="sm">Sign out</Button>
    </form>
  );
}
