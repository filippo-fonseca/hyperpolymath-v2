"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { completeOnboarding } from "@/app/(app)/onboarding/actions";

export function OnboardingForm() {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 1 + i);
  const [selectedYear, setSelectedYear] = useState(currentYear + 4);

  return (
    <form action={completeOnboarding} className="space-y-6">
      <select
        name="graduation_year"
        value={selectedYear}
        onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
        className="w-full px-4 py-3 border border-neutral-300 rounded-md text-lg font-serif text-center"
        required
      >
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <Button type="submit" size="lg" className="w-full">Begin</Button>
    </form>
  );
}
