import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient; // anon-key client signed in as this user
}

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${randomUUID()}@hyperpolymath.test`;
  const password = `Test-${randomUUID()}!`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip confirmation in local
  });
  if (createErr || !created.user) throw new Error(`createUser failed: ${createErr?.message}`);

  // Sign in with anon-key client to get a real session token
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);

  return { id: created.user.id, email, password, client: userClient };
}

export async function deleteTestUser(userId: string): Promise<void> {
  await admin.auth.admin.deleteUser(userId);
}
