import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nativeFetch: vi.fn(),
  getDeviceToken: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.nativeFetch }));
vi.mock("../auth/device-token", () => ({
  getDeviceToken: mocks.getDeviceToken,
}));
vi.mock("../env", () => ({
  getEnv: () => ({
    apiBaseUrl: "http://localhost:3000/",
    triggerSecret: "legacy-secret",
  }),
}));

import { studioFetch } from "./studio-fetch";

beforeEach(() => {
  mocks.nativeFetch.mockReset();
  mocks.getDeviceToken.mockReset();
  mocks.getDeviceToken.mockResolvedValue("hpd_test_token");
  mocks.nativeFetch.mockResolvedValue(new Response(null, { status: 204 }));
});

describe("studioFetch", () => {
  it("prefixes the API base and applies desktop authentication", async () => {
    await studioFetch("/api/studio/weather", {
      headers: { accept: "application/json" },
    });

    expect(mocks.nativeFetch).toHaveBeenCalledOnce();
    const [url, init] = mocks.nativeFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe("http://localhost:3000/api/studio/weather");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer hpd_test_token");
    expect(headers.get("x-trigger-secret")).toBe("legacy-secret");
  });
});
