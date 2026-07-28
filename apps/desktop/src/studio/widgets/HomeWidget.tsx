import * as React from "react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Lightbulb, RefreshCw } from "lucide-react";
import { WidgetIcon } from "@hyperpolymath/ui-icons";

import { SD_ACCENT, SD_FONT, SD_INK, SD_SURFACES } from "../tokens";
import { onJarvisToolCall } from "../../physical-extender/sse-client";
import { fetchStudioWidget } from "./widget-fetch";

interface HomeLight {
  name: string;
  sku: string;
  deviceId: string;
  isDefault: boolean;
  on: boolean | null;
  brightness: number | null;
  rgb: number | null;
  kelvin: number | null;
  mode?: string | null;
  stateError?: string;
}

interface Receipt extends Record<string, unknown> {
  devices: HomeLight[];
  count: number;
  connected: boolean;
  hint?: string;
}

const shellStyle: React.CSSProperties = {
  height: "100%",
  background: SD_SURFACES.box,
};

function rgbToCss(rgb: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, Math.floor(rgb)));
  return `#${clamped.toString(16).padStart(6, "0")}`;
}

function swatchColor(light: HomeLight): string | null {
  if (light.rgb != null) return rgbToCss(light.rgb);
  if (light.kelvin != null) {
    // Warm-to-cool white approximation for kelvin-only bulbs.
    const t = Math.max(0, Math.min(1, (light.kelvin - 2000) / 7000));
    const warm = { r: 255, g: 197, b: 143 };
    const cool = { r: 214, g: 226, b: 255 };
    const r = Math.round(warm.r + (cool.r - warm.r) * t);
    const g = Math.round(warm.g + (cool.g - warm.g) * t);
    const b = Math.round(warm.b + (cool.b - warm.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return null;
}

function HomeNotice({
  headline,
  detail,
}: {
  headline: string;
  detail?: string;
}): React.ReactElement {
  return (
    <div
      style={{
        ...shellStyle,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 20,
        textAlign: "center",
      }}
    >
      <span style={{ opacity: 0.4, lineHeight: 0 }}>
        <WidgetIcon size={40} />
      </span>
      <p
        style={{
          margin: 0,
          color: SD_INK.faint,
          fontFamily: SD_FONT.mono,
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {headline}
      </p>
      {detail ? (
        <p
          style={{
            margin: 0,
            maxWidth: 260,
            color: SD_INK.dull,
            fontFamily: SD_FONT.sans,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function HomeSkeleton(): React.ReactElement {
  const reduced = useReducedMotion();
  return (
    <div style={{ padding: 0 }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          style={{
            padding: "12px",
            borderBottom: `1px solid ${SD_SURFACES.line}`,
          }}
        >
          {[9, "62%", "40%"].map((width, row) => (
            <motion.div
              key={row}
              style={{
                height: row === 0 ? 7 : 11,
                width: typeof width === "number" ? 96 : width,
                marginBottom: row === 2 ? 0 : 7,
                borderRadius: 3,
                background: SD_SURFACES.input,
              }}
              animate={reduced ? undefined : { opacity: [0.4, 0.8, 0.4] }}
              transition={{
                duration: 1.4,
                delay: index * 0.08,
                ease: "easeInOut",
                repeat: Infinity,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function LightRow({ light }: { light: HomeLight }): React.ReactElement {
  const color = swatchColor(light);
  const powerLabel =
    light.on === true ? "On" : light.on === false ? "Off" : light.stateError ? "—" : "—";
  const powerInk =
    light.on === true ? SD_ACCENT : light.on === false ? SD_INK.faint : SD_INK.dull;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderBottom: `1px solid ${SD_SURFACES.line}`,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          flexShrink: 0,
          border: `1px solid ${SD_SURFACES.line}`,
          background:
            color ??
            (light.on === true
              ? `color-mix(in srgb, ${SD_ACCENT} 28%, ${SD_SURFACES.input})`
              : SD_SURFACES.input),
          boxShadow: light.on ? `inset 0 0 0 1px color-mix(in srgb, ${SD_ACCENT} 35%, transparent)` : undefined,
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 3,
          }}
        >
          <p
            style={{
              margin: 0,
              overflow: "hidden",
              color: SD_INK.base,
              fontFamily: SD_FONT.sans,
              fontSize: 13,
              fontWeight: 600,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {light.name}
          </p>
          {light.isDefault ? (
            <span
              style={{
                flexShrink: 0,
                color: SD_INK.faint,
                fontFamily: SD_FONT.mono,
                fontSize: 9,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Default
            </span>
          ) : null}
        </div>
        <p
          style={{
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: SD_INK.dull,
            fontFamily: SD_FONT.mono,
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <Lightbulb size={11} strokeWidth={1.75} color={powerInk} aria-hidden />
          <span style={{ color: powerInk }}>{powerLabel}</span>
          {light.brightness != null ? (
            <>
              <span aria-hidden style={{ opacity: 0.45 }}>
                ·
              </span>
              <span style={{ color: SD_INK.base, fontVariantNumeric: "tabular-nums" }}>
                {light.brightness}%
              </span>
            </>
          ) : null}
          {light.kelvin != null && light.rgb == null ? (
            <>
              <span aria-hidden style={{ opacity: 0.45 }}>
                ·
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{light.kelvin}K</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export default function HomeWidget(): React.ReactElement {
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["studio", "home"],
    queryFn: () => fetchStudioWidget<Receipt>("/api/studio/home"),
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 3_000,
  });

  // Burst refetch after mount — Govee state trails the control ACK.
  useEffect(() => {
    const t1 = window.setTimeout(() => void refetch(), 500);
    const t2 = window.setTimeout(() => void refetch(), 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [refetch]);

  // When Jarvis finishes a lights tool (SSE), refresh immediately + again after
  // Govee cloud state catches up — don't wait for the 3s poll.
  useEffect(() => {
    return onJarvisToolCall((payload) => {
      if (payload.name !== "control_lights" && payload.name !== "list_lights") return;
      void refetch();
      window.setTimeout(() => void refetch(), 700);
      window.setTimeout(() => void refetch(), 1600);
    });
  }, [refetch]);

  if (isLoading) {
    return (
      <div style={{ ...shellStyle, overflow: "hidden" }}>
        <HomeSkeleton />
      </div>
    );
  }

  if (error) {
    return <HomeNotice headline="Lights unavailable" detail={error.message} />;
  }

  const devices = data?.devices ?? [];

  if (devices.length === 0) {
    return (
      <HomeNotice
        headline="No lights yet"
        detail={data?.hint ?? "Open Settings → Lights to discover your Govee devices."}
      />
    );
  }

  return (
    <div style={{ ...shellStyle, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 10px",
          borderBottom: `1px solid ${SD_SURFACES.line}`,
        }}
      >
        <p
          style={{
            margin: 0,
            color: SD_INK.faint,
            fontFamily: SD_FONT.mono,
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {data?.connected ? "Smart lights" : "Lights (offline)"}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Refresh lights"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            padding: 0,
            border: `1px solid ${SD_SURFACES.line}`,
            borderRadius: 6,
            background: SD_SURFACES.input,
            color: SD_INK.dull,
            cursor: isFetching ? "default" : "pointer",
            opacity: isFetching ? 0.55 : 1,
          }}
        >
          <RefreshCw size={13} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {data?.hint && !data.connected ? (
        <p
          style={{
            margin: 0,
            padding: "8px 12px",
            borderBottom: `1px solid ${SD_SURFACES.line}`,
            color: SD_INK.dull,
            fontFamily: SD_FONT.sans,
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          {data.hint}
        </p>
      ) : null}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {devices.map((light) => (
          <LightRow key={`${light.sku}:${light.deviceId}`} light={light} />
        ))}
      </div>
    </div>
  );
}
