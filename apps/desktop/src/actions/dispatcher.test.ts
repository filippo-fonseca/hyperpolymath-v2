import { describe, expect, it } from "vitest";

import { routeOpenUrl } from "./dispatcher";

// The URL-leak fix hinges on this routing table: http(s) pages go to the
// in-app browser WIDGET when Studio is up; non-http schemes and the
// Studio-unavailable case fall back to the SYSTEM browser.
describe("routeOpenUrl", () => {
  const cases: Array<{
    url: string;
    studioAvailable: boolean;
    expected: "widget" | "system";
    why: string;
  }> = [
    {
      url: "https://www.bbc.co.uk/sport/football",
      studioAvailable: true,
      expected: "widget",
      why: "https page + Studio up → in-app widget (no system-browser leak)",
    },
    {
      url: "http://example.com/path?q=1",
      studioAvailable: true,
      expected: "widget",
      why: "plain http is still a web page → widget",
    },
    {
      url: "https://www.bbc.co.uk/sport/football",
      studioAvailable: false,
      expected: "system",
      why: "Studio down → fall back to the system browser",
    },
    {
      url: "mailto:hello@example.com",
      studioAvailable: true,
      expected: "system",
      why: "mailto: can't render in the browser widget → system opener",
    },
    {
      url: "tel:+15551234567",
      studioAvailable: true,
      expected: "system",
      why: "tel: is a non-web scheme → system opener",
    },
    {
      url: "facetime:user@example.com",
      studioAvailable: true,
      expected: "system",
      why: "custom app deep link → system opener",
    },
    {
      url: "not a url",
      studioAvailable: true,
      expected: "system",
      why: "unparseable URL → safe system-opener fallback",
    },
    {
      url: "mailto:hello@example.com",
      studioAvailable: false,
      expected: "system",
      why: "non-http stays system regardless of Studio availability",
    },
  ];

  for (const { url, studioAvailable, expected, why } of cases) {
    it(`${expected} — ${why}`, () => {
      expect(routeOpenUrl(url, { studioAvailable })).toBe(expected);
    });
  }
});
