export interface PhysicalTrigger {
  source: "arduino-df2301q" | "manual" | string;
  commandId: number;
  commandName?: string;
  at: number;
  desktopClaimed?: boolean;
}

export interface PhysicalTranscript {
  transcript: string;
  sttDoneAt: number;
  vadEndAt?: number;
  at: number;
}
