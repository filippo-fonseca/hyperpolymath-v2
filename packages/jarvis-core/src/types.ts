// Public domain types for @hyperpolymath/jarvis-core.
// These are the contracts every consumer (web app, future CLI) targets.
//
// CRITICAL: task `status` literals use SPACES (not underscores) to match the
// Postgres `task_status` enum at apps/web/lib/db/enums.ts:7-13.

export type ActionType = "create_task" | "create_capture" | "create_event";

// Phase 16: JarvisToolName — canonical union of all tool names across
// create / update / delete / find / utility. Used by ActionExecutor, ScrollbackAction,
// and tool-dispatch switch statements so every consumer references one source of truth.
export type JarvisToolName =
  | "create_task" | "create_capture" | "create_event"
  | "remember_fact" | "ask_clarification"
  | "update_task" | "delete_task"
  | "update_capture" | "delete_capture"
  | "update_event" | "delete_event"
  | "find_tasks" | "find_captures" | "find_events"
  | "create_person" | "find_people" | "link_people"
  | "open_url" | "open_app" | "open_workspace" | "web_search"
  // Clicky slice — desktop action tools + server-side weather
  | "send_message" | "system_control" | "type_text" | "press_key"
  | "take_screenshot" | "run_applescript" | "run_shortcut" | "play_music"
  | "get_weather"
  // Server-side data tools (no DesktopAction)
  | "read_gmail"
  | "get_news"
  // WhatsApp — server-side read of synced messages
  | "read_whatsapp"
  // iMessage — server-side read of synced messages
  | "read_imessage"
  // Govee lights — server-side list + control
  | "list_lights"
  | "control_lights"
  // Computer Use fallback — catch-all agentic desktop loop
  | "computer_use";

export interface ParsedDate {
  /** Original phrase, e.g. "tomorrow 3am". */
  text: string;
  /** ISO 8601 UTC. */
  start: string;
  end?: string;
  allDay?: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  icon?: string | null;
}

export type Priority = "P∞" | "P1" | "P2" | "P3";

export type TaskStatus =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

export interface CreateTaskAction {
  title: string;
  priority?: Priority;
  status?: TaskStatus;
  /** ISO 8601 UTC. */
  due?: string;
  project_ids?: string[];
  /** Phase 7 forward-compat — populated only when voiceActive=true. */
  voice_summary?: string;
}

export interface CreateCaptureAction {
  content: string;
  hashtags?: string[];
  project_ids?: string[];
  /** Resurfacing (remind-me) date — ISO 8601 with offset. Omit for none. */
  resurface_at?: string;
  voice_summary?: string;
}

export interface CreateEventAction {
  title: string;
  calendar_id?: string;
  /** ISO 8601 UTC. */
  start: string;
  end: string;
  description?: string;
  voice_summary?: string;
}

export type JarvisTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

// Phase 5.1 (D-M1 / D-M2 / JARVIS-18) — JarvisFact injected into the cached
// system prompt via buildFactsBlock. Does NOT expose id / created_at / source
// to the model — those are server-side only.
export interface JarvisFact {
  type: "preference" | "rule" | "entity" | "workflow";
  key: string;
  value: string;
}

// RememberFactAction is the parsed wire shape from the Anthropic tool call.
// Includes `source` (unlike JarvisFact) so the executor can write it to the DB.
export interface RememberFactAction {
  type: "preference" | "rule" | "entity" | "workflow";
  key: string;
  value: string;
  source: "user_explicit" | "jarvis_suggested";
}

// ---------------------------------------------------------------------------
// Phase 16 — CRUD update / delete / find action input types.
// Mirrors the CreateTask/Capture/Event shapes but for update/delete semantics.
// ---------------------------------------------------------------------------

export interface UpdateTaskAction {
  id: string;
  title?: string | null;
  description?: string | null;
  priority?: "P∞" | "P1" | "P2" | "P3" | null;
  status?: "not started" | "up next" | "in progress" | "almost done" | "lesno" | null;
  due?: string | null;
  project_ids?: string[] | null;
}

export interface DeleteTaskAction {
  id: string;
}

export interface UpdateCaptureAction {
  id: string;
  content?: string | null;
  hashtags?: string[] | null;
  project_ids?: string[] | null;
  /**
   * Resurfacing (remind-me) date — ISO 8601 with offset to set/change, empty
   * string "" to clear, null to leave unchanged.
   */
  resurface_at?: string | null;
}

export interface DeleteCaptureAction {
  id: string;
}

export interface UpdateEventAction {
  id: string;
  calendar_id: string;
  title?: string | null;
  description?: string | null;
  start?: string | null;
  end?: string | null;
}

export interface DeleteEventAction {
  id: string;
  calendar_id: string;
}

