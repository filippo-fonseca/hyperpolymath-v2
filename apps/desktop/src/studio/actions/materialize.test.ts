import { beforeEach, describe, expect, it } from "vitest";

import type { BackgroundTask } from "@/hud/background-tasks";

import {
  __resetWidgetWindows,
  getWidgetWindows,
} from "../state/widget-windows";
import {
  __resetMaterialization,
  materializeTaskSnapshot,
  materializeToolCall,
} from "./materialize";

beforeEach(() => {
  __resetWidgetWindows();
  __resetMaterialization();
});

describe("materializeToolCall", () => {
  it("opens a browser widget for a tool result carrying a URL", () => {
    materializeToolCall({
      toolUseId: "tool-url",
      name: "open_url",
      result: {
        ok: true,
        action: { kind: "open_url", url: "https://example.com/path" },
      },
    });

    expect(getWidgetWindows()[0]).toMatchObject({
      kind: "browser",
      props: { url: "https://example.com/path" },
    });
  });

  it("materializes a generic short answer as a card", () => {
    materializeToolCall({
      toolUseId: "tool-answer",
      name: "lookup",
      result: { ok: true, receipt: { answer: "The answer is forty-two." } },
    });

    expect(getWidgetWindows()[0]).toMatchObject({
      kind: "card",
      props: { title: "JARVIS", body: "The answer is forty-two." },
    });
  });

  it("waits for confirmed WhatsApp success before showing a card", () => {
    materializeToolCall({
      toolUseId: "tool-send",
      name: "send_message",
      result: {
        ok: true,
        action: {
          kind: "send_message",
          app: "whatsapp",
          recipient: "Emir",
          text: "Landing at eight.",
          requires_confirm: true,
        },
      },
    });
    expect(getWidgetWindows()).toHaveLength(0);

    const task: BackgroundTask = {
      id: "send-task",
      kind: "send_message",
      label: "WhatsApp to Emir",
      status: "running",
      startedAt: 1,
    };
    materializeTaskSnapshot([task]);
    expect(getWidgetWindows()).toHaveLength(0);

    materializeTaskSnapshot([{ ...task, status: "done" }]);
    expect(getWidgetWindows()[0]).toMatchObject({
      kind: "card",
      props: {
        title: "WhatsApp · Sent to Emir",
        body: "Landing at eight.",
      },
    });

    materializeTaskSnapshot([{ ...task, status: "done" }]);
    expect(getWidgetWindows()).toHaveLength(1);
  });
});
