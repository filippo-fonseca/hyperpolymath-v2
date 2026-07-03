// @hyperpolymath/jarvis-core/routines — barrel for the routine spec contracts.
// Consumed by the web app (server actions + editor) and the desktop
// (trigger registration + spec read-back).

export {
  ROUTINE_SPEC_VERSION,
  type WakePhraseTrigger,
  type UtteranceTrigger,
  type TimeTrigger,
  type HotkeyTrigger,
  type RoutineTrigger,
  type RoutineTriggerType,
  type RoutineBlock,
  type RoutineSpec,
  type Routine,
} from "./types";

export {
  zRoutineTrigger,
  zRoutineBlock,
  zRoutineSpec,
  type RoutineSpecInput,
  deriveTriggerTypes,
  computeNextRunAt,
} from "./schema";

export { normalizePhrase, phraseMatches } from "./match";
