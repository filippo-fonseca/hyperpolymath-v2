import { describe, expect, it } from "vitest";
import { GoveeApiError, GoveeClient } from "../client";

const device = { sku: "H618A", device: "device-id" };

function mockFetcher(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return ((url, init) => handler(String(url), init)) as typeof fetch;
}

describe("GoveeClient", () => {
  it("sends the Govee capability control envelope for RGB color", async () => {
    let request: { url?: string; init?: RequestInit } = {};
    const client = new GoveeClient({
      apiKey: "secret",
      fetch: mockFetcher(async (url, init) => {
        request = { url, init };
        return new Response(JSON.stringify({ code: 200, msg: "success", payload: {} }), {
          status: 200,
        });
      }),
    });

    await client.setColor(device, 0xff0080);

    expect(request.url).toBe("https://openapi.api.govee.com/router/api/v1/device/control");
    expect(new Headers(request.init?.headers).get("Govee-API-Key")).toBe("secret");
    const body = JSON.parse(String(request.init?.body));
    expect(body.payload.sku).toBe("H618A");
    expect(body.payload.device).toBe("device-id");
    expect(body.payload.capability).toEqual({
      type: "devices.capabilities.color_setting",
      instance: "colorRgb",
      value: 0xff0080,
    });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("maps power on/off to 1 and 0", async () => {
    const bodies: unknown[] = [];
    const client = new GoveeClient({
      apiKey: "secret",
      fetch: mockFetcher(async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ code: 200, msg: "success" }), { status: 200 });
      }),
    });

    await client.setPower(device, true);
    await client.setPower(device, false);

    expect((bodies[0] as { payload: { capability: { value: number } } }).payload.capability.value).toBe(
      1,
    );
    expect((bodies[1] as { payload: { capability: { value: number } } }).payload.capability.value).toBe(
      0,
    );
  });

  it("sends segmented brightness payload", async () => {
    let body: { payload: { capability: unknown } } | undefined;
    const client = new GoveeClient({
      apiKey: "secret",
      fetch: mockFetcher(async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ code: 200, msg: "success" }), { status: 200 });
      }),
    });

    await client.setSegmentBrightness(device, [0, 1, 2], 50);

    expect(body?.payload.capability).toEqual({
      type: "devices.capabilities.segment_color_setting",
      instance: "segmentedBrightness",
      value: { segment: [0, 1, 2], brightness: 50 },
    });
  });

  it("surfaces API errors without leaking the API key on 401", async () => {
    const client = new GoveeClient({
      apiKey: "super-secret-key-do-not-leak",
      fetch: mockFetcher(
        async () =>
          new Response(JSON.stringify({ code: 401, message: "Unauthorized" }), { status: 401 }),
      ),
    });

    await expect(client.listDevices()).rejects.toThrow(/Unauthorized/);
    await expect(client.listDevices()).rejects.toMatchObject({ status: 401 });
    try {
      await client.listDevices();
    } catch (error) {
      expect(String(error)).not.toContain("super-secret-key-do-not-leak");
      expect(error).toBeInstanceOf(GoveeApiError);
    }
  });

  it("retries control calls on 429 with Retry-After", async () => {
    let attempts = 0;
    const client = new GoveeClient({
      apiKey: "secret",
      fetch: mockFetcher(async () => {
        attempts += 1;
        if (attempts === 1) {
          return new Response(JSON.stringify({ code: 429, message: "Too Many Requests" }), {
            status: 429,
            headers: { "Retry-After": "0" },
          });
        }
        return new Response(JSON.stringify({ code: 200, msg: "success" }), { status: 200 });
      }),
      retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 },
    });

    await client.setPower(device, true);
    expect(attempts).toBe(2);
  });

  it("does not retry 401 control errors", async () => {
    let attempts = 0;
    const client = new GoveeClient({
      apiKey: "secret",
      fetch: mockFetcher(async () => {
        attempts += 1;
        return new Response(JSON.stringify({ code: 401, message: "Unauthorized" }), {
          status: 401,
        });
      }),
      retry: { maxRetries: 3 },
    });

    await expect(client.setPower(device, true)).rejects.toThrow(/Unauthorized/);
    expect(attempts).toBe(1);
  });

  it("activates a scene by case-insensitive name match", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const client = new GoveeClient({
      apiKey: "secret",
      fetch: mockFetcher(async (url, init) => {
        requests.push({
          path: url,
          body: JSON.parse(String(init?.body)),
        });
        if (url.endsWith("/device/scenes")) {
          return new Response(
            JSON.stringify({
              code: 200,
              payload: {
                sku: "H618A",
                device: "device-id",
                capabilities: [
                  {
                    type: "devices.capabilities.dynamic_scene",
                    instance: "lightScene",
                    parameters: {
                      options: [
                        { name: "Sunrise", value: 1001 },
                        { name: "Aurora", value: 1002 },
                      ],
                    },
                  },
                ],
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ code: 200, msg: "success" }), { status: 200 });
      }),
    });

    await client.activateScene(device, "sunrise");

    const control = requests.find((request) => request.path.endsWith("/device/control"));
    expect(
      (control?.body as { payload: { capability: { instance: string; value: number } } }).payload
        .capability,
    ).toEqual({
      type: "devices.capabilities.dynamic_scene",
      instance: "lightScene",
      value: 1001,
    });
  });
});
