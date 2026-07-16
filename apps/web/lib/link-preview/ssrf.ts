// Issue #261 — SSRF guard for the server-side link-preview fetcher.
// Pure Node built-ins only (no npm deps). Two exports:
//   - isPrivateAddress(ip): classify an IP literal as unsafe (private/loopback/
//     link-local/reserved). Fails closed: a non-IP string is treated as unsafe.
//   - assertHostAllowed(url): resolve a host to its addresses and reject if the
//     host is an IP literal in a blocked range OR any resolved address is blocked.
// Used per-hop by fetchWithTimeout so a redirect into an internal target is caught.
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/** True when a dotted-quad IPv4 string is a private/loopback/link-local/reserved address. */
function isPrivateV4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return true; // malformed → fail closed
  const [a, b, c] = parts.map((p) => Number(p));
  if ([a, b, c, Number(parts[3])].some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // out-of-range octet → fail closed
  }
  if (a === 0) return true; // "this" network 0.0.0.0/8 (incl. unspecified)
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16 (cloud metadata endpoint)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918 172.16.0.0/12
  if (a === 192 && b === 168) return true; // RFC1918 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1 192.0.2.0/24
  if (a >= 224) return true; // multicast 224/4 + reserved 240/4 — not a normal public unicast
  return false;
}

/**
 * Classify an IP literal as unsafe for outbound link-preview fetches.
 * Returns true (blocked) for private/loopback/link-local/reserved ranges and for
 * any string that is not a valid IP (fail closed). Public addresses return false.
 */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) {
    const addr = ip.toLowerCase();
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — delegate to the v4 classifier so a mapped
    // literal cannot smuggle a blocked v4 address past the v6 checks.
    const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateV4(mapped[1]);
    if (addr === "::1") return true; // loopback
    if (addr === "::") return true; // unspecified
    // link-local fe80::/10 — first hextet fe80..febf
    const first = addr.split(":")[0];
    if (/^fe[89ab][0-9a-f]?$/.test(first)) return true;
    // unique-local fc00::/7 — first byte 0xfc or 0xfd
    if (/^f[cd]/.test(first)) return true;
    return false;
  }
  return true; // not an IP → fail closed
}

/**
 * Reject a URL whose host resolves to (or is) a blocked address. Resolves (no throw)
 * for a public host; throws for an IP literal in a blocked range or a hostname whose
 * DNS lookup yields no addresses or any private address (DNS-rebinding guard).
 */
export async function assertHostAllowed(url: URL): Promise<void> {
  // Strip surrounding brackets from IPv6 literals: [::1] → ::1
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) throw new Error(`Blocked address: ${host}`);
    return;
  }
  const records = await lookup(host, { all: true });
  if (records.length === 0 || records.some((r) => isPrivateAddress(r.address))) {
    throw new Error(`Blocked host resolves to private address: ${host}`);
  }
}
