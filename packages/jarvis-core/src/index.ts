// @hyperpolymath/jarvis-core — public barrel.
//
// Tasks 2-4 of Plan 05-01 incrementally add the parser/tool/prompt exports.

export type {
  ActionExecutor,
  ExecutionContext,
  ExecutorResult,
} from "./executor/interface";

export {
  parseDates,
  parsePriority,
  parseSlashCommand,
  type ParsedSlashCommand,
  type SlashCommand,
} from "./parsers";

// Runtime list of all JARVIS tool names + membership guard. Consumed by the
// routine block-engine (validating authored block tools) and the routine-model
// editor (gating tool selection). Kept exhaustive against JarvisToolName.
export { JARVIS_TOOL_NAMES, isJarvisToolName } from "./tool-names";

export {
  COMPUTER_MODE_ADDENDUM,
  JARVIS_PERSONALITY,
  TOOL_USE_RULES,
  VOICE_ADDENDUM,
  SPOKEN_OUTPUT_CONTRACT,
  NARRATOR_CONTRACT,
} from "./personality";

export {
  buildProjectListContext,
  buildSystemPrompt,
  buildUserContextBlock,
  type SystemBlock,
} from "./prompt-builder";

// Time-of-day bucketing + greeting helpers (bgsd/time-aware-greeting). Pure
// functions consumed by the run-turn temporal-context block so JARVIS greets
// with the correct part of the day from the user's real local time.
export {
  timeOfDayForHour,
  greetingForTimeOfDay,
  greetingForHour,
  correctLeadingGreeting,
  type TimeOfDay,
} from "./time-of-day";

export {
  buildToolDefinitions,
  type JarvisToolDefinition,
  zCreateCapture,
  zCreateCaptureFor,
  zCreateEvent,
  zCreateEventFor,
  zCreateTask,
  zCreateTaskFor,
  // Phase 5.1 (D-M5 / JARVIS-18): remember_fact tool
  zRememberFact,
  zRememberFactFor,
  // Phase 5.1 (D-A1 / JARVIS-19): ask_clarification tool
  zAskClarification,
  zAskClarificationFor,
} from "./tools";

// Phase 5.1 (D-M4): buildFactsBlock for system-prompt injection
export { buildFactsBlock } from "./prompt-builder";

// JARVIS management: personality-tuning block builder + all-default guard
export {
  buildPersonalityTuningBlock,
  isDefaultPersonalityConfig,
} from "./prompt-builder";

export type {
  ActionType,
  CreateCaptureAction,
  CreateEventAction,
  CreateTaskAction,
  JarvisTurn,
  ParsedDate,
  Priority,
  ProjectSummary,
  TaskStatus,
  // Phase 5.1 (D-M1 / D-M5 / JARVIS-18)
  JarvisFact,
  RememberFactAction,
  // Phase 16 — CRUD update / delete / find + scratchpad + tool name union
  JarvisToolName,
  SessionEntity,
  UpdateTaskAction,
  DeleteTaskAction,
  UpdateCaptureAction,
  DeleteCaptureAction,
  UpdateEventAction,
  DeleteEventAction,
  FindTasksAction,
  FindCapturesAction,
  FindEventsAction,
  // Phase D — people knowledge graph action types
  CreatePersonAction,
  FindPeopleAction,
  LinkPeopleAction,
  // Computer-control action types + desktop result type
  OpenUrlAction,
  OpenAppAction,
  OpenWorkspaceAction,
  OpenWorkspaceItem,
  WebSearchAction,
  DesktopAction,
  // Clicky slice — desktop action tools + server-side weather
  SendMessageAction,
  SystemControlAction,
  TypeTextAction,
  PressKeyAction,
  TakeScreenshotAction,
  RunApplescriptAction,
  RunShortcutAction,
  PlayMusicAction,
  GetWeatherAction,
  // Server-side data tools (Gmail read + Guardian news)
  ReadGmailAction,
  GetNewsAction,
  // WhatsApp — server-side read of synced messages
  ReadWhatsappAction,
  // iMessage — server-side read of synced messages
  ReadImessageAction,
  // Govee lights — server-side list + control
  ListLightsAction,
  ControlLightsAction,
  // Computer Use fallback — catch-all agentic desktop loop
  ComputerUseAction,
  // JARVIS management — per-user personality + startup config contracts
  PersonalityConfig,
  PersonalityPreset,
  PersonalityFormality,
  PersonalityVerbosity,
  PersonalityWit,
  StartupConfig,
  StartupOpenTarget,
} from "./types";

// JARVIS management — default configs (value exports; reproduce today's behavior)
export { DEFAULT_PERSONALITY_CONFIG, DEFAULT_STARTUP_CONFIG } from "./types";

// Phase 5.1 (D-A1 / JARVIS-19): AskClarificationAction from tools barrel
export type { AskClarificationAction } from "./tools/ask-clarification";

// Send-path: shared WhatsApp send-error classifier. Distinguishes a
// connectivity failure ("not connected") from a contact-resolution failure
// ("not found" / "ambiguous") so the desktop confirm-gate speaks the right
// line instead of always blaming the connection.
export {
  classifyWhatsappSendError,
  whatsappSendFailureLine,
} from "./tools/whatsapp-send-error";
export type {
  WhatsappSendErrorCategory,
  WhatsappSendTransport,
  WhatsappBridgeErrorBody,
  WhatsappSendClassification,
} from "./tools/whatsapp-send-error";

// JARVIS routines — natural-language "routines + triggers" spec contracts.
// Also available via the `@hyperpolymath/jarvis-core/routines` subpath.
export {
  ROUTINE_SPEC_VERSION,
  zRoutineTrigger,
  zRoutineBlock,
  zRoutineSpec,
  deriveTriggerTypes,
  computeNextRunAt,
} from "./routines";
export type {
  WakePhraseTrigger,
  UtteranceTrigger,
  TimeTrigger,
  HotkeyTrigger,
  RoutineTrigger,
  RoutineTriggerType,
  RoutineBlock,
  RoutineSpec,
  Routine,
  RoutineSpecInput,
} from "./routines";
