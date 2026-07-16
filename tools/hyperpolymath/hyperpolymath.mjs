#!/usr/bin/env node
// hyperpolymath — bring up the full Hyperpolymath / JARVIS dev stack with one command.
//
// Services (in order):
//   1. supabase   local Supabase stack (idempotent — `supabase start`)
//   2. web        Next.js dev server on :3000
//   3. desktop    Tauri desktop app (global hotkey + composer; no hardware)
//   4. bridge     ESP32 → HTTP wake-word serial bridge (optional Polypad)
//   5. wa-bridge  WhatsApp bridge daemon on :8080 (launchd-managed; adopted)
//   6. wa-sync    WhatsApp SQLite → Postgres mirror worker (personal-use)
//   7. im-sync    iMessage chat.db → Postgres mirror worker (personal-use)
//
// Flags:
//   --no-supabase           skip Supabase (e.g. when using a remote project)
//   --no-web                skip Next.js dev server
//   --no-desktop            skip Tauri desktop app (default input layer)
//   --no-mobile             skip Expo Metro dev server
//   --no-bridge             skip serial bridge (no ESP32 plugged in)
//   --no-wa-bridge          skip WhatsApp bridge daemon health check
//   --no-wa-sync            skip WhatsApp sync worker
//   --no-im-sync            skip iMessage sync worker
//   --only=name[,name...]   start only listed services
//   --help                  print usage and exit
//
// ── Extending ───────────────────────────────────────────────────────────────
// To add a new service (desktop app, worker, etc), append an entry to the
// SERVICES array. Each service is { name, color, preflight?, start, ready,
// keepAlive? }. preflight returns { skip } / { skipStart } to opt out per run.
// ────────────────────────────────────────────────────────────────────────────