export interface FindTasksAction {
  query?: string | null;
  status?: Array<"not started" | "up next" | "in progress" | "almost done" | "lesno"> | null;
  priority?: Array<"P∞" | "P1" | "P2" | "P3"> | null;
  project_id?: string | null;
}

export interface FindCapturesAction {
  query?: string | null;
  hashtag?: string | null;
  project_id?: string | null;
  /** ISO date */
  since?: string | null;
}

export interface FindEventsAction {
  query?: string | null;
  /** ISO datetime */
  time_min?: string | null;
  /** ISO datetime */
  time_max?: string | null;
}

// ---------------------------------------------------------------------------
// Phase D — people knowledge graph action input types.
// Inferred shapes from the Zod schemas in tools/create-person | find-people |
// link-people. Declared as plain interfaces here to match the other action
// types and keep types.ts dependency-free.
// ---------------------------------------------------------------------------

export interface CreatePersonAction {
  name: string;
  email?: string;
  phone?: string;
  bio?: string;
  tags?: string[];
}

export interface FindPeopleAction {
  query?: string;
}

export interface LinkPeopleAction {
  person_names: string[];
  from_type: "task" | "capture" | "page" | "jarvis_fact" | "event";
  from_id: string;
}

// ---------------------------------------------------------------------------
// Computer-control action input types (open_url / open_app / web_search).
// The executor validates these server-side and returns a DesktopAction for
// the desktop client to execute. No DB writes or gcal calls.
// ---------------------------------------------------------------------------

export interface OpenUrlAction {
  url: string;
  label?: string;
}

export interface OpenAppAction {
  app: string;
  label?: string;
}

export interface OpenWorkspaceItem {
  type: "url" | "app";
  value: string;
  label?: string;
  fullscreen?: boolean;
}

export interface OpenWorkspaceAction {
  items: OpenWorkspaceItem[];
}

export interface WebSearchAction {
  query: string;
  engine?: "google" | "maps";
}

// Clicky slice — new computer-control action input types. Executors validate
// these server-side and return a DesktopAction; get_weather is the exception
// (fully server-side, returns data in the receipt, no DesktopAction).

export interface SendMessageAction {
  /** Messaging channel — iMessage (AppleScript via Messages.app) or WhatsApp
   *  (HTTP POST to the local lharries/whatsapp-mcp Go bridge). */
  app: "imessage" | "whatsapp";
  recipient: string;
  text: string;
  label?: string;
}

export interface SystemControlAction {
  action: "volume" | "brightness" | "focus" | "sleep";
  value?: number | string;
  label?: string;
}

export interface TypeTextAction {
  text: string;
}

export interface PressKeyAction {
  key: string;
  modifiers?: string[];
}

export interface TakeScreenshotAction {
  describe?: boolean;
}

export interface RunApplescriptAction {
  label: string;
  script: string;
}

export interface RunShortcutAction {
  name: string;
  input?: string;
}

export interface PlayMusicAction {
  app?: "music" | "spotify";
  query?: string;
}

export interface GetWeatherAction {
  location?: string;
}

/**
 * read_gmail — fully server-side Gmail inbox read (metadata + snippet only,
 * never the full body). Uses the existing Google OAuth client extended with
 * the `gmail.readonly` scope. Results ride back in the tool receipt for the
 * agent to narrate aloud (briefings, "any email from X?", etc.).
 */
export interface ReadGmailAction {
  query?: string;
  maxResults?: number;
}

/**
 * get_news — fully server-side Guardian API fetch. BYOK-first (user key via
 * `getUserKeyOrNull(userId, "guardian")`) with an owner env fallback of
 * GUARDIAN_API_KEY. Results ride back in the tool receipt for the agent to
 * narrate; no DesktopAction is emitted.
 */
export interface GetNewsAction {
  topic?: string;
  maxResults?: number;
}

/** list_lights — registered Govee devices from user_govee_devices. */
export interface ListLightsAction {
  filter?: string;
}

/**
 * control_lights — discriminated LightCommand. Re-exported action type aliases
 * the Zod-inferred command; see tools/control-lights.ts for the full union.
 */
export type { LightCommand as ControlLightsAction } from "./tools/control-lights";

// WhatsApp — server-side read. No DesktopAction; the executor queries the
// synced whatsapp_messages table and returns a grouped receipt for the agent
// to narrate. See tools/read-whatsapp.ts for schema.
export interface ReadWhatsappAction {
  chat?: string;
  since_hours?: number;
  maxResults?: number;
  unrepliedOnly?: boolean;
}

// iMessage — server-side read. No DesktopAction; the executor queries the
// synced imessage_messages table and returns a grouped receipt for the agent
// to narrate. See tools/read-imessage.ts for schema.
export interface ReadImessageAction {
  chat?: string;
  since_hours?: number;
  maxResults?: number;
  unrepliedOnly?: boolean;
}


