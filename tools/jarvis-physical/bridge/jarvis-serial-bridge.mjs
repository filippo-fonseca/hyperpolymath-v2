#!/usr/bin/env node
// USB-serial -> HTTP bridge for the Jarvis physical extension.
//
// Reads command IDs from the Arduino + DF2301Q over USB serial, and POSTs
// them to the Jarvis web app's /api/jarvis/physical/trigger endpoint. The
// web app fans the trigger out to any open browser tab via SSE.
//
// Run: pnpm start  (or `node jarvis-serial-bridge.mjs`)

import "dotenv/config";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const SERIAL_PORT = process.env.SERIAL_PORT;
const SERIAL_BAUD = Number(process.env.SERIAL_BAUD ?? 115200);
const TRIGGER_URL = process.env.TRIGGER_URL;
const SECRET = process.env.PHYSICAL_TRIGGER_SECRET;
const TRIGGER_IDS_RAW = (process.env.TRIGGER_IDS ?? "1").trim();
const DEBOUNCE_MS = Number(process.env.DEBOUNCE_MS ?? 1500);

if (!SERIAL_PORT) die("SERIAL_PORT not set. Copy .env.example -> .env and edit.");
if (!TRIGGER_URL) die("TRIGGER_URL not set.");
if (!SECRET || SECRET === "replace-me-with-openssl-rand-hex-32") {
  die("PHYSICAL_TRIGGER_SECRET not set. Generate with: openssl rand -hex 32");
}

const matchAny = TRIGGER_IDS_RAW === "*";
const triggerIds = matchAny
  ? null
  : new Set(
      TRIGGER_IDS_RAW.split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n)),
    );

const port = new SerialPort({ path: SERIAL_PORT, baudRate: SERIAL_BAUD });
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

let lastFiredAt = 0;

port.on("open", () => {
  console.log(`[bridge] listening on ${SERIAL_PORT} @ ${SERIAL_BAUD}`);
  console.log(`[bridge] forwarding to ${TRIGGER_URL}`);
  console.log(
    `[bridge] firing on IDs: ${matchAny ? "* (any)" : [...triggerIds].join(", ")}`,
  );
});

port.on("error", (err) => {
  console.error(`[bridge] serial error:`, err.message);
});

parser.on("data", (raw) => {
  const line = raw.toString().trim();
  if (!line) return;

  // Pass-through debug lines (e.g., "DF2301Q ready.").
  if (!line.startsWith("ID=")) {
    console.log(`[serial] ${line}`);
    return;
  }

  const match = line.match(/^ID=(\d+)\s+NAME=(.+)$/);
  if (!match) {
    console.log(`[serial] (unparsed) ${line}`);
    return;
  }

  const commandId = Number(match[1]);
  const commandName = match[2].trim();

  if (!matchAny && !triggerIds.has(commandId)) {
    console.log(`[serial] heard id=${commandId} (${commandName}) -- not in TRIGGER_IDS, skip`);
    return;
  }

  const now = Date.now();
  if (now - lastFiredAt < DEBOUNCE_MS) {
    console.log(`[bridge] debounce: skip id=${commandId}`);
    return;
  }
  lastFiredAt = now;

  fireTrigger({ commandId, commandName }).catch((err) =>
    console.error(`[bridge] POST failed:`, err.message),
  );
});

async function fireTrigger({ commandId, commandName }) {
  const body = {
    source: "arduino-df2301q",
    commandId,
    commandName,
  };

  const res = await fetch(TRIGGER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trigger-Secret": SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[bridge] POST -> ${res.status} ${res.statusText}`);
    return;
  }
  console.log(`[bridge] FIRE id=${commandId} (${commandName}) -> ${res.status}`);
}

function die(msg) {
  console.error(`[bridge] ${msg}`);
  process.exit(1);
}
