export type BriefingCategory =
  | "frontier_ai"
  | "research"
  | "policy"
  | "labs"
  | "semiconductors"
  | "benchmarks"
  | "bio"
  | "creators"
  | "markets";

export interface BriefingSource {
  id: string;
  name: string;
  url: string;
  kind: "rss" | "atom" | "arxiv" | "hn";
  category: BriefingCategory;
  weight: number;
}

export interface BriefingItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  sourceId: string;
  category: BriefingCategory;
  publishedAt: string | null;
  score: number;
  tags: string[];
}

export interface BriefingModelWatch {
  name: string;
  status: "announced" | "rumored" | "shipping" | "benchmark";
  evidence: string;
  url: string;
  source: string;
}

export interface BriefingSection {
  title: string;
  bullets: string[];
  items: BriefingItem[];
}

export interface BriefingSynthesis {
  mode: "heuristic" | "openai";
  model: string | null;
  generatedAt: string;
  summary: string[];
  topStories: BriefingSection;
  upcomingModels: BriefingModelWatch[];
  creatorPulse: BriefingSection;
  benchmarkWatch: BriefingSection;
  policyWatch: BriefingSection;
  bioWatch: BriefingSection;
  semiconductorWatch: BriefingSection;
  blindspots: string[];
}

export interface BriefingData {
  generatedAt: string;
  sourceCount: number;
  failedSources: { source: string; error: string }[];
  items: BriefingItem[];
  synthesis: BriefingSynthesis;
  config: {
    openaiConfigured: boolean;
    plannerModel: string;
    executorModel: string;
  };
}
