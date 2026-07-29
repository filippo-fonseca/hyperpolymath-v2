/**
 * Deterministic repro for the dev server dying on an aborted request.
 *
 * The dev server logs `uncaughtException: Error: aborted { code:
 * 'ECONNRESET' }` and exits. The suspected trigger is a client that walks away
 * from an in-flight request, which in this app happens constantly: the physical
 * SSE channel reconnects on a loop, and any navigation abandons whatever the
 * previous page had open.
 *
 * This opens N requests against the given path and destroys each socket
 * mid-flight, then polls the port to see whether the server is still alive.
 *
 * Usage: node repro-econnreset.mjs <port> <path> [count]
 */
import http from "node:http";

const PORT = Number(process.argv[2] ?? 3247);
const PATHNAME = process.argv[3] ?? "/api/jarvis/physical/events";
const COUNT = Number(process.argv[4] ?? 6);

function alive() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/tasks" }, (res) => {
      res.resume();
      res.on("end", () => resolve(true));
    });
    req.on("error", () => resolve(false));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function abortMidFlight() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: PATHNAME }, (res) => {
      // Kill the socket while the response is still streaming.
      setTimeout(() => req.destroy(), 120);
      res.on("data", () => {});
      res.on("error", () => {});
    });
    req.on("error", () => {});
    setTimeout(resolve, 400);
  });
}

console.log(`alive before: ${await alive()}`);
for (let i = 0; i < COUNT; i++) {
  await abortMidFlight();
  const up = await alive();
  console.log(`abort #${i + 1} -> serverAlive=${up}`);
  if (!up) {
    console.log(`DIED after ${i + 1} aborted request(s) to ${PATHNAME}`);
    process.exit(0);
  }
}
console.log(`survived ${COUNT} aborted requests to ${PATHNAME}`);
