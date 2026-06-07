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

export interface PhysicalJarvisResponseStart {
  turnId: string;
  at: number;
}

export interface PhysicalJarvisResponseChunk {
  turnId: string;
  delta: string;
  at: number;
}

export interface PhysicalJarvisToolCall {
  turnId: string;
  toolUseId: string;
  name: string;
  result: unknown;
  at: number;
}

export interface PhysicalJarvisResponseEnd {
  turnId: string;
  at: number;
}
