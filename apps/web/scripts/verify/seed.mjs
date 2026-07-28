#!/usr/bin/env node
/**
 * Seed the local Supabase stack with the verify harness's test account and a
 * small amount of realistic fixture data.
 *
 * WHY THIS EXISTS
 *
 * The app authenticates with Google OAuth, which cannot run headless, so three
 * wave-1 units could only argue their acceptance criteria at code level. This
 * script creates a local-only email/password account through the Supabase admin
 * API so a browser can actually sign in. It is local-only by construction:
 * `supabaseEnv()` refuses to run against anything but 127.0.0.1, and nothing in
 * the application is modified to allow it. Production still has exactly one
 * sign-in path.
 *
 * IDEMPOTENT. Every fixture row has a UUID derived deterministically from its
 * name, so a second run updates the same rows instead of duplicating them.
 *
 * Usage: node scripts/verify/seed.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import {
  CREDENTIALS_PATH,
  TEST_EMAIL,
  ensureVerifyDir,
  log,
  supabaseEnv,
} from "./env.mjs";

/** RFC 4122 v5 UUID, so fixture ids are stable across runs without a registry. */
const NAMESPACE = "6f2a1c4e-9d3b-4a71-8e5f-2c7b1d0a9e34";
function uuidv5(name) {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(Buffer.from(name, "utf8")).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
const id = (name) => uuidv5(`verify-harness:${name}`);

/**
 * The fixture password is generated on first run and kept in the gitignored
 * .verify/ directory. It is never committed and never leaves this machine.
 */
function loadOrCreateCredentials() {
  ensureVerifyDir();
  if (existsSync(CREDENTIALS_PATH)) {
    const saved = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8"));
    if (saved.email === TEST_EMAIL && saved.password) return saved;
  }
  const creds = { email: TEST_EMAIL, password: randomBytes(24).toString("base64url") };
  writeFileSync(CREDENTIALS_PATH, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
  log(`generated a new fixture password at ${CREDENTIALS_PATH} (gitignored)`);
  return creds;
}

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function ensureAuthUser(admin, creds) {
  // listUsers is paginated; the local stack has a handful of rows so one page
  // is enough, and filtering by email keeps this independent of page size.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === creds.email.toLowerCase());

  if (existing) {
    // Reset the password to the one we hold, so a .verify/ directory that was
    // wiped (or a user created by an earlier run) still yields a working login.
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: creds.password,
      email_confirm: true,
    });
    if (error) throw error;
    log(`reused auth user ${existing.id}`);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: creds.email,
    password: creds.password,
    email_confirm: true,
    user_metadata: { full_name: "Verify Harness", name: "Verify Harness" },
  });
  if (error) throw error;
  log(`created auth user ${data.user.id}`);
  return data.user.id;
}

