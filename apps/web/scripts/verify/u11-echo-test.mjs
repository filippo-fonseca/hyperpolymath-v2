// Does a habit_completions INSERT actually reach a subscribed realtime client?
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { supabaseEnv } from "./env.mjs";

const env = supabaseEnv();
const anon = env.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const tok = process.env.ECHO_TOKEN === "anon" ? anon : readFileSync("/tmp/u11-user-token.txt", "utf8");
const uid = "21427860-12ae-4b46-85cb-723d1db90779";

const wsUrl = `${env.url.replace("http", "ws")}/realtime/v1/websocket?apikey=${anon}&vsn=2.0.0`;
const ws = new WebSocket(wsUrl);
let subscribed = false;

ws.onopen = () => {
  ws.send(
    JSON.stringify([
      "1",
      "1",
      `realtime:rt:habit_completions:${uid}`,
      "phx_join",
      {
        config: {
          broadcast: { ack: false, self: false },
          presence: { key: "", enabled: false },
          postgres_changes: [
            { event: "*", schema: "public", table: "habit_completions", filter: `user_id=eq.${uid}` },
          ],
          private: false,
        },
        access_token: tok,
      },
    ])
  );
};
ws.onmessage = async (m) => {
  const s = String(m.data);
  if (s.includes("Subscribed to PostgreSQL") && !subscribed) {
    subscribed = true;
    console.log("subscribed; inserting a row via SQL...");
    const sql = postgres(env.dbUrl, { prepare: false, max: 1 });
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await sql`
      insert into habit_completions (id, habit_id, user_id, completed_date, status)
      select gen_random_uuid(), id, ${uid}, ${iso}::date, 'done' from habits where name = 'Run'
      on conflict do nothing`;
    await sql.end();
    console.log("inserted; waiting for postgres_changes event...");
    setTimeout(async () => {
      console.log("NO EVENT within 12s");
      const sql2 = postgres(env.dbUrl, { prepare: false, max: 1 });
      await sql2`delete from habit_completions using habits
        where habit_completions.habit_id = habits.id and habits.name = 'Run'
        and habit_completions.completed_date = ${iso}::date`;
      await sql2.end();
      process.exit(1);
    }, 12000);
  } else if (s.includes("postgres_changes") && s.includes("INSERT")) {
    console.log("EVENT RECEIVED:", s.slice(0, 200));
    const sql2 = postgres(env.dbUrl, { prepare: false, max: 1 });
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await sql2`delete from habit_completions using habits
      where habit_completions.habit_id = habits.id and habits.name = 'Run'
      and habit_completions.completed_date = ${iso}::date`;
    await sql2.end();
    console.log("cleaned up; echo path is HEALTHY");
    process.exit(0);
  }
};
ws.onclose = (e) => console.log("ws close", e.code);
setTimeout(() => {
  console.log("timeout without subscribing");
  process.exit(2);
}, 30000);