import { spawn, execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB_DIR = resolve(REPO_ROOT, "apps/web");
const DESKTOP_DIR = resolve(REPO_ROOT, "apps/desktop");
const BRIDGE_DIR = resolve(REPO_ROOT, "tools/jarvis-physical/bridge");
const MOBILE_DIR = resolve(REPO_ROOT, "apps/mobile");
const WA_SYNC_SCRIPT = resolve(REPO_ROOT, "tools/whatsapp-sync/sync.mjs");
const WA_SYNC_DEFAULT_DB = resolve(
  os.homedir(),
  "Library/Application Support/io.hyperpolymath.jarvis-desktop/whatsapp/whatsapp.db",
);
const IM_SYNC_SCRIPT = resolve(REPO_ROOT, "tools/imessage-sync/sync.mjs");
const IM_SYNC_DEFAULT_DB = resolve(os.homedir(), "Library/Messages/chat.db");

const FLAGS = parseFlags(process.argv.slice(2));

// ── ANSI ────────────────────────────────────────────────────────────────────
const C = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const PREFIX_WIDTH = 11;
const fmtPrefix = (name, color) =>
  C[color](`[${name}]`.padEnd(PREFIX_WIDTH));

const log = (name, msg, color = "blue") =>
  console.log(`${fmtPrefix(name, color)} ${msg}`);
const warn = (name, msg) =>
  console.log(`${fmtPrefix(name, "yellow")} ${C.yellow("⚠")} ${msg}`);
const errorLog = (name, msg) =>
  console.log(`${fmtPrefix(name, "red")} ${C.red("✗")} ${msg}`);

if (FLAGS.help) {
  printUsage();
  process.exit(0);
}

// ── Services ────────────────────────────────────────────────────────────────
const SERVICES = [
  {
    name: "supabase",
    color: "green",
    port: ":54321",
    async preflight() {
      try {
        execSync("docker info", { stdio: "ignore" });
      } catch {
        warn("supabase", "Docker isn't running. Start Docker Desktop and re-run.");
        return { skip: true };
      }
    },
    start: () =>
      spawn("supabase", ["start"], {
        cwd: WEB_DIR,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    // `supabase start` bootstraps Docker containers and then exits. We don't
    // hold the process; we just wait for the REST endpoint to answer.
    keepAlive: false,
    ready: () => waitForHttp("http://127.0.0.1:54321/rest/v1/", 90_000),
  },

  {
    name: "web",
    color: "cyan",
    port: ":3000",
    async preflight() {
      if (await isPortListening(3000)) {
        warn("web", "port 3000 already in use — assuming an existing dev server");
        return { skipStart: true };
      }
    },
    start: () =>
      spawn("pnpm", ["dev"], {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    keepAlive: true,
    ready: () => waitForHttp("http://localhost:3000/", 60_000),
  },

  {
    name: "desktop",
    color: "blue",
    async preflight() {
      // Tauri needs cargo on PATH. If Rust isn't installed, skip cleanly —
      // user shouldn't be blocked from the rest of the stack.
      try {
        await new Promise((resolveP, rejectP) => {
          const proc = spawn("cargo", ["--version"], { stdio: "ignore" });
          proc.on("exit", (code) => (code === 0 ? resolveP() : rejectP(new Error("cargo failed"))));
          proc.on("error", rejectP);
        });
      } catch {
        warn("desktop", "cargo not on PATH — install Rust to run the Tauri app");
        return { skip: true };
      }
    },
    start: () =>
      spawn("pnpm", ["dev"], {
        cwd: DESKTOP_DIR,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    keepAlive: true,
    // Tauri's first-build can take 2-5 minutes (cargo compile). Be patient.
    // The "App listening" pattern is what tauri emits once the webview window
    // is up; fall back to the dev-server "ready" if Tauri renames it later.
    ready: (proc) => waitForLog(proc, /App listening|Running BeforeDevCommand|Built/i, 600_000),
  },

  {
    name: "mobile",
    color: "yellow",
    port: ":8081",
    async preflight() {
      // If a Metro dev server already holds :8081 (e.g. started by hand in
      // another terminal), expo start would prompt "Use port 8082 instead?"
      // and hang forever with no stdin. Reuse the existing one instead.
      if (await isPortListening(8081)) {
        warn("mobile", "Metro already running on :8081 — reusing it");
        return { skip: true };
      }
    },
    start: () =>
      spawn("pnpm", ["start"], {
        cwd: MOBILE_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      }),
    keepAlive: true,
    ready: (proc) => waitForLog(proc, /Waiting on http:\/\/localhost:8081|Metro waiting/i, 120_000),
  },

  {
    name: "bridge",
    color: "magenta",
    async preflight() {
      const port = findUsbmodemPort();
      if (!port) {
        warn("bridge", "no /dev/cu.usbmodem* device — is the ESP32 plugged in?");
        return { skip: true };
      }
      log("bridge", `found device ${C.bold(port)}`, "magenta");

      const holder = findPortHolder(port);
      if (holder) {
        if (/jarvis-serial-bridge/.test(holder.command)) {
          log("bridge", `killing stale bridge pid ${holder.pid}`, "magenta");
          try { process.kill(holder.pid); } catch {}
          await sleep(600);
        } else if (/serial-mo|arduino/i.test(holder.command)) {
          warn("bridge", `Arduino IDE Serial Monitor (pid ${holder.pid}) is holding ${port}.`);
          warn("bridge", "Close the Serial Monitor in Arduino IDE, then re-run.");
          return { skip: true };
        } else {
          warn("bridge", `port ${port} held by ${holder.command} (pid ${holder.pid}). Close it and re-run.`);
          return { skip: true };
        }
      }

      return { env: { SERIAL_PORT: port }, port: port.replace(/^\/dev\//, "") };
    },
    start: (pre) =>
      spawn("npm", ["start"], {
        cwd: BRIDGE_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...(pre?.env ?? {}) },
      }),
    keepAlive: true,
    ready: (proc) => waitForLog(proc, /\[bridge\] listening on/, 30_000),
  },

  {
    // WhatsApp bridge daemon: a persistent launchd agent
    // (com.hyperpolymath.whatsapp-bridge) that keeps the WhatsApp linked-device
    // connection up 24/7 on :8080, independent of the desktop app. It is NOT
    // spawned by this orchestrator — it's installed once via
    // `tools/whatsapp-bridge/install-daemon.sh` and managed by launchd. We only
    // health-check it here so the status bar reflects whether the always-on
    // bridge is reachable; the desktop app detects-and-adopts the same daemon.
    name: "wa-bridge",
    color: "green",
    port: ":8080",
    async preflight() {
      if (await isPortListening(8080)) {
        // Daemon already up (the normal case). Don't spawn anything — just
        // confirm health in `ready` below.
        return { skipStart: true };
      }
      warn(
        "wa-bridge",
        "no bridge on :8080 — install the daemon via tools/whatsapp-bridge/install-daemon.sh",
      );
      return { skip: true };
    },
    // launchd owns the process lifecycle; the CLI never spawns or holds it, so
    // `start` is never invoked (preflight returns skipStart when the daemon is
    // up, or skip when it isn't).
    start: () => null,
    keepAlive: false,
    ready: () => waitForHttp("http://localhost:8080/api/health", 5_000),
  },

  {
    // WhatsApp sync worker: tails the desktop bridge's SQLite capture store
    // and mirrors new messages into Postgres via /api/whatsapp/ingest so the
    // read_whatsapp tool + daily briefings can query them server-side.
    name: "wa-sync",
    color: "cyan",
    async preflight() {
      if (!process.env.JARVIS_DEVICE_TOKEN) {
        warn("wa-sync", "JARVIS_DEVICE_TOKEN not set — skipping (mint one at /settings/desktop)");
        return { skip: true };
      }
      const dbPath = process.env.WHATSAPP_DB_PATH ?? WA_SYNC_DEFAULT_DB;
      if (!existsSync(dbPath)) {
        warn("wa-sync", `no capture store yet at ${dbPath} — pair the desktop bridge first`);
        return { skip: true };
      }
    },
    start: () =>
      spawn("node", [WA_SYNC_SCRIPT], {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          JARVIS_APP_URL: process.env.JARVIS_APP_URL ?? "http://localhost:3000",
        },
      }),
    keepAlive: true,
    ready: (proc) => waitForLog(proc, /\[whatsapp-sync\] starting/, 15_000),
  },

  {
    // iMessage sync worker: tails ~/Library/Messages/chat.db and mirrors new
    // messages into Postgres via /api/imessage/ingest so the read_imessage
    // tool + daily briefings can query them server-side. Requires Full Disk
    // Access on the `node` binary — see tools/imessage-sync/README.md.
    name: "im-sync",
    color: "magenta",
    async preflight() {
      if (!process.env.JARVIS_DEVICE_TOKEN) {
        warn("im-sync", "JARVIS_DEVICE_TOKEN not set — skipping (mint one at /settings/desktop)");
        return { skip: true };
      }
      const dbPath = process.env.IMESSAGE_DB_PATH ?? IM_SYNC_DEFAULT_DB;
      if (!existsSync(dbPath)) {
        warn("im-sync", `no chat.db at ${dbPath} — is this a Mac with Messages set up?`);
        return { skip: true };
      }
    },
    start: () =>
      spawn("node", [IM_SYNC_SCRIPT], {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          JARVIS_APP_URL: process.env.JARVIS_APP_URL ?? "http://localhost:3000",
        },
      }),
    keepAlive: true,
    ready: (proc) => waitForLog(proc, /\[imessage-sync\] starting/, 15_000),
  },
];

// ── Status bar ──────────────────────────────────────────────────────────────
const STATUS_BAR_LINES = 3;

const STATUS_ICON = {
  idle:      () => C.dim("○"),
  preflight: () => C.yellow("◌"),
  starting:  () => C.yellow("◌"),
  ready:     () => C.green("●"),
  error:     () => C.red("✗"),
  skipped:   () => C.dim("—"),
};

const OVERALL = {
  booting:  () => C.yellow("◌ booting…"),
  ready:    () => C.green("✓ all systems go"),
  error:    () => C.red("✗ degraded"),
  stopping: () => C.yellow("◌ shutting down…"),
};

const state = {
  startedAt: Date.now(),
  overall: "booting",
  services: Object.fromEntries(
    SERVICES.map((s) => [s.name, { status: "idle", port: s.port ?? null }]),
  ),
};

let statusInterval = null;
let statusBarActive = false;

function setStatus(name, status, port) {
  const svc = state.services[name];
  if (!svc) return;
  svc.status = status;
  if (port !== undefined) svc.port = port;
  recomputeOverall();
  drawStatusBar();
}

function recomputeOverall() {
  if (state.overall === "stopping") return;
  const active = Object.values(state.services)
    .map((s) => s.status)
    .filter((s) => s !== "skipped");
  if (active.some((s) => s === "error")) state.overall = "error";
  else if (active.length > 0 && active.every((s) => s === "ready")) state.overall = "ready";
  else state.overall = "booting";
}

function setupStatusBar() {
  if (!process.stdout.isTTY) return;
  statusBarActive = true;
  const rows = process.stdout.rows;
  // Reserve bottom STATUS_BAR_LINES rows: scroll region is rows 1..(rows - STATUS_BAR_LINES).
  process.stdout.write(`\x1b[1;${rows - STATUS_BAR_LINES}r`);
  // Park cursor at the bottom of the scroll region so the next log line lands there.
  process.stdout.write(`\x1b[${rows - STATUS_BAR_LINES};1H`);
  drawStatusBar();
  statusInterval = setInterval(drawStatusBar, 1000);
  process.stdout.on("resize", () => {
    if (!statusBarActive) return;
    const r = process.stdout.rows;
    process.stdout.write(`\x1b[1;${r - STATUS_BAR_LINES}r`);
    drawStatusBar();
  });
}

function teardownStatusBar() {
  if (statusInterval) clearInterval(statusInterval);
  statusInterval = null;
  if (!statusBarActive) return;
  statusBarActive = false;
  // Reset scroll region, drop cursor below reserved area so the shell prompt lands cleanly.
  process.stdout.write("\x1b[r");
  process.stdout.write(`\x1b[${process.stdout.rows};1H\n`);
}

function drawStatusBar() {
  if (!statusBarActive) return;
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows;
  const top = rows - STATUS_BAR_LINES + 1;

  const services = Object.entries(state.services).map(([name, s]) => {
    const icon = STATUS_ICON[s.status]();
    const port = s.port ? "  " + C.dim(s.port) : "";
    return `${icon} ${name}${port}`;
  });

  const overall = OVERALL[state.overall]();
  const elapsed = formatElapsed(Date.now() - state.startedAt);

  const separator = C.dim("─".repeat(cols));
  const line1 = "  " + services.join("   " + C.dim("·") + "   ");
  const line2 = "  " + overall + "   " + C.dim(`uptime ${elapsed}`);

  // Single atomic write: save cursor → jump to bottom → clear+write 3 lines → restore.
  let out = "\x1b[s";
  out += `\x1b[${top};1H\x1b[2K${separator}`;
  out += `\x1b[${top + 1};1H\x1b[2K${line1}`;
  out += `\x1b[${top + 2};1H\x1b[2K${line2}`;
  out += "\x1b[u";
  process.stdout.write(out);
}

function formatElapsed(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ── Orchestration ───────────────────────────────────────────────────────────
const live = []; // { name, color, proc }
let shuttingDown = false;

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  state.overall = "stopping";
  drawStatusBar();
  console.log();
  log("boot", "shutting down...");
  for (const { proc } of live) {
    if (proc && !proc.killed) {
      try { proc.kill("SIGTERM"); } catch {}
    }
  }
  await sleep(2500);
  for (const { proc } of live) {
    if (proc && proc.exitCode === null) {
      try { proc.kill("SIGKILL"); } catch {}
    }
  }
  teardownStatusBar();
  log("boot", "bye 👋");
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  printBanner();

  const onlyFilter = FLAGS.only
    ? new Set(FLAGS.only.split(",").map((s) => s.trim()).filter(Boolean))
    : null;
  const selected = SERVICES.filter((s) => {
    if (onlyFilter) return onlyFilter.has(s.name);
    return !FLAGS[`no-${s.name}`];
  });

  if (selected.length === 0) {
    errorLog("boot", "no services selected.");
    process.exit(1);
  }

  // Mark unselected services as skipped up-front so the bar reflects reality.
  for (const svc of SERVICES) {
    if (!selected.includes(svc)) setStatus(svc.name, "skipped");
  }

  setupStatusBar();

  for (const svc of selected) {
    setStatus(svc.name, "preflight");
    log(svc.name, "preflight…", svc.color);
    let pre = {};
    try {
      pre = (await svc.preflight?.()) ?? {};
    } catch (err) {
      setStatus(svc.name, "error");
      errorLog(svc.name, `preflight failed: ${err.message}`);
      return shutdown(1);
    }
    if (pre.port) setStatus(svc.name, "preflight", pre.port);
    if (pre.skip) {
      setStatus(svc.name, "skipped");
      continue;
    }

    let proc = null;
    if (!pre.skipStart) {
      setStatus(svc.name, "starting");
      log(svc.name, "starting…", svc.color);
      proc = svc.start(pre);
      pipeOutput(proc, svc.name, svc.color);
      if (svc.keepAlive) live.push({ name: svc.name, color: svc.color, proc });

      proc.on("exit", (code, signal) => {
        if (shuttingDown) return;
        if (svc.keepAlive) {
          setStatus(svc.name, "error");
          errorLog(svc.name, `exited unexpectedly (code=${code} signal=${signal})`);
          return shutdown(1);
        }
      });
    }

    try {
      await svc.ready(proc);
      setStatus(svc.name, "ready");
      log(svc.name, C.bold(C.green("ready ✓")), svc.color);
    } catch (err) {
      setStatus(svc.name, "error");
      errorLog(svc.name, `not ready: ${err.message}`);
      return shutdown(1);
    }
  }

  console.log();
  log("boot", C.bold(C.green("all services up.")) + C.dim(" Ctrl+C to stop."));
  console.log();

  await new Promise(() => {}); // park forever
}

main().catch((err) => {
  errorLog("boot", err.stack ?? err.message);
  shutdown(1);
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function parseFlags(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq === -1) out[arg.slice(2)] = true;
    else out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

function pipeOutput(proc, name, color) {
  const prefix = fmtPrefix(name, color);
  for (const stream of [proc.stdout, proc.stderr]) {
    if (!stream) continue;
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) console.log(`${prefix} ${line}`);
      }
    });
  }
}

function waitForLog(proc, regex, timeoutMs) {
  return new Promise((res, rej) => {
    let buf = "";
    const timer = setTimeout(() => {
      cleanup();
      rej(new Error(`timeout waiting for log ${regex}`));
    }, timeoutMs);
    function onData(chunk) {
      buf += chunk.toString();
      if (regex.test(buf)) {
        cleanup();
        res();
      }
    }
    function cleanup() {
      clearTimeout(timer);
      proc.stdout?.off("data", onData);
      proc.stderr?.off("data", onData);
    }
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      return; // any response (even 4xx/5xx) means the server is alive
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function isPortListening(port) {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(400) });
    return true;
  } catch (err) {
    return err.name === "TimeoutError";
  }
}

function findUsbmodemPort() {
  try {
    const devs = readdirSync("/dev").filter((f) => /^cu\.usbmodem/.test(f));
    return devs.length ? `/dev/${devs[0]}` : null;
  } catch {
    return null;
  }
}

function findPortHolder(devPath) {
  try {
    const pids = execSync(`lsof -t ${devPath}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    if (pids.length === 0) return null;
    const pid = Number(pids[0]);
    const command = execSync(`ps -p ${pid} -o command=`, { encoding: "utf8" }).trim();
    return { pid, command };
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function printBanner() {
  const rgb = (r, g, b, s) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;

  // Warm vertical gradient — top highlight → bottom shadow.
  const tones = [
    [245, 185, 120],
    [235, 175, 110],
    [225, 165, 100],
    [215, 155, 90],
    [195, 135, 75],
    [150, 100, 55],
  ];

  const hyper = [
    "██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ",
    "██║  ██║╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗",
    "███████║ ╚████╔╝ ██████╔╝█████╗  ██████╔╝",
    "██╔══██║  ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══██╗",
    "██║  ██║   ██║   ██║     ███████╗██║  ██║",
    "╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝",
  ];

  const polymath = [
    "██████╗  ██████╗ ██╗     ██╗   ██╗███╗   ███╗ █████╗ ████████╗██╗  ██╗",
    "██╔══██╗██╔═══██╗██║     ╚██╗ ██╔╝████╗ ████║██╔══██╗╚══██╔══╝██║  ██║",
    "██████╔╝██║   ██║██║      ╚████╔╝ ██╔████╔██║███████║   ██║   ███████║",
    "██╔═══╝ ██║   ██║██║       ╚██╔╝  ██║╚██╔╝██║██╔══██║   ██║   ██╔══██║",
    "██║     ╚██████╔╝███████╗   ██║   ██║ ╚═╝ ██║██║  ██║   ██║   ██║  ██║",
    "╚═╝      ╚═════╝ ╚══════╝   ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝",
  ];

  const PAD = "  ";
  console.log();
  hyper.forEach((row, i) => {
    const [r, g, b] = tones[i];
    console.log(PAD + rgb(r, g, b, row));
  });
  polymath.forEach((row, i) => {
    const [r, g, b] = tones[i];
    console.log(PAD + rgb(r, g, b, row));
  });
  console.log();
  console.log(PAD + C.dim("life-OS · bringing the stack online…"));
  console.log();
}

function printUsage() {
  console.log(`
${C.bold("hyperpolymath")} — bring up the Hyperpolymath / JARVIS dev stack.

${C.bold("Services")}
  supabase   local Supabase (Docker)
  web        Next.js dev server on :3000
  desktop    Tauri desktop app (global hotkey + composer; no hardware)
  mobile     Expo Metro dev server for apps/mobile on :8081
  bridge     ESP32 → HTTP wake-word serial bridge (optional Polypad)
  wa-bridge  WhatsApp bridge daemon on :8080 (launchd-managed; health-checked)
  wa-sync    WhatsApp SQLite → Postgres mirror worker
  im-sync    iMessage chat.db → Postgres mirror worker

${C.bold("Flags")}
  --no-supabase           skip Supabase
  --no-web                skip web dev server
  --no-desktop            skip Tauri desktop app
  --no-mobile             skip Expo Metro dev server
  --no-bridge             skip serial bridge
  --no-wa-bridge          skip WhatsApp bridge daemon health check
  --no-wa-sync            skip WhatsApp sync worker
  --no-im-sync            skip iMessage sync worker
  --only=name[,name...]   start only listed services
  --help                  show this message

${C.bold("Examples")}
  hyperpolymath
  hyperpolymath --no-bridge
  hyperpolymath --only=web,supabase
`);
}
