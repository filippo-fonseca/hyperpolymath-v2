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

export {
  JARVIS_PERSONALITY,
  TOOL_USE_RULES,
  VOICE_ADDENDUM,
} from "./personality";

export {
  buildProjectListContext,
  buildSystemPrompt,
  buildUserContextBlock,
  type SystemBlock,
} from "./prompt-builder";

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
} from "./types";

// Phase 5.1 (D-A1 / JARVIS-19): AskClarificationAction from tools barrel
export type { AskClarificationAction } from "./tools/ask-clarification";
