// Reset the "Run" fixture habit to unchecked for today (verification re-runs).
import postgres from "postgres";
import { supabaseEnv } from "./env.mjs";

const sql = postgres(supabaseEnv().dbUrl, { prepare: false, max: 1 });
const d = new Date();
const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const gone = await sql`
  delete from habit_completions using habits
  where habit_completions.habit_id = habits.id
    and habits.name = 'Run'
    and habit_completions.completed_date = ${iso}::date
  returning habit_completions.id`;
console.log("deleted", gone.length, "completion(s) for Run on", iso);
await sql.end();
