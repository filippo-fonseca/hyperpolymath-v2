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
} from "./tools";

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
} from "./types";
