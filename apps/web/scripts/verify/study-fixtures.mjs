/**
 * Study Review fixtures for the verification harness. Issue #400.
 *
 * Sibling of u9-fixtures.mjs / u11-fixtures.mjs, and the same contract: build a
 * deterministic world for one feature's specs to assert against.
 *
 * DESTRUCTIVE AND IDEMPOTENT BY DESIGN. It deletes every study row for the
 * harness user and rebuilds from scratch, because the study specs mutate the
 * very state they assert on — logging a review reschedules the topic it just
 * ranked. Without a reset before each run, the second run sees a rail the first
 * run rearranged and the ordering assertions fail for the wrong reason.
 *
 * Takes `dbUrl` rather than importing `env.mjs`: Playwright compiles specs to
 * CJS, and `env.mjs` uses `import.meta`, so importing it from a spec throws at
 * load. The local-only guard that `supabaseEnv()` would have applied is
 * reproduced below, because everything here is destructive.
 */
import postgres from "postgres";

const DAY_MS = 86_400_000;

const DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const dayISO = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);

/** Two classes so the rail's class filter and per-project tinting are exercised. */
const CLASSES = [
  { code: "EENG 202", name: "Signals and Systems" },
  { code: "MENG 280", name: "Thermodynamics" },
];

export async function seedStudyFixtures(userId, dbUrl) {
  const url = dbUrl ?? process.env.VERIFY_DATABASE_URL ?? DEFAULT_DB_URL;
  // Hard stop: every write below is destructive fixture seeding, so pointing it
  // at a real project would delete a real person's study history.
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(`refusing to seed study fixtures against a non-local database: ${url}`);
  }
  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    const [area] = await sql`select id from areas where user_id=${userId} order by created_at limit 1`;
    if (!area) throw new Error("no area for the harness user — run the base seed first");

    // Full reset. Plan items, reviews and coverage all cascade from topics.
    await sql`delete from study_topics where user_id=${userId}`;
    await sql`delete from study_assessments where user_id=${userId}`;

    const cls = {};
    for (const c of CLASSES) {
      const existing = await sql`
        select id from projects where user_id=${userId} and course_code=${c.code} limit 1`;
      if (existing.length) {
        cls[c.code] = existing[0].id;
        continue;
      }
      const [p] = await sql`
        insert into projects (user_id, area_id, name, is_class, course_code, course_title,
                              instructor, credits, semester_term, semester_year)
        values (${userId}, ${area.id}, ${c.name}, true, ${c.code}, ${c.name},
                'Prof. Whitfield', 4, 'fall', 2026)
        returning id`;
      cls[c.code] = p.id;
    }

    let order = 0;
    const mk = async (projectId, title, weight, parentId) => {
      const [t] = await sql`
        insert into study_topics (user_id, project_id, parent_id, title, weight, order_index)
        values (${userId}, ${projectId}, ${parentId}, ${title}, ${weight}, ${order++})
        returning id`;
      return t.id;
    };

    const S = cls["EENG 202"];
    const T = cls["MENG 280"];

    const uLaplace = await mk(S, "Laplace transforms", "core", null);
    const roc = await mk(S, "Region of convergence", "fluent", uLaplace);
    const inverse = await mk(S, "Inverse transforms", "core", uLaplace);
    const uFreq = await mk(S, "Frequency response", "core", null);
    const bode = await mk(S, "Bode plots", "core", uFreq);
    const nyquist = await mk(S, "Nyquist criterion", "fluent", uFreq);
    const convolution = await mk(S, "Convolution", "working", null);
    const sampling = await mk(S, "Sampling and aliasing", "familiar", null);
    const ztransform = await mk(S, "Z-transform basics", "skim", null);
    const firstLaw = await mk(T, "First law, closed systems", "core", null);
    const entropy = await mk(T, "Entropy and the second law", "core", null);
    const rankine = await mk(T, "Rankine cycle", "working", null);
    const psychro = await mk(T, "Psychrometrics", "skim", null);

    const [midterm] = await sql`
      insert into study_assessments (user_id, project_id, title, kind, due_date, weight_pct)
      values (${userId}, ${S}, 'Midterm 2', 'midterm', ${dayISO(9)}, 30) returning id`;
    const [quiz] = await sql`
      insert into study_assessments (user_id, project_id, title, kind, due_date, weight_pct)
      values (${userId}, ${T}, 'Quiz 4', 'quiz', ${dayISO(4)}, 10) returning id`;

    const cover = async (assessmentId, ids) => {
      for (const topicId of ids) {
        await sql`
          insert into study_assessment_topics (assessment_id, topic_id, user_id)
          values (${assessmentId}, ${topicId}, ${userId}) on conflict do nothing`;
      }
    };
    await cover(midterm.id, [uLaplace, roc, inverse, uFreq, bode, nyquist, convolution, sampling]);
    await cover(quiz.id, [firstLaw, entropy, rankine]);

    // Memory state spanning the full range the rail has to render: cold, fading,
    // consolidating, fresh, and never-touched. [id, stability, daysAgo, lapses,
    // difficulty, status]
    const memory = [
      [bode, 3.2, 28, 2, 6.8, "learning"],
      [inverse, 4.0, 21, 1, 7.2, "learning"],
      [entropy, 6.0, 14, 0, 5.4, "learning"],
      [convolution, 12.0, 9, 0, 4.6, "consolidating"],
      [roc, 20.0, 6, 0, 4.0, "consolidating"],
      [firstLaw, 30.0, 3, 0, 3.6, "exam_ready"],
      [nyquist, 45.0, 1, 0, 3.2, "exam_ready"],
      [psychro, 8.0, 30, 0, 5.0, "learning"],
    ];
    for (const [id, stability, ago, lapses, difficulty, status] of memory) {
      await sql`
        update study_topics set
          stability=${stability}, difficulty=${difficulty},
          last_reviewed_at=${daysAgo(ago)}, next_due_at=${daysAgo(ago - stability)},
          reps=${Math.max(1, 6 - lapses)}, lapses=${lapses}, status=${status}
        where id=${id}`;
    }
    // uLaplace, uFreq, sampling, ztransform, rankine stay unstudied on purpose:
    // never-reviewed topics are the ones the priority model floors to the top.

    // A plan with one deliberately blocked day (all three from one unit) so the
    // interleaving nudge has something to fire on.
    const plan = [
      [bode, 0, midterm.id],
      [entropy, 0, quiz.id],
      [firstLaw, 0, quiz.id],
      [inverse, 1, midterm.id],
      [roc, 1, midterm.id],
      [uLaplace, 1, midterm.id],
      [convolution, 2, midterm.id],
      [rankine, 3, quiz.id],
      [nyquist, 5, midterm.id],
      [sampling, 6, midterm.id],
    ];
    for (const [topicId, offset, assessmentId] of plan) {
      await sql`
        insert into study_plan_items (user_id, topic_id, plan_date, assessment_id, order_index)
        values (${userId}, ${topicId}, ${dayISO(offset)}, ${assessmentId}, 0)
        on conflict do nothing`;
    }
    await sql`
      update study_plan_items set status='done', completed_at=now()
      where user_id=${userId} and topic_id=${firstLaw} and plan_date=${dayISO(0)}`;

    // Reviews carry an XP trigger; clear them so a rerun does not pile up XP.
    await sql`delete from xp_events where user_id=${userId} and kind='study.review'`;

    return { classes: cls, topics: { bode, inverse, entropy, uLaplace }, midterm: midterm.id };
  } finally {
    await sql.end();
  }
}
