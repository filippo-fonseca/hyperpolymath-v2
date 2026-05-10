"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { updateGraduationYear } from "@/app/(app)/settings/actions";

export function SettingsForm({ currentYear }: { currentYear: number }) {
  const [year, setYear] = useState(currentYear);
  const baseYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => baseYear - 2 + i);

  return (
    <form action={updateGraduationYear} className="space-y-3">
      <select
        name="graduation_year"
        value={year}
        onChange={(e) => setYear(parseInt(e.target.value, 10))}
        className="w-full px-3 py-2 border border-neutral-300 rounded-md font-serif"
      >
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <Button type="submit" size="sm">Save</Button>
    </form>
  );
}
