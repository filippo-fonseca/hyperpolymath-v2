// ActionExecutor interface — implementations live in the consumer (web app
// wires Drizzle + googleapis; future CLI wires its own executor).
//
// SECURITY (D-15 / JARVIS-12): `userId` MUST be re-derived from
// `supabase.auth.getClaims()` at the route-handler boundary. The model
// NEVER emits a userId; trusting one from the model is a vulnerability.

import type {
  ComputerUseAction,
  CreateStudyTopicsAction,
  FindStudyTopicsAction,
  LogStudyReviewAction,
  PlanStudyDayAction,
  CreateCaptureAction,
  CreateEventAction,
  CreatePersonAction,
  CreateTaskAction,
  DeleteCaptureAction,
  DeleteEventAction,
  DeleteTaskAction,
  DesktopAction,
  FindCapturesAction,
  FindEventsAction,
  FindPeopleAction,
  FindTasksAction,
  GetNewsAction,
  GetWeatherAction,
  ListLightsAction,
  ControlLightsAction,
  LinkPeopleAction,
  ReadGmailAction,
  OpenAppAction,
  OpenUrlAction,
  OpenWorkspaceAction,
  PlayMusicAction,
  PressKeyAction,
  ReadImessageAction,
  ReadWhatsappAction,
  RememberFactAction,
  RunApplescriptAction,
  RunShortcutAction,
  SendMessageAction,
  SystemControlAction,
  TakeScreenshotAction,
  TypeTextAction,
  UpdateCaptureAction,
  UpdateEventAction,
  UpdateTaskAction,
  WebSearchAction,
} from "../types";
import type { AskClarificationAction } from "../tools/ask-clarification";

export interface ExecutionContext {
  /** Re-derived from getClaims() at the boundary, NEVER trusted from model. */
  userId: string;
  /**
   * Capture provenance — where this turn originated. `device` is the paired
   * token's name ('Web' for the browser console), denormalized into created
   * rows so the record survives token deletion. Optional for back-compat.
   */
  source?: { device: string; input: "voice" | "text" };
  /** IANA timezone. */
  userTimezone: string;
  defaultCalendarId: string | null;
  /**
   * Phase 5.1 D-P2 #3 / JARVIS-21 — pre-validated project IDs from the turn
   * boundary. When present, executors short-circuit their own validateProjectIds
   * call for any project_id that is already in this set, avoiding duplicate
   * SELECTs on multi-action turns that reference the same project.
   *
   * Optional — backward-compatible. Executors MUST fall back to full validation
   * if this field is absent (e.g. tests that don't wire the route).
   */
  preValidatedProjectIds?: Set<string>;
  /**
   * Jarvis calendar routing — the writable gcal calendar ids fetched at the
   * turn boundary and shown to the model in the USER CALENDARS prompt block.
   * When present, executor.createEvent accepts exactly these ids for
   * calendar_id; an unknown id falls back to the user's default calendar
   * instead of failing the turn.
   *
   * Optional — backward-compatible. When absent (tests, legacy callers), the
   * executor keeps the strict validateCalendarId behavior (default + visible
   * list + "primary", reject otherwise).
   */
  allowedCalendarIds?: string[];
}

export type ExecutorResult =
  | {
      ok: true;
      id: string;
      receipt: Record<string, unknown>;
      /** Present on computer-control tool results (open_url/open_app/web_search).
       *  The desktop client reads this field to decide what to do on the Mac. */
      action?: DesktopAction;
    }
  | {
      ok: false;
      error: string;
      kind?: "validation" | "auth" | "network" | "revoked" | "not_found" | "not_connected" | "internal";
    };