async function seedFixtures(sql, userId) {
  // public.users — migration 0002's trigger normally provisions this row at
  // sign-up. Upsert anyway so the harness does not depend on the trigger, and
  // set onboarded_at: requireOnboarded() bounces a null to /onboarding, which
  // would look exactly like an auth failure to the Tester.
  await sql`
    insert into users (id, email, display_name, onboarded_at, graduation_year, timezone)
    values (${userId}, ${TEST_EMAIL}, 'Verify Harness', now(), 2027, 'America/New_York')
    on conflict (id) do update set
      display_name = excluded.display_name,
      onboarded_at = coalesce(users.onboarded_at, excluded.onboarded_at),
      graduation_year = coalesce(users.graduation_year, excluded.graduation_year),
      timezone = coalesce(users.timezone, excluded.timezone)
  `;

  const areaId = id("area:academics");
  await sql`
    insert into areas (id, user_id, name, emoji, order_index)
    values (${areaId}, ${userId}, 'Academics', '📚', 0)
    on conflict (id) do update set name = excluded.name, emoji = excluded.emoji
  `;

  const projectId = id("project:thermodynamics");
  await sql`
    insert into projects (id, user_id, area_id, name, description, is_class, course_code, course_title, instructor, order_index)
    values (${projectId}, ${userId}, ${areaId}, 'Thermodynamics', 'Problem sets, notes and the final project.', true, 'MENG 211', 'Thermodynamics', 'Prof. Ramirez', 0)
    on conflict (id) do update set name = excluded.name, description = excluded.description
  `;

  // "lesno" is this codebase's preserved literal for done (HANDOFF.md §18); the
  // task_status enum has no "done" member. Priorities include "P∞".
  //
  // At least one task is due TODAY on purpose. /tasks defaults to a day-scoped
  // kanban, so fixtures dated only in the future render an empty board that
  // looks identical to a broken query.
  const taskRows = [
    ["task:pset-7", "Finish problem set 7", "Sections 4.2 through 4.6.", "P1", "in progress", isoDaysFromNow(0), 0],
    ["task:calibration", "Redo the calibration run", null, "P2", "not started", isoDaysFromNow(0), 1],
    ["task:reading", "Read Callen chapter 3", null, "P2", "up next", isoDaysFromNow(3), 1],
    ["task:lab-writeup", "Write up the calorimetry lab", "Include the error analysis.", "P2", "not started", isoDaysFromNow(5), 2],
    ["task:office-hours", "Ask about entropy problem in office hours", null, "P3", "not started", null, 3],
    ["task:final-project", "Scope the final project", "Pick a system worth modelling.", "P∞", "almost done", isoDaysFromNow(9), 4],
    ["task:submit", "Submit the midterm reflection", null, "P1", "lesno", isoDaysFromNow(-2), 5],
  ];
  for (const [key, title, notes, priority, status, dueDate, pos] of taskRows) {
    await sql`
      insert into tasks (id, user_id, title, notes, priority, status, due_date, kanban_position, completed_at)
      values (${id(key)}, ${userId}, ${title}, ${notes}, ${priority}::priority, ${status}::task_status,
              ${dueDate}::date, ${pos}, ${status === "lesno" ? sql`now()` : null})
      on conflict (id) do update set
        title = excluded.title, notes = excluded.notes, priority = excluded.priority,
        status = excluded.status, due_date = excluded.due_date, kanban_position = excluded.kanban_position
    `;
  }

  const folderId = id("folder:course-notes");
  await sql`
    insert into page_folders (id, user_id, parent_id, name, order_index, position_key)
    values (${folderId}, ${userId}, null, 'Course notes', 0, 'a0')
    on conflict (id) do update set name = excluded.name
  `;
  const subFolderId = id("folder:thermo");
  await sql`
    insert into page_folders (id, user_id, parent_id, name, order_index, position_key)
    values (${subFolderId}, ${userId}, ${folderId}, 'Thermodynamics', 0, 'a0')
    on conflict (id) do update set name = excluded.name, parent_id = excluded.parent_id
  `;
  // Link the folder to the project, exercising the folder_projects join the
  // wiki explorer reads. Composite key is (folder_id, project_id) in practice.
  await sql`
    insert into folder_projects (id, folder_id, project_id, user_id)
    values (${id("folder-project:thermo")}, ${subFolderId}, ${projectId}, ${userId})
    on conflict (id) do nothing
  `;

  const pageRows = [
    ["page:first-law", "The first law", subFolderId, "# The first law\n\nEnergy is conserved. The internal energy of a closed system changes only by heat added and work done.\n\n- dU = δQ − δW\n- Sign conventions matter more than the algebra does.\n", "🔥", "a0"],
    ["page:entropy", "Entropy and the second law", subFolderId, "# Entropy and the second law\n\nEntropy of an isolated system never decreases. The interesting part is what that rules out.\n", "🌀", "a1"],
    ["page:lab-notes", "Calorimetry lab notes", subFolderId, "# Calorimetry lab notes\n\nRaw measurements, the calibration constant, and the error budget.\n", "🧪", "a2"],
    ["page:reading-list", "Reading list", folderId, "# Reading list\n\nCallen, Schroeder, and the two papers from week four.\n", "📖", "a1"],
  ];
  for (const [key, title, folder, content, emoji, positionKey] of pageRows) {
    await sql`
      insert into pages (id, user_id, title, content, emoji, folder_id, position_key)
      values (${id(key)}, ${userId}, ${title}, ${content}, ${emoji}, ${folder}, ${positionKey})
      on conflict (id) do update set
        title = excluded.title, content = excluded.content,
        emoji = excluded.emoji, folder_id = excluded.folder_id
    `;
  }

  // Today's Daily Page. This one is not cosmetic: components/shell/DailyAutoOpen
  // is mounted app-wide and, when today's Daily Page does NOT exist, it creates
  // one and router.push()es to /wiki/<id> FROM ANY ROUTE. A browser opening
  // /tasks therefore lands on the wiki instead, which reads like a routing bug
  // and would fail every Tester assertion on the first run of each day. Once the
  // page exists the component leaves you where you are, so seeding it is the fix
  // and no application code has to change. Keyed by date, so a run tomorrow
  // seeds tomorrow's.
  const todayIso = isoDaysFromNow(0);
  const todayTitle = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${todayIso}T00:00:00Z`));
  // A partial unique index enforces one Daily Page per user per day, and the
  // app may already have created today's (DailyAutoOpen does exactly that). So
  // this is a guarded insert rather than an ON CONFLICT on the primary key:
  // the row that matters is "a daily page for today", whichever id it carries.
  await sql`
    insert into pages (id, user_id, title, content, daily_date)
    select ${id(`page:daily:${todayIso}`)}, ${userId}, ${todayTitle},
           ${"Seeded by the verification harness so DailyAutoOpen does not hijack navigation.\n"},
           ${todayIso}::date
    where not exists (
      select 1 from pages where user_id = ${userId} and daily_date = ${todayIso}::date
    )
  `;

  const habitRows = [
    ["habit:read", "Read for 30 minutes", "Anything that is not a problem set.", "📕", 0],
    ["habit:run", "Run", "Easy pace unless it is a workout day.", "🏃", 1],
    ["habit:journal", "Journal", null, "✍️", 2],
  ];
  for (const [key, name, description, icon, order] of habitRows) {
    await sql`
      insert into habits (id, user_id, name, description, icon, order_index)
      values (${id(key)}, ${userId}, ${name}, ${description}, ${icon}, ${order})
      on conflict (id) do update set
        name = excluded.name, description = excluded.description, icon = excluded.icon
    `;
  }
  // A few completions so the habits grid is not a blank slate.
  for (const [habitKey, dayOffset] of [
    ["habit:read", 0],
    ["habit:read", -1],
    ["habit:read", -2],
    ["habit:run", -1],
    ["habit:journal", 0],
  ]) {
    await sql`
      insert into habit_completions (id, habit_id, user_id, completed_date, status)
      values (${id(`completion:${habitKey}:${dayOffset}`)}, ${id(habitKey)}, ${userId},
              ${isoDaysFromNow(dayOffset)}::date, 'done')
      on conflict (id) do nothing
    `;
  }

  const captureRows = [
    ["capture:idea", "Idea: plot the Carnot efficiency against reservoir ratio for the writeup."],
    ["capture:quote", "\"Thermodynamics is a funny subject.\" — Arnold Sommerfeld"],
    ["capture:todo", "Email the TA about the regrade window."],
  ];
  for (const [key, content] of captureRows) {
    await sql`
      insert into captures (id, user_id, content)
      values (${id(key)}, ${userId}, ${content})
      on conflict (id) do update set content = excluded.content
    `;
  }

  log(
    `seeded fixtures: 1 area, 1 project, ${taskRows.length} tasks, 2 wiki folders, ` +
      `${pageRows.length} pages, ${habitRows.length} habits, ${captureRows.length} captures`,
  );
}

export async function seed() {
  const env = supabaseEnv();
  const creds = loadOrCreateCredentials();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userId = await ensureAuthUser(admin, creds);

  const sql = postgres(env.dbUrl, { prepare: false, max: 1 });
  try {
    await seedFixtures(sql, userId);
  } finally {
    await sql.end();
  }
  return { userId, ...creds };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await seed();
  log(`ready: ${result.email} (${result.userId})`);
}
