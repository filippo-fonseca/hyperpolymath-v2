"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function updateGraduationYear(formData: FormData): Promise<void> {
  const yearRaw = formData.get("graduation_year");
  const year = typeof yearRaw === "string" ? parseInt(yearRaw, 10) : NaN;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Invalid graduation year: ${yearRaw}`);
  }

  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims) redirect("/sign-in");
  const userId = claimsData.claims.sub;

  await db.update(users).set({ graduationYear: year }).where(eq(users.id, userId));
  revalidatePath("/settings");
  revalidatePath("/today");
}
