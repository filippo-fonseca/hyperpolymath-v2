import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// CRITICAL: prepare:false for Supavisor transaction-mode pooler
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client);
