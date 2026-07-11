"use client";

import { useQuery } from "@tanstack/react-query";
import { STUDIOLO } from "../../materials/tokens";
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
  if (isLoading) return <div className="h-full animate-pulse opacity-20" style={{ background: STUDIOLO.moonlace }} />;
  if (error || !data) return <p className="p-4 text-xs" style={{ color: STUDIOLO.emberAlarm }}>{error?.message ?? "Weather unavailable"}</p>;
  const weather = data.weather;
  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: STUDIOLO.moonlace }}>{weather.location}</p>
        <div className="mt-1 font-mono text-5xl font-light" style={{ color: STUDIOLO.parchment }}>{weather.tempF}°</div>
        <p className="mt-1 text-xs">{weather.condition} · {weather.windKph} km/h</p>
      </div>
      <div className="grid grid-cols-3 gap-1 border-t pt-3" style={{ borderColor: `color-mix(in srgb, ${STUDIOLO.brass} 18%, transparent)` }}>
        {weather.forecast.map((day) => (
          <div key={day.date} className="text-center font-mono text-[9px]">
            <p style={{ color: STUDIOLO.moonlace }}>{new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: "short" })}</p>
            <p className="mt-1">{day.highC}° <span style={{ color: STUDIOLO.moonlace }}>{day.lowC}°</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}
