import { useQuery } from "@tanstack/react-query";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import { fetchStudioWidget } from "./widget-fetch";

interface Forecast {
  date: string;
  condition: string;
  highC: number;
  lowC: number;
}

interface Receipt extends Record<string, unknown> {
  weather: {
    location: string;
    tempC: number;
    tempF: number;
    condition: string;
    windKph: number;
    forecast: Forecast[];
  };
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
      <p style={{ padding: 16, color: STUDIO_COLORS.danger, fontSize: 12 }}>
        {error?.message ?? "Weather unavailable"}
      </p>
    );
  }
  const weather = data.weather;
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
            marginTop: 4,
            color: STUDIO_COLORS.text,
            fontFamily: STUDIO_MONO,
            fontSize: 48,
            fontWeight: 300,
          }}
        >
          {weather.tempF}°
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 12 }}>
          {weather.condition} · {weather.windKph} km/h
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 4,
          paddingTop: 12,
          borderTop: `1px solid ${STUDIO_COLORS.rule}`,
        }}
      >
        {weather.forecast.map((day) => (
          <div
            key={day.date}
            title={day.condition}
            style={{ textAlign: "center", fontFamily: STUDIO_MONO, fontSize: 9 }}
          >
            <p style={{ margin: 0, color: STUDIO_COLORS.muted }}>
              {new Date(`${day.date}T12:00:00`).toLocaleDateString([], {
                weekday: "short",
              })}
            </p>
            <p style={{ margin: "4px 0 0" }}>
              {day.highC}°{" "}
              <span style={{ color: STUDIO_COLORS.muted }}>{day.lowC}°</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
