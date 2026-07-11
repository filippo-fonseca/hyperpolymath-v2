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

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
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

export default function WeatherWidget(): React.ReactElement {
  const { data, error, isLoading } = useQuery({
    queryKey: ["studio", "weather"],
    queryFn: () => fetchStudioWidget<Receipt>("/api/studio/weather"),
    refetchInterval: 15 * 60 * 1000,
  });

  if (isLoading) {
    return <div style={{ height: "100%", background: STUDIO_COLORS.surface }} />;
  }

  if (error || !data) {
    return (
      <div
        style={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 20,
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            color: STUDIO_COLORS.text,
            fontFamily: STUDIO_MONO,
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Weather unavailable
        </p>
        <p
          style={{
            margin: 0,
            maxWidth: 240,
            color: STUDIO_COLORS.muted,
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          {error?.message ?? "No reading returned"}
        </p>
      </div>
    );
  }

  const weather = data.weather;
  const Glyph = conditionGlyph(weather.condition);
  const forecast = weather.forecast?.filter((day) => Number.isFinite(day.highC));

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 16,
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            color: STUDIO_COLORS.muted,
            fontFamily: STUDIO_MONO,
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          {weather.location}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 6,
          }}
        >
          <div
            style={{
              color: STUDIO_COLORS.text,
              fontFamily: STUDIO_MONO,
              fontSize: 52,
              fontWeight: 300,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {weather.tempF}°
          </div>
          <Glyph
            size={38}
            strokeWidth={1.4}
            color={STUDIO_COLORS.accent}
            aria-hidden
            style={{
              filter: `drop-shadow(0 0 10px color-mix(in srgb, ${STUDIO_COLORS.accent} 40%, transparent))`,
            }}
          />
        </div>
        <p
          style={{
            margin: "8px 0 0",
            color: STUDIO_COLORS.text,
            fontSize: 12.5,
            textTransform: "capitalize",
          }}
        >
          {weather.condition}
        </p>
      </div>

      {forecast && forecast.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(forecast.length, 4)}, minmax(0, 1fr))`,
            gap: 4,
            paddingTop: 12,
            borderTop: `1px solid ${STUDIO_COLORS.rule}`,
          }}
        >
          {forecast.slice(0, 4).map((day, index) => (
            <div
              key={day.date}
              title={day.condition}
              style={{
                textAlign: "center",
                fontFamily: STUDIO_MONO,
                fontSize: 9,
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: index === 0 ? STUDIO_COLORS.accent : STUDIO_COLORS.muted,
                }}
              >
                {index === 0
                  ? "NOW"
                  : new Date(`${day.date}T12:00:00`)
                      .toLocaleDateString([], { weekday: "short" })
                      .toUpperCase()}
              </p>
              <p style={{ margin: "5px 0 0", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(day.highC)}°{" "}
                <span style={{ color: STUDIO_COLORS.muted }}>
                  {Math.round(day.lowC)}°
                </span>
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
            borderTop: `1px solid ${STUDIO_COLORS.rule}`,
            color: STUDIO_COLORS.muted,
            fontFamily: STUDIO_MONO,
            fontSize: 10,
            letterSpacing: "0.08em",
          }}
        >
          <span
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            title="Wind speed"
          >
            <Wind size={12} strokeWidth={1.6} aria-hidden />
            <span
              style={{
                color: STUDIO_COLORS.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {weather.windKph}
            </span>
            km/h
          </span>
          <span title="Temperature in Celsius">
            <span
              style={{
                color: STUDIO_COLORS.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {weather.tempC}
            </span>
            °C
          </span>
        </div>
      )}
    </div>
  );
}
