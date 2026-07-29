// u11 verification fixtures: shape habit data for acceptance-criteria checks.
// Local stack only; reuses the harness env guard so it can never touch prod.
import postgres from "postgres";
import { supabaseEnv } from "./env.mjs";

const env = supabaseEnv();
const sql = postgres(env.dbUrl, { prepare: false, max: 1 });

const localISO = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const [{ id: userId }] = await sql`
  select id from auth.users where email = 'verify-harness@hyperpolymath.test'
`;

// 1. Backdate every fixture habit so creation date never truncates a streak.
await sql`
  update habits set created_at = now() - interval '400 days'
  where user_id = ${userId}
`;

// 2. Give "Read for 30 minutes" a 20-day unbroken run ending yesterday
//    (today's completion already exists from the seed → current = 21).
const [read] = await sql`
  select id from habits where user_id = ${userId} and name = 'Read for 30 minutes'
`;
for (let off = -1; off >= -20; off--) {
  await sql`
    insert into habit_completions (id, habit_id, user_id, completed_date, status)
    values (gen_random_uuid(), ${read.id}, ${userId}, ${localISO(off)}::date, 'done')
    on conflict do nothing
  `;
}

// 3. A habit scheduled ONLY tomorrow: must never appear today, anywhere.
const todayDow = new Date().getDay();
const days = Array(7).fill(false);
days[(todayDow + 1) % 7] = true;
await sql`
  insert into habits (id, user_id, name, description, icon, order_index, days_of_week, created_at)
  values ('a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5', ${userId}, 'Tomorrow-only drill', 'Scheduled tomorrow, must not render today.', '🎯', 9, ${sql.array(days)}::boolean[], now() - interval '400 days')
  on conflict (id) do update set days_of_week = excluded.days_of_week, created_at = excluded.created_at
`;

// 3b. Drop any probe habit left behind by an interrupted verify run.
await sql`
  delete from habit_completions using habits
  where habit_completions.habit_id = habits.id and habits.name = 'U11 probe habit'
`;
await sql`delete from habits where user_id = ${userId} and name = 'U11 probe habit'`;

// 4. Canonical start state for today, self-healing across re-runs (and
//    resilient to the seed's UTC-midnight skew after 18:00 local):
//    no future-dated rows; Read and Journal done today; Run not done.
await sql`
  delete from habit_completions
  where user_id = ${userId} and completed_date > ${localISO(0)}::date
`;
for (const name of ["Read for 30 minutes", "Journal"]) {
  await sql`
    insert into habit_completions (id, habit_id, user_id, completed_date, status)
    select gen_random_uuid(), id, ${userId}, ${localISO(0)}::date, 'done'
    from habits where user_id = ${userId} and name = ${name}
    on conflict do nothing
  `;
}
await sql`
  delete from habit_completions using habits
  where habit_completions.habit_id = habits.id
    and habits.name = 'Run'
    and habit_completions.completed_date = ${localISO(0)}::date
`;

const rows = await sql`
  select h.name, h.days_of_week, count(c.id) as completions
  from habits h left join habit_completions c on c.habit_id = h.id
  where h.user_id = ${userId} group by h.id, h.name, h.days_of_week order by h.name
`;
console.log(JSON.stringify({ today: localISO(0), rows }, null, 2));
await sql.end();
