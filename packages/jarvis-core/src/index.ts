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
  type SystemBlock,
} from "./prompt-builder";

export {
  buildToolDefinitions,
  type JarvisToolDefinition,
  zCreateCapture,
  zCreateEvent,
  zCreateTask,
  // Phase 5.1 (D-M5 / JARVIS-18): remember_fact tool
  zRememberFact,
  zRememberFactFor,
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
} from "./types";
