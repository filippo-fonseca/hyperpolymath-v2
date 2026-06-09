#!/usr/bin/env node
/**
 * Generate an Ed25519 keypair for laptop ↔ Hyperpolymath sync auth.
 *
 * Run ONCE on the laptop that will do the syncing. Writes the private key
 * to ~/.hyperpolymath/sync-private.pem (chmod 600), prints the public key
 * to stdout — copy that into apps/web/.env.local AND your deployed
 * environment as CLAUDE_SYNC_PUBLIC_KEY.
 *
 * Re-running overwrites the existing private key — only do that if you
 * want to rotate (you'll also need to swap the public key on the server).
 *
 *   $ node tools/sync-keygen.mjs
 */
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const DIR = path.join(homedir(), '.hyperpolymath');
const PRIV_PATH = path.join(DIR, 'sync-private.pem');

if (existsSync(PRIV_PATH)) {
  const overwrite = process.argv.includes('--force');
  if (!overwrite) {
    console.error(
      `Private key already exists at ${PRIV_PATH}. Pass --force to overwrite (and rotate the server's public key).`,
    );
    process.exit(1);
  }
}

mkdirSync(DIR, { recursive: true, mode: 0o700 });

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });

writeFileSync(PRIV_PATH, privPem, { mode: 0o600 });

console.log(`[sync-keygen] private key written to ${PRIV_PATH} (chmod 600)\n`);
console.log('[sync-keygen] copy the PUBLIC KEY below into apps/web/.env.local');
console.log('              and your Vercel env as CLAUDE_SYNC_PUBLIC_KEY.');
console.log('              Use a quoted single-line form (the PEM has newlines).\n');

// Emit a single-line, env-file-safe form: replace newlines with literal \n
// so it can sit on one line in .env.local.
const oneLine = pubPem.toString().replace(/\n/g, '\\n').trim();
console.log(`CLAUDE_SYNC_PUBLIC_KEY="${oneLine}"\n`);
