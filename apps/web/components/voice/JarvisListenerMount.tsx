"use client";

import dynamic from "next/dynamic";

const JarvisListener = dynamic(
  () =>
    import("@/components/voice/JarvisListener").then((m) => ({
      default: m.JarvisListener,
    })),
  { ssr: false },
);

export function JarvisListenerMount() {
  return <JarvisListener />;
}
