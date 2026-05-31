export interface PhysicalTrigger {
  source: "arduino-df2301q" | "manual" | string;
  commandId: number;
  commandName?: string;
  at: number;
}
