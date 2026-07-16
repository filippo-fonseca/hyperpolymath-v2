import { describe, it, expect } from "vitest";
import { isPrivateAddress } from "@/lib/link-preview/ssrf";

describe("isPrivateAddress", () => {
  it("blocks private / loopback / link-local / reserved IPv4", () => {
    // loopback
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    // RFC1918
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("172.16.0.1")).toBe(true);
    expect(isPrivateAddress("192.168.1.1")).toBe(true);
    // link-local / cloud metadata
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    // unspecified
    expect(isPrivateAddress("0.0.0.0")).toBe(true);
    // CGNAT 100.64.0.0/10
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    // TEST-NET-1
    expect(isPrivateAddress("192.0.2.1")).toBe(true);
    // reserved 240/4
    expect(isPrivateAddress("240.0.0.1")).toBe(true);
  });

  it("blocks private / loopback / link-local / unique-local IPv6", () => {
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fc00::1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("::")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 that map to a blocked v4 address", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows public IPv4 and IPv6 addresses", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false);
  });

  it("fails closed on non-IP input", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
    expect(isPrivateAddress("example.com")).toBe(true);
  });
});
