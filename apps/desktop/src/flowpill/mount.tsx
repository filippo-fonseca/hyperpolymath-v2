import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DEFAULT_CORNER, loadCorner } from "./corner";
import { FlowPill } from "./FlowPill";
import { createLevelBus, type LevelBus } from "./level-bus";
import { createFlowPillStore, type FlowPillStore } from "./store";
import type {
  FlowPillCorner,
  FlowPillEvent,
  FlowPillState,
  LevelSource,
} from "./types";

/**
 * mount.tsx — the pill's public surface.
 *
 * This unit owns what the user sees and nothing else. It does not open the
 * microphone, it does not call speech-to-text, and it does not post to JARVIS.
 * A controller wires those up by taking the handle returned here, subscribing
 * to `store.onEffect`, and performing `start-capture`, `stop-capture`,
 * `discard`, `send`, `show` and `hide` against units u0 and u2.
 *
 * `dismiss-after` never reaches the controller; the store keeps that one,
 * because how long a checkmark lingers is this unit's business.
 */

export interface FlowPillHandle {
  /** The running machine. Subscribe to `onEffect` to drive audio and the window. */
  readonly store: FlowPillStore;
  dispatch(event: FlowPillEvent): void;
  getState(): FlowPillState;
  /** Publish one 0..1 RMS frame to the waveform. */
  pushLevel(level: number): void;
  /** Pipe a capture handle's level stream in. Returns a detach function. */
  attachLevelSource(source: LevelSource): () => void;
  /** Tell the pill which corner the window is parked in, so it anchors right. */
  setCorner(corner: FlowPillCorner): void;
  unmount(): void;
}

export interface MountOptions {
  /** Inject a pre-built store. Used by the dev harness to freeze the fades. */
  store?: FlowPillStore;
  /** Skip the async corner read (which needs u0's command). */
  corner?: FlowPillCorner;
}

interface AppProps {
  store: FlowPillStore;
  levels: LevelBus;
  initialCorner: FlowPillCorner;
  cornerSignal: { subscribe(listener: (corner: FlowPillCorner) => void): () => void };
  readCorner: boolean;
}

function App({ store, levels, initialCorner, cornerSignal, readCorner }: AppProps) {
  const [state, setState] = useState<FlowPillState>(() => store.getState());
  const [corner, setCorner] = useState<FlowPillCorner>(initialCorner);

  useEffect(() => store.subscribe(setState), [store]);
  useEffect(() => cornerSignal.subscribe(setCorner), [cornerSignal]);

  useEffect(() => {
    if (!readCorner) return;
    let live = true;
    void loadCorner().then((persisted) => {
      if (live) setCorner(persisted);
    });
    return () => {
      live = false;
    };
  }, [readCorner]);

  return (
    <FlowPill
      state={state}
      levels={levels}
      corner={corner}
      onCancel={() => store.dispatch({ type: "cancel" })}
      onDone={() => store.dispatch({ type: "end" })}
    />
  );
}

export function mountFlowPill(
  container: HTMLElement,
  options: MountOptions = {},
): FlowPillHandle {
  const store = options.store ?? createFlowPillStore();
  const levels = createLevelBus();

  const cornerListeners = new Set<(corner: FlowPillCorner) => void>();
  const cornerSignal = {
    subscribe(listener: (corner: FlowPillCorner) => void) {
      cornerListeners.add(listener);
      return () => {
        cornerListeners.delete(listener);
      };
    },
  };

  let root: Root | null = createRoot(container);
  root.render(
    <App
      store={store}
      levels={levels}
      initialCorner={options.corner ?? DEFAULT_CORNER}
      cornerSignal={cornerSignal}
      readCorner={options.corner === undefined}
    />,
  );

  return {
    store,
    dispatch: (event) => store.dispatch(event),
    getState: () => store.getState(),
    pushLevel: (level) => levels.push(level),
    attachLevelSource: (source) => levels.pipe(source),
    setCorner(corner) {
      for (const listener of [...cornerListeners]) listener(corner);
    },
    unmount() {
      store.destroy();
      levels.clear();
      cornerListeners.clear();
      root?.unmount();
      root = null;
    },
  };
}