/** Computer Use fallback — catch-all for desktop tasks no named tool covers.
 *  The executor mints a session_id and returns a DesktopAction; the desktop
 *  then drives the multi-step loop against /api/jarvis/computer-use/step. */
export interface ComputerUseAction {
  task: string;
}

/** Structured desktop action returned by the executor for computer-control
 *  tools. The desktop client keys off `kind` to decide what to do.
 *  CONTRACT (fixed — the desktop dispatcher keys off `kind`; do not rename). */
export type DesktopAction =
  | { kind: "open_url"; url: string; label: string }
  | { kind: "open_app"; app: string; label: string }
  | { kind: "open_workspace"; items: OpenWorkspaceItem[] }
  | {
      kind: "send_message";
      /** iMessage → AppleScript via Messages.app; whatsapp → HTTP POST to the
       *  local lharries/whatsapp-mcp Go bridge (see apps/desktop dispatcher). */
      app: "imessage" | "whatsapp";
      recipient: string;
      text: string;
      /** The desktop MUST hold the send until the user confirms aloud. */
      requires_confirm: true;
    }
  | {
      kind: "system_control";
      action: "volume" | "brightness" | "focus" | "sleep";
      value?: number | string;
    }
  | { kind: "type_text"; text: string }
  | { kind: "press_key"; key: string; modifiers: string[] }
  | { kind: "take_screenshot"; describe: boolean }
  | { kind: "run_applescript"; label: string; script: string }
  | { kind: "run_shortcut"; name: string; input?: string }
  | { kind: "play_music"; app: "music" | "spotify"; query?: string }
  | {
      kind: "computer_use";
      /** Plain-language task for the agentic Computer Use loop. */
      task: string;
      /** Server-minted UUID correlating every step of one loop. */
      session_id: string;
    };

// ---------------------------------------------------------------------------
// JARVIS management — per-user PERSONALITY config that tunes the spoken voice.
//
// Persisted in Postgres (jarvis_personality_config, one row per user) and
// injected into the cached system prefix via buildPersonalityTuningBlock. The
// DEFAULT_PERSONALITY_CONFIG below reproduces today's canon voice EXACTLY —
// an absent or all-default config emits no tuning block, so nothing regresses.
// Shared across web (server actions + API routes), the prompt builder, and the
// desktop (config sync).

export type PersonalityPreset = "canon" | "minimal" | "storyteller";
export type PersonalityFormality = "formal" | "balanced" | "casual";
export type PersonalityVerbosity = "concise" | "balanced" | "expansive";
export type PersonalityWit = "dry" | "moderate" | "playful";

export interface PersonalityConfig {
  preset: PersonalityPreset;
  formality: PersonalityFormality;
  verbosity: PersonalityVerbosity;
  wit: PersonalityWit;
  /** Freeform user directives layered on top of the dials. Null/empty = none. */
  customInstructions: string | null;
}

/**
 * The canonical default. MUST equal today's behavior so an unconfigured user
 * sees no change. `isDefaultPersonalityConfig` treats a config equal to this
 * (with empty/whitespace custom instructions) as a no-op → no tuning block.
 */
export const DEFAULT_PERSONALITY_CONFIG: PersonalityConfig = {
  preset: "canon",
  formality: "formal",
  verbosity: "concise",
  wit: "dry",
  customInstructions: null,
};

// ---------------------------------------------------------------------------
// JARVIS management — per-user STARTUP config, mirroring the desktop startup
// shape (apps/desktop/src/settings.ts). Persisted in jarvis_startup_config and
// read by the desktop via the bearer-auth GET route. Web is the source of truth.

export type StartupOpenTarget = { type: "url" | "app"; value: string };

export interface StartupConfig {
  briefingEnabled: boolean;
  openOnStart: StartupOpenTarget[];
  startupShortcuts: string[];
}

export const DEFAULT_STARTUP_CONFIG: StartupConfig = {
  // OPT-IN. An unrequested spoken "Good morning, sir" briefing on every wake
  // reads as the app talking to itself, so the briefing is OFF unless the user
  // explicitly turns it on in the StartupEditor. This is the load-bearing
  // default: the web GET route (/api/jarvis/config/startup) and getStartupConfig
  // both fall back to it when the user has no jarvis_startup_config row, and the
  // desktop treats the web value as the source of truth.
  briefingEnabled: false,
  openOnStart: [],
  startupShortcuts: [],
};

// ---------------------------------------------------------------------------
// Phase 16 — SessionEntity: tracks entities touched during this JARVIS turn
// for the in-turn scratchpad block (enables update/delete to reference items
// created earlier in the same session without a separate find call).
export interface SessionEntity {
  id: string;
  type: "task" | "capture" | "event";
  title?: string;
  content?: string;
  action: "created" | "updated" | "deleted";
  /** ISO 8601 UTC */
  timestamp: string;
}
