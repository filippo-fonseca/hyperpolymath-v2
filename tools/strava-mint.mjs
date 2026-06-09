#!/usr/bin/env node
/**
 * tools/strava-mint.mjs — Bootstrap a Strava refresh_token into Supabase.
 *
 * One-time-run flow (260607-h2k, plan D-03 + Task 2):
 *
 *   1. Register an app at https://www.strava.com/settings/api
 *      - Authorization callback domain: localhost
 *      - Copy client_id + client_secret into apps/web/.env.local:
 *          STRAVA_CLIENT_ID=...
 *          STRAVA_CLIENT_SECRET=...
 *   2. Ensure DATABASE_URL (or POSTGRES_URL) is set in apps/web/.env.local
 *      pointing at the same Supabase Postgres the web app uses.
 *   3. From the repo root:
 *          USER_ID=<your-auth-user-uuid> node tools/strava-mint.mjs
 *      (or omit USER_ID and the script will prompt for it.)
 *   4. The script:
 *        - prints an authorize URL and opens it in your default browser
 *        - listens on http://localhost:53682/callback for the OAuth redirect
 *        - exchanges the code for access_token + refresh_token
 *        - upserts the row into integration_tokens (provider='strava')
 *
 * Re-running is safe — the upsert overwrites the existing row.
 *
 * Strava rotates refresh_token on every exchange; this script only mints the
 * FIRST one. The web app (lib/integrations/strava/activities.ts) handles
 * subsequent rotations transparently.
 */
import http from 'node:http';
import { exec } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(REPO_ROOT, 'apps', 'web');

// Resolve `postgres` from the web workspace's node_modules so this script
// stays zero-install — no top-level deps to maintain just for tooling.
const requireFromWeb = createRequire(path.join(WEB_DIR, 'package.json'));
const postgres = requireFromWeb('postgres');

// Minimal dotenv loader (matches the parser in tools/claude-code-sync.mjs).
// Loads apps/web/.env then apps/web/.env.local (the canonical env files).
function loadEnvFile(p) {
  try {
    const raw = readFileSync(p, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      // process.env takes precedence over file values.
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch { /* file missing — fine */ }
}
loadEnvFile(path.join(WEB_DIR, '.env'));
loadEnvFile(path.join(WEB_DIR, '.env.local'));

const REDIRECT_URI = 'http://localhost:53682/callback';
const SCOPE = 'activity:read_all';
const PORT = 53682;

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function die(msg, code = 1) {
  console.error(`\n[strava-mint] ${msg}\n`);
  process.exit(code);
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  die(
    'Missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET.\n' +
      '  1) Register an app at https://www.strava.com/settings/api\n' +
      '  2) Add the values to apps/web/.env.local\n' +
      '  3) Re-run this script.',
  );
}
if (!DB_URL) {
  die('Missing DATABASE_URL (or POSTGRES_URL) in apps/web/.env.local.');
}

async function getUserId() {
  if (process.env.USER_ID) return process.env.USER_ID.trim();
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question('Enter your auth user UUID: ');
  rl.close();
  return answer.trim();
}

async function main() {
  const userId = await getUserId();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    die(`USER_ID does not look like a UUID: ${userId}`, 1);
  }

  const authorizeUrl =
    `https://www.strava.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&approval_prompt=auto` +
    `&scope=${encodeURIComponent(SCOPE)}`;

  console.log('\n[strava-mint] Opening browser to authorize…');
  console.log(`  ${authorizeUrl}\n`);

  // darwin: `open <url>`. CLAUDE.md project context confirms darwin-only tool.
  exec(`open '${authorizeUrl}'`);

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const c = url.searchParams.get('code');
      const errParam = url.searchParams.get('error');
      if (errParam) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Strava error: ${errParam}`);
        server.close();
        reject(new Error(`Strava OAuth error: ${errParam}`));
        return;
      }
      if (!c) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('No code in callback.');
        server.close();
        reject(new Error('No code parameter in callback URL.'));
        return;
      }
      res
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end('<h1>Strava connected.</h1><p>You can close this tab.</p>');
      server.close();
      resolve(c);
    });
    server.listen(PORT, () => {
      console.log(`[strava-mint] Listening on http://localhost:${PORT}/callback`);
    });
    server.on('error', reject);
  });

  console.log('[strava-mint] Exchanging code for tokens…');
  const tokenRes = await fetch('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    die(`Token exchange failed (${tokenRes.status}): ${body}`, 2);
  }
  const tokens = await tokenRes.json();
  const { access_token, refresh_token, expires_at } = tokens;
  if (!refresh_token) die('Token response missing refresh_token.', 2);

  console.log('[strava-mint] Persisting to integration_tokens…');
  const sql = postgres(DB_URL, { prepare: false, max: 1 });
  try {
    await sql`
      INSERT INTO integration_tokens (user_id, provider, access_token, refresh_token, expires_at, created_at, updated_at)
      VALUES (
        ${userId}::uuid,
        'strava',
        ${access_token},
        ${refresh_token},
        ${new Date(expires_at * 1000)},
        now(),
        now()
      )
      ON CONFLICT (user_id, provider) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = now();
    `;
  } catch (e) {
    die(`DB write failed: ${e.message}`, 3);
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(
    '\n[strava-mint] Done — refresh_token persisted. Strava panel should now load on next /insights visit.\n',
  );
}

main().catch((e) => die(e.message || String(e), 1));
