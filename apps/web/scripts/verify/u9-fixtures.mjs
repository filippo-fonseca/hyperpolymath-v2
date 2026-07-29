#!/usr/bin/env node
/**
 * U9 verification fixtures, layered on top of seed.mjs's world:
 *   - "Kanban stress": a project with 60 tasks, to prove the board scrolls
 *     internally instead of colliding with the section divider.
 *   - "Empty project": zero tasks, zero captures, zero pages, to prove the
 *     empty states render (list view used to render literally nothing).
 *
 * Same deterministic-id convention as seed.mjs, so re-runs upsert. Local-only
 * by the same supabaseEnv() guard. Run after `pnpm verify:bootstrap`:
 *   node scripts/verify/u9-fixtures.mjs
 */
import { createHash } from "node:crypto";
import postgres from "postgres";
import { log, supabaseEnv, TEST_EMAIL } from "./env.mjs";

const NAMESPACE = "6f2a1c4e-9d3b-4a71-8e5f-2c7b1d0a9e34";
function uuidv5(name) {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(Buffer.from(name, "utf8")).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
const id = (name) => uuidv5(`verify-harness:${name}`);

const STATUSES = ["not started", "up next", "in progress", "almost done"];

async function main() {
  const env = supabaseEnv();
  const sql = postgres(env.dbUrl, { prepare: false, max: 1 });
  try {
    const [user] = await sql`select id from users where email = ${TEST_EMAIL} limit 1`;
    if (!user) throw new Error("run pnpm verify:bootstrap first (test user missing)");
    const userId = user.id;
    const areaId = id("area:academics");

    // seed.mjs creates the thermo tasks but never links them to the project,
    // so the project page's task slice is empty. Link them here.
    const thermoId = id("project:thermodynamics");
    const thermoTaskKeys = [
      "task:pset-7",
      "task:calibration",
      "task:reading",
      "task:lab-writeup",
      "task:office-hours",
      "task:final-project",
      "task:submit",
    ];
    for (const key of thermoTaskKeys) {
      await sql`
        insert into tasks_projects (task_id, project_id, user_id)
        select ${id(key)}, ${thermoId}, ${userId}
        where exists (select 1 from tasks where id = ${id(key)})
        on conflict (task_id, project_id) do nothing
      `;
    }

    const stressId = id("project:u9-stress");
    await sql`
      insert into projects (id, user_id, area_id, name, description, is_class, order_index)
      values (${stressId}, ${userId}, ${areaId}, 'Kanban stress', 'Sixty tasks to prove the board scrolls internally.', false, 10)
      on conflict (id) do update set name = excluded.name, description = excluded.description
    `;
    for (let i = 0; i < 60; i++) {
      const taskId = id(`task:u9-stress-${i}`);
      const status = STATUSES[i % STATUSES.length];
      await sql`
        insert into tasks (id, user_id, title, priority, status, kanban_position)
        values (${taskId}, ${userId}, ${`Stress task ${String(i + 1).padStart(2, "0")}`}, 'P3', ${status}::task_status, ${i})
        on conflict (id) do update set status = excluded.status, title = excluded.title
      `;
      await sql`
        insert into tasks_projects (task_id, project_id, user_id)
        values (${taskId}, ${stressId}, ${userId})
        on conflict (task_id, project_id) do nothing
      `;
    }

    const emptyId = id("project:u9-empty");
    await sql`
      insert into projects (id, user_id, area_id, name, is_class, order_index)
      values (${emptyId}, ${userId}, ${areaId}, 'Empty project', false, 11)
      on conflict (id) do update set name = excluded.name
    `;

    log(`u9 fixtures ready: stress=${stressId} empty=${emptyId} thermo=${id("project:thermodynamics")}`);
  } finally {
    await sql.end();
  }
}

await main();
