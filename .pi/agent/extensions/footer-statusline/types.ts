export type FooterThemeLike = {
  fg?: (token: string, text: string) => string;
};

export type FooterUsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

export type FooterStats = {
  totals: FooterUsageTotals;
  contextWindow: number;
  contextPercent: number | null;
  modelId: string;
  provider?: string;
  multiProvider: boolean;
  usingSubscription: boolean;
  reasoning: boolean;
  thinkingLevel?: string;
};

export type FooterLinesInput = {
  width: number;
  theme: FooterThemeLike;
  cwd: string;
  branch: string | null;
  extensionStatuses: ReadonlyMap<string, string> | Iterable<[string, string]>;
  showSuggestionSeparator: boolean;
  stats: FooterStats;
};
