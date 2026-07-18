import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { WeatherIcon } from "@hyperpolymath/ui-icons";

import { SD_ACCENT, SD_FONT, SD_INK, SD_SURFACES } from "../tokens";
import { fetchStudioWidget } from "./widget-fetch";

interface Forecast {
  date: string;
  condition?: string;
  highC: number;
  lowC: number;
}

interface Weather {
  location: string;
  tempC: number;
  tempF: number;
  condition: string;
  windKph: number;
  forecast?: Forecast[];
}

interface Receipt extends Record<string, unknown> {
  weather: Weather;
}

/** Map a human weather phrase to the closest HUD glyph. */
function conditionGlyph(condition: string): LucideIcon {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return CloudLightning;
  if (c.includes("snow")) return CloudSnow;
  if (c.includes("rain")) return CloudRain;
  if (c.includes("drizzl")) return CloudDrizzle;
  if (c.includes("fog")) return CloudFog;
  if (c.includes("overcast") || c.includes("cloud")) return Cloud;
  if (c.includes("partly")) return CloudSun;
  if (c.includes("clear")) return Sun;
  return CloudSun;
}

const shellStyle: React.CSSProperties = {
  display: "flex",
  height: "100%",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: 20,
  background: SD_SURFACES.box,
};

/** Mono eyebrow + dull detail line — the shared empty/error voice (DS §9). */
function WeatherNotice({ detail }: { detail: string }): React.ReactElement {
  return (
    <div
      style={{
        ...shellStyle,
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        textAlign: "center",
      }}
    >
      {/* Empty-state icon: 40px at 40% opacity (DS §9). The dimensional icons
          take no style prop, so the opacity rides a wrapper. */}
      <span style={{ opacity: 0.4, lineHeight: 0 }}>
        <WeatherIcon size={40} />
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
        Weather unavailable
      </p>
      <p
        style={{
          margin: 0,
          maxWidth: 240,
          color: SD_INK.dull,
          fontFamily: SD_FONT.sans,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {detail}
      </p>
    </div>
  );
}

export default function WeatherWidget(): React.ReactElement {
  const { data, error, isLoading } = useQuery({
    queryKey: ["studio", "weather"],
    queryFn: () => fetchStudioWidget<Receipt>("/api/studio/weather"),
    refetchInterval: 15 * 60 * 1000,
  });

  if (isLoading) {
    return <div style={{ height: "100%", background: SD_SURFACES.box }} />;
  }

  if (error || !data) {
    return <WeatherNotice detail={error?.message ?? "No reading returned"} />;
  }

  const weather = data.weather;
  const Glyph = conditionGlyph(weather.condition);
  const forecast = weather.forecast?.filter((day) => Number.isFinite(day.highC));

  return (
    <div style={shellStyle}>
      {/* Stat tile, icon-left (DS §8): dimensional icon in its optical box, then
          the label / value / caption stack. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <WeatherIcon size={40} title="Weather" />

        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              overflow: "hidden",
              color: SD_INK.faint,
              fontFamily: SD_FONT.sans,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textOverflow: "ellipsis",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {weather.location}
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              marginTop: 2,
              color: SD_INK.base,
              fontFamily: SD_FONT.sans,
              fontSize: 34,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {weather.tempF}°
            {/* Unit on the value's baseline (DS §8), tight enough to read as
                one token rather than a stray glyph. */}
            <span
              style={{
                marginLeft: 2,
                color: SD_INK.faint,
                fontSize: 16,
                fontWeight: 500,
              }}
            >
              F
            </span>
          </div>

          <p
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              margin: "4px 0 0",
              color: SD_INK.dull,
              fontFamily: SD_FONT.sans,
              fontSize: 12,
              textTransform: "capitalize",
            }}
          >
            {/* Quiet 14px lucide: the condition is data the caption already
                names, so it stays a verb-register glyph and never competes with
                the dimensional icon above. The old accent glow is gone (§16). */}
            <Glyph size={14} strokeWidth={1.75} color={SD_INK.faint} aria-hidden />
            {weather.condition}
          </p>
        </div>
      </div>

      {forecast && forecast.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(forecast.length, 4)}, minmax(0, 1fr))`,
            gap: 4,
            paddingTop: 12,
            borderTop: `1px solid ${SD_SURFACES.line}`,
          }}
        >
          {forecast.slice(0, 4).map((day, index) => (
            <div
              key={day.date}
              title={day.condition}
              style={{ textAlign: "center", fontFamily: SD_FONT.mono, fontSize: 10 }}
            >
              <p
                style={{
                  margin: 0,
                  color: index === 0 ? SD_ACCENT : SD_INK.faint,
                  letterSpacing: "0.1em",
                }}
              >
                {index === 0
                  ? "NOW"
                  : new Date(`${day.date}T12:00:00`)
                      .toLocaleDateString([], { weekday: "short" })
                      .toUpperCase()}
              </p>
              <p
                style={{
                  margin: "5px 0 0",
                  color: SD_INK.base,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(day.highC)}°{" "}
                <span style={{ color: SD_INK.faint }}>{Math.round(day.lowC)}°</span>
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 18,
            paddingTop: 12,
            borderTop: `1px solid ${SD_SURFACES.line}`,
            color: SD_INK.faint,
            fontFamily: SD_FONT.mono,
            fontSize: 10,
            letterSpacing: "0.1em",
          }}
        >
          <span
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            title="Wind speed"
          >
            <Wind size={12} strokeWidth={1.75} aria-hidden />
            <span style={{ color: SD_INK.base, fontVariantNumeric: "tabular-nums" }}>
              {weather.windKph}
            </span>
            km/h
          </span>
          <span title="Temperature in Celsius">
            <span style={{ color: SD_INK.base, fontVariantNumeric: "tabular-nums" }}>
              {weather.tempC}
            </span>
            °C
          </span>
        </div>
      )}
    </div>
  );
}
