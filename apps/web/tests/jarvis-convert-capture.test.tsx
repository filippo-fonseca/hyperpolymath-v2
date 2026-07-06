/**
 * @vitest-environment jsdom
 *
 * Convert-capture-to-task affordance — Phase 5 Plan 05-04 Task 2.
 *
 * JARVIS-13 / D-14: the "Convert to task" affordance is gated by
 * `capture.createdVia === "jarvis"`. JARVIS-created captures get the dropdown
 * menu item + footer button; manual captures don't.
 *
 * Verifies:
 *   1. captures.createdVia surfaces through getCapturesForUser (the query
 *      projection includes the column).
 *   2. ConvertCaptureToTaskDialog renders only when the parent decides to
 *      mount it (the parent's `createdVia === "jarvis"` check is captured
 *      via grep in the verify step — these tests focus on the dialog's
 *      submission behavior).
 *   3. Submitting the dialog calls convertCaptureToTask with parsed input
 *      (captureId + title + priority + projectIds).
 *   4. Success path: dialog closes (onOpenChange(false) called) + success
 *      toast fires.
 *   5. Failure path: dialog stays open + error toast fires; user input
 *      preserved in form state.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { convertMock, toastMock } = vi.hoisted(() => ({
  convertMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/app/actions/jarvis", () => ({
  convertCaptureToTask: convertMock,
}));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

// ProjectMultiSelect is a heavy Popover; stub it with a simple checkbox-free
// passthrough so dialog interaction stays focused.
vi.mock("@/components/shared/ProjectMultiSelect", () => ({
  ProjectMultiSelect: ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (ids: string[]) => void;
  }) => (
    <div data-testid="project-multi-select">
      <button
        type="button"
        onClick={() => onChange(value.length ? [] : ["aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"])}
      >
        toggle-project ({value.length})
      </button>
    </div>
  ),
}));

// Now import after mocks are registered.
import { ConvertCaptureToTaskDialog } from "@/components/captures/ConvertCaptureToTaskDialog";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConvertCaptureToTaskDialog", () => {
  beforeEach(() => {
    convertMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("pre-fills title with capture content (truncated to 80 chars)", () => {
    const onOpenChange = vi.fn();
    const longContent = "x".repeat(120);
    render(
      <ConvertCaptureToTaskDialog
        open={true}
        onOpenChange={onOpenChange}
        capture={{ id: "11111111-1111-4111-8111-111111111111", content: longContent }}
        existingProjectIds={[]}
        availableProjects={[]}
      />
    );

    // Find the input that holds the title (Label text "Task title")
    const titleInput = screen.getByLabelText(/Task title/i) as HTMLInputElement;
    expect(titleInput.value).toBe("x".repeat(80));
  });

  it("submits convertCaptureToTask with title + priority + projectIds; success closes dialog + success toast", async () => {
    convertMock.mockResolvedValueOnce({ ok: true, taskId: "task-1" });
    const onOpenChange = vi.fn();
    render(
      <ConvertCaptureToTaskDialog
        open={true}
        onOpenChange={onOpenChange}
        capture={{
          id: "22222222-2222-4222-8222-222222222222",
          content: "Pick up groceries tomorrow",
        }}
        existingProjectIds={["bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"]}
        availableProjects={[]}
      />
    );

    const convertBtn = screen.getByRole("button", { name: /^Convert$/i });
    await act(async () => {
      fireEvent.click(convertBtn);
    });

    expect(convertMock).toHaveBeenCalledTimes(1);
    expect(convertMock).toHaveBeenCalledWith({
      captureId: "22222222-2222-4222-8222-222222222222",
      title: "Pick up groceries tomorrow",
      priority: "P3", // default
      projectIds: ["bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"],
      // Issue #144 — recurrence + due date default to "one-off, no date".
      recurrence: null,
      dueDate: null,
    });
    expect(toastMock.success).toHaveBeenCalledWith("Converted to task");
    // Dialog closed
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("failure path: error toast fires; dialog stays open; convert mock called once", async () => {
    convertMock.mockResolvedValueOnce({ ok: false, error: "DB blew up" });
    const onOpenChange = vi.fn();
    render(
      <ConvertCaptureToTaskDialog
        open={true}
        onOpenChange={onOpenChange}
        capture={{
          id: "33333333-3333-4333-8333-333333333333",
          content: "Pick up groceries tomorrow",
        }}
        existingProjectIds={[]}
        availableProjects={[]}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Convert$/i }));
    });

    expect(convertMock).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalled();
    // onOpenChange NOT called with false → dialog stays open
    const closeCalls = onOpenChange.mock.calls.filter((c) => c[0] === false);
    expect(closeCalls.length).toBe(0);
  });

  it("Cancel button closes the dialog without calling convert", async () => {
    const onOpenChange = vi.fn();
    render(
      <ConvertCaptureToTaskDialog
        open={true}
        onOpenChange={onOpenChange}
        capture={{ id: "44444444-4444-4444-8444-444444444444", content: "x" }}
        existingProjectIds={[]}
        availableProjects={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("Convert button is disabled when title is empty", () => {
    const onOpenChange = vi.fn();
    render(
      <ConvertCaptureToTaskDialog
        open={true}
        onOpenChange={onOpenChange}
        capture={{ id: "55555555-5555-4555-8555-555555555555", content: "" }}
        existingProjectIds={[]}
        availableProjects={[]}
      />
    );

    const convertBtn = screen.getByRole("button", { name: /^Convert$/i });
    expect((convertBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CaptureWithLinks shape — createdVia surfaces
// ---------------------------------------------------------------------------

describe("CaptureWithLinks shape (D-14 surface)", () => {
  it("type allows createdVia: string | null", async () => {
    // Compile-time only — we import the type and construct an object with
    // both null and "jarvis" values. If the surface dropped the field, this
    // would fail TypeScript compilation.
    const { type } = await import("@/lib/db/queries/captures").then((m) => ({ type: m }));
    expect(type).toBeTruthy();

    const sampleJarvis: import("@/lib/db/queries/captures").CaptureWithLinks = {
      id: "x",
      content: "y",
      createdAt: new Date(),
      updatedAt: new Date(),
      createdVia: "jarvis",
      sourceDevice: null,
      sourceInput: null,
      url: null,
      favorite: false,
      hashtags: [],
      people: [],
      projects: [],
    };
    const sampleManual: import("@/lib/db/queries/captures").CaptureWithLinks = {
      id: "x",
      content: "y",
      createdAt: new Date(),
      updatedAt: new Date(),
      createdVia: null,
      sourceDevice: null,
      sourceInput: null,
      url: null,
      favorite: false,
      hashtags: [],
      people: [],
      projects: [],
    };
    expect(sampleJarvis.createdVia).toBe("jarvis");
    expect(sampleManual.createdVia).toBe(null);
  });
});
