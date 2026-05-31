"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "jarvis-physical-extension-enabled";
const CHANGE_EVENT = "jarvis-physical-extension-changed";

function readStoredValue(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function usePhysicalExtensionSetting(): {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
} {
  const [enabled, setEnabledState] = useState<boolean>(false);

  useEffect(() => {
    setEnabledState(readStoredValue());

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setEnabledState(Boolean(detail));
    };
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, { detail: value }));
    setEnabledState(value);
  }, []);

  return { enabled, setEnabled };
}
