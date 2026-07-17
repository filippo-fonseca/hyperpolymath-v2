import { semesterTermEnum } from "@/lib/db/enums";

export type SemesterTerm = (typeof semesterTermEnum.enumValues)[number];

/** Today as a UTC ISO date (YYYY-MM-DD), matching the list components. */
export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Last plausible day of an academic term, as an ISO date. Deliberately the end
 * of the term's final month so an in-progress semester is never prematurely
 * treated as past:
 *   fall   → Dec 31 of its year
 *   spring → May 31 of its year
 *   summer → Aug 31 of its year
 */
export function semesterEndISO(term: SemesterTerm, year: number): string {
  switch (term) {
    case "fall":
      return `${year}-12-31`;
    case "spring":
      return `${year}-05-31`;
    case "summer":
      return `${year}-08-31`;
  }
}

/**
 * First plausible day of an academic term, as an ISO date. The mirror of
 * `semesterEndISO`: where that one takes the end of the term's final month,
 * this takes the start of the term's first month, so a class anchored only by
 * its semester spans the whole term and never starts late:
 *   fall   → Sep 1 of its year
 *   spring → Jan 1 of its year
 *   summer → Jun 1 of its year
 * Together the three terms tile the calendar year without overlapping.
 */
export function semesterStartISO(term: SemesterTerm, year: number): string {
  switch (term) {
    case "fall":
      return `${year}-09-01`;
    case "spring":
      return `${year}-01-01`;
    case "summer":
      return `${year}-06-01`;
  }
}

export interface ProjectExpiryFields {
  isClass: boolean;
  endDate: string | null;
  semesterTerm: SemesterTerm | null;
  semesterYear: number | null;
}

/**
 * The date a project effectively "ends": a class uses its semester's end,
 * everything else uses its explicit end date. Null when nothing bounds it.
 */
export function projectEffectiveEndISO(p: ProjectExpiryFields): string | null {
  if (p.isClass && p.semesterTerm && p.semesterYear != null) {
    return semesterEndISO(p.semesterTerm, p.semesterYear);
  }
  return p.endDate;
}

/** True once a project's effective end date has passed. Ignores archivedAt. */
export function isProjectExpired(
  p: ProjectExpiryFields,
  today: string = todayISODate(),
): boolean {
  const end = projectEffectiveEndISO(p);
  return end != null && end < today;
}
