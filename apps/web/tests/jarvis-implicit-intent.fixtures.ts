/**
 * Phase 5.1 (D-P4 / JARVIS-22) — Implicit-intent test corpus.
 *
 * 20 paired fixtures pairing fragmented and explicit phrasings of the same
 * intent. The model must produce structurally-equivalent action sets for both
 * phrasings — same tool names, same key fields populated, dates within ±1 day.
 *
 * Source: RESEARCH §K 20-fixture table (verbatim). keyFields use RegExp for
 * semantic equivalence (title patterns) and string literals for exact fields
 * (priority, due dates).
 */

export interface ImplicitIntentFixture {
  description: string;
  fragmented: string;
  explicit: string;
  expectedTools: Array<{
    name: "create_task" | "create_capture" | "create_event";
    keyFields: Record<string, string | RegExp>;
  }>;
}

export const IMPLICIT_INTENT_FIXTURES: ImplicitIntentFixture[] = [
  {
    description: "dinner + groceries reminder",
    fragmented: "dinner 8pm with sam. need to pick up groceries friday.",
    explicit: "Schedule a lunch with Sam at 8pm Saturday and remind me to pick up groceries Friday",
    expectedTools: [
      { name: "create_event", keyFields: { title: /sam|dinner/i } },
      { name: "create_task", keyFields: { title: /flower/i } },
    ],
  },
  {
    description: "gym + standup",
    fragmented: "tmrw 6am gym + standup 10",
    explicit: "Remind me gym tomorrow 6am and put standup at 10am",
    expectedTools: [
      { name: "create_event", keyFields: { title: /gym/i } },
      { name: "create_event", keyFields: { title: /standup/i } },
    ],
  },
  {
    description: "sam birthday next week",
    fragmented: "sam birthday next week",
    explicit: "Create a task to plan for Sam's birthday next week",
    expectedTools: [{ name: "create_task", keyFields: { title: /sam|birthday/i } }],
  },
  {
    description: "groceries tonight",
    fragmented: "groceries. eggs milk bread. tonight",
    explicit: "Add a task to get groceries tonight — eggs, milk, bread",
    expectedTools: [{ name: "create_task", keyFields: { title: /groceries/i } }],
  },
  {
    description: "p1 call mom",
    fragmented: "call mom p1",
    explicit: "Add a high priority task to call mom",
    expectedTools: [{ name: "create_task", keyFields: { title: /call mom/i, priority: "P1" } }],
  },
  {
    description: "midterm with project",
    fragmented: "midterm $chem thursday 9am",
    explicit: "Schedule my chemistry midterm on Thursday at 9am",
    expectedTools: [{ name: "create_event", keyFields: { title: /midterm|chem/i } }],
  },
  {
    description: "fatigue capture",
    fragmented: "tired. need sleep. felt off today.",
    explicit: "I'm tired and need sleep, felt off today",
    expectedTools: [{ name: "create_capture", keyFields: { content: /tired/i } }],
  },
  {
    description: "dentist + xray reminder",
    fragmented: "10am dentist. bring xrays.",
    explicit: "Dentist appointment at 10am, remember to bring x-rays",
    expectedTools: [
      { name: "create_event", keyFields: { title: /dentist/i } },
      { name: "create_task", keyFields: { title: /xray|x-ray/i } },
    ],
  },
  {
    description: "p1 review pr by eod",
    fragmented: "p1 review pr by eod",
    explicit: "High priority task to review the PR by end of day",
    expectedTools: [{ name: "create_task", keyFields: { title: /review pr/i, priority: "P1" } }],
  },
  {
    description: "sam lunch + groceries thurs",
    fragmented: "sam lunch fri 7 + groceries reminder thurs",
    explicit: "Schedule lunch with Sam on Friday at 7pm, add task to get groceries Thursday",
    expectedTools: [
      { name: "create_event", keyFields: { title: /sam|dinner/i } },
      { name: "create_task", keyFields: { title: /flower/i } },
    ],
  },
  {
    description: "gym mwf 7am",
    fragmented: "gym monday wednesday friday 7am",
    explicit: "Add three gym events: Monday, Wednesday, Friday at 7am",
    expectedTools: [
      { name: "create_event", keyFields: { title: /gym/i } },
      { name: "create_event", keyFields: { title: /gym/i } },
      { name: "create_event", keyFields: { title: /gym/i } },
    ],
  },
  {
    description: "reading hw $cs",
    fragmented: "reading $cs hw due next tues",
    explicit: "Add a task for CS homework: do the readings, due next Tuesday",
    expectedTools: [{ name: "create_task", keyFields: { title: /reading|cs|hw/i } }],
  },
  {
    description: "sam sat clean apt",
    fragmented: "sam coming over saturday. clean apt.",
    explicit: "Put Sam visiting on Saturday on calendar and add task to clean apartment",
    expectedTools: [
      { name: "create_event", keyFields: { title: /sam/i } },
      { name: "create_task", keyFields: { title: /clean/i } },
    ],
  },
  {
    description: "flight + checkin",
    fragmented: "flight 6am tuesday LAX. check in monday.",
    explicit: "Flight at 6am Tuesday from LAX, task to check in Monday",
    expectedTools: [
      { name: "create_event", keyFields: { title: /flight|lax/i } },
      { name: "create_task", keyFields: { title: /check.?in/i } },
    ],
  },
  {
    description: "thesis outline p∞",
    fragmented: "thesis outline. overdue. p∞",
    explicit: "Top priority overdue task: write thesis outline",
    expectedTools: [{ name: "create_task", keyFields: { title: /thesis.?outline/i, priority: "P∞" } }],
  },
  {
    description: "coffee + confirm",
    fragmented: "coffee w/ sarah. 2pm thurs. confirm tomorrow",
    explicit: "Coffee with Sarah Thursday 2pm, task to confirm tomorrow",
    expectedTools: [
      { name: "create_event", keyFields: { title: /coffee|sarah/i } },
      { name: "create_task", keyFields: { title: /confirm/i } },
    ],
  },
  {
    description: "random thought capture",
    fragmented: "random thought: maybe learn piano",
    explicit: "I had a random thought: maybe I should learn piano",
    expectedTools: [{ name: "create_capture", keyFields: { content: /piano/i } }],
  },
  {
    description: "standup daily",
    fragmented: "standup daily 10am",
    explicit: "Add a standup event at 10am every day",
    expectedTools: [{ name: "create_event", keyFields: { title: /standup/i } }],
  },
  {
    description: "login bug p2 $auth",
    fragmented: "fix login bug. p2. $auth.",
    explicit: "P2 task: fix the login bug, link to auth project",
    expectedTools: [{ name: "create_task", keyFields: { title: /login.?bug/i, priority: "P2" } }],
  },
  {
    description: "sam gift march 15",
    fragmented: "birthday gift sam march 15",
    explicit: "Add a task to get a birthday gift for Sam before March 15",
    expectedTools: [{ name: "create_task", keyFields: { title: /gift|sam/i } }],
  },
];
