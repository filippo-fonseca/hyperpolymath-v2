import { describe, it, expect } from "vitest";
import {
  classifyWhatsappSendError,
  whatsappSendFailureLine,
} from "../src/tools/whatsapp-send-error";

describe("classifyWhatsappSendError", () => {
  it("treats transport timeout/unreachable as not_connected", () => {
    expect(classifyWhatsappSendError("timeout", undefined, undefined).category).toBe(
      "not_connected",
    );
    expect(
      classifyWhatsappSendError("unreachable", undefined, undefined).category,
    ).toBe("not_connected");
  });

  it("prefers the bridge machine code over status", () => {
    // A 400 that is really a resolution failure must NOT be read as connectivity.
    expect(
      classifyWhatsappSendError("http_error", 400, { code: "not_found" }).category,
    ).toBe("not_found");
    // A 502 tagged not_connected stays connectivity.
    expect(
      classifyWhatsappSendError("http_error", 502, { code: "not_connected" }).category,
    ).toBe("not_connected");
  });

  it("carries ambiguous candidates through", () => {
    const c = classifyWhatsappSendError("http_error", 400, {
      code: "ambiguous",
      candidates: ["Emir Ahmed", "Emir Khan"],
    });
    expect(c.category).toBe("ambiguous");
    expect(c.candidates).toEqual(["Emir Ahmed", "Emir Khan"]);
  });

  it("falls back to message heuristics for an old bridge (no code)", () => {
    expect(
      classifyWhatsappSendError("http_error", 400, {
        error: 'no WhatsApp contact matches "mama"',
      }).category,
    ).toBe("not_found");
    expect(
      classifyWhatsappSendError("http_error", 400, {
        error: 'ambiguous WhatsApp contact "emir" — matched: …',
      }).category,
    ).toBe("ambiguous");
    expect(
      classifyWhatsappSendError("http_error", 502, {
        error: "not logged in — scan the QR to pair WhatsApp",
      }).category,
    ).toBe("not_connected");
  });

  it("uses status as a last resort: 5xx=not_connected, 4xx=not_found", () => {
    expect(classifyWhatsappSendError("http_error", 503, {}).category).toBe(
      "not_connected",
    );
    expect(classifyWhatsappSendError("http_error", 400, {}).category).toBe(
      "not_found",
    );
  });

  it("maps a resolved-but-unreachable recipient to not_on_whatsapp", () => {
    // Bridge is up, contact resolved, but the number/@lid can't receive on
    // WhatsApp — must be its own category, never confused with connectivity or
    // a lookup miss.
    expect(
      classifyWhatsappSendError("http_error", 400, { code: "not_on_whatsapp" }).category,
    ).toBe("not_on_whatsapp");
    expect(
      classifyWhatsappSendError("http_error", 400, {
        error: "12035085391 is not reachable on WhatsApp",
      }).category,
    ).toBe("not_on_whatsapp");
  });

  it("never reports a live bridge's contact miss as a connection failure", () => {
    // The exact regression from the bug report: bridge UP (400), contact miss.
    const c = classifyWhatsappSendError("http_error", 400, {
      code: "not_found",
      error: 'no WhatsApp contact matches "mama"',
    });
    expect(c.category).not.toBe("not_connected");
    expect(c.category).toBe("not_found");
  });
});

describe("whatsappSendFailureLine", () => {
  it("speaks distinct lines per category", () => {
    const nc = whatsappSendFailureLine({ category: "not_connected" }, "mama");
    expect(nc.toLowerCase()).toContain("isn't connected");

    const nf = whatsappSendFailureLine({ category: "not_found" }, "mama");
    expect(nf.toLowerCase()).toContain("couldn't find");
    expect(nf).toContain("mama");

    const amb = whatsappSendFailureLine(
      { category: "ambiguous", candidates: ["Emir Ahmed", "Emir Khan"] },
      "Emir",
    );
    expect(amb).toContain("Emir Ahmed");
    expect(amb).toContain("Emir Khan");
  });

  it("degrades gracefully when ambiguous has no candidate list", () => {
    const amb = whatsappSendFailureLine({ category: "ambiguous" }, "Emir");
    expect(amb.toLowerCase()).toContain("which one");
  });

  it("speaks a distinct not_on_whatsapp line naming the contact", () => {
    const line = whatsappSendFailureLine({ category: "not_on_whatsapp" }, "Emir");
    expect(line).toContain("Emir");
    expect(line.toLowerCase()).toContain("whatsapp");
    expect(line.toLowerCase()).not.toContain("isn't connected");
  });
});