export interface ActionExecutor {
  createTask(
    input: CreateTaskAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  createCapture(
    input: CreateCaptureAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  createEvent(
    input: CreateEventAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  /** Phase 5.1 (D-M5 / JARVIS-18): persist a user fact via onConflictDoUpdate. */
  rememberFact(
    input: RememberFactAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  /**
   * Phase 5.1 (D-A1 / JARVIS-19): ask a clarifying question. No-op on the server —
   * the question payload is streamed via event: clarification SSE BEFORE this runs.
   * Returns an ok receipt for uniform dispatch-loop handling.
   */
  askClarification(
    input: AskClarificationAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;

  // Phase 16 — CRUD update / delete / find methods.
  // Implementations land in Plan 16-03; declaring here first so Plans 16-02,
  // 16-04, and 16-05 can import against a stable interface.
  updateTask(input: UpdateTaskAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  deleteTask(input: DeleteTaskAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  updateCapture(input: UpdateCaptureAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  deleteCapture(input: DeleteCaptureAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  updateEvent(input: UpdateEventAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  deleteEvent(input: DeleteEventAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  findTasks(input: FindTasksAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  findCaptures(input: FindCapturesAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  findEvents(input: FindEventsAction, ctx: ExecutionContext): Promise<ExecutorResult>;

  // Phase D — people knowledge graph: create / find / link people.
  createPerson(input: CreatePersonAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  findPeople(input: FindPeopleAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  linkPeople(input: LinkPeopleAction, ctx: ExecutionContext): Promise<ExecutorResult>;

  // Computer-control tools — validate input server-side, return a DesktopAction
  // for the desktop client to execute on the Mac. No DB writes, no gcal calls.
  openUrl(input: OpenUrlAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  openApp(input: OpenAppAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  openWorkspace(input: OpenWorkspaceAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  webSearch(input: WebSearchAction, ctx: ExecutionContext): Promise<ExecutorResult>;

  // Clicky slice — desktop action tools. Each validates input server-side and
  // returns a DesktopAction for the desktop dispatcher; getWeather is the
  // exception (fully server-side fetch, data in receipt, no DesktopAction).
  sendMessage(input: SendMessageAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  systemControl(input: SystemControlAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  typeText(input: TypeTextAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  pressKey(input: PressKeyAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  takeScreenshot(input: TakeScreenshotAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  runApplescript(input: RunApplescriptAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  runShortcut(input: RunShortcutAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  playMusic(input: PlayMusicAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  getWeather(input: GetWeatherAction, ctx: ExecutionContext): Promise<ExecutorResult>;

  // Server-side data tools — fully server-side fetches; data rides back in
  // `receipt` for the model to narrate. No DesktopAction is emitted.
  readGmail(input: ReadGmailAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  getNews(input: GetNewsAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  // WhatsApp read — fully server-side (queries synced whatsapp_messages);
  // returns a grouped receipt for the agent to narrate. No DesktopAction.
  readWhatsapp(input: ReadWhatsappAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  // iMessage read — fully server-side (queries synced imessage_messages);
  // returns a grouped receipt for the agent to narrate. No DesktopAction.
  readImessage(input: ReadImessageAction, ctx: ExecutionContext): Promise<ExecutorResult>;

  // Govee lights — fully server-side (BYOK govee → GOVEE_API_KEY fallback);
  // list from user_govee_devices; control via GoveeClient. No DesktopAction.
  listLights(input: ListLightsAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  controlLights(input: ControlLightsAction, ctx: ExecutionContext): Promise<ExecutorResult>;

  // Computer Use fallback — mints a session_id and returns the computer_use
  // DesktopAction; the desktop drives the step loop against
  // /api/jarvis/computer-use/step. No side effects server-side at dispatch.
  computerUse(input: ComputerUseAction, ctx: ExecutionContext): Promise<ExecutorResult>;

  // Study review (issue #400) — fully server-side Postgres writes and reads;
  // the receipt carries what the model needs to narrate. No DesktopAction.
  // logStudyReview is the only one that advances a topic's memory state, and
  // it delegates the scheduling maths to lib/study/scheduler.ts.
  createStudyTopics(
    input: CreateStudyTopicsAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  findStudyTopics(
    input: FindStudyTopicsAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  logStudyReview(
    input: LogStudyReviewAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  planStudyDay(
    input: PlanStudyDayAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
}
