export type ScanParameters = {
  lookbackDays: number;
  minDrawdownPct: number;
  maxLowDistancePct: number;
  turnoverDays: number;
  minAvgTurnoverUsd: number;
};

export type MarketResult = {
  instId: string;
  baseCcy: string;
  currentPrice: number;
  highPrice: number;
  lowClose: number;
  drawdownPct: number;
  lowDistancePct: number;
  avgTurnoverUsd: number;
  range30Pct: number | null;
  change7dPct: number | null;
  change30dPct: number | null;
  rsi14: number | null;
  tickerTimestamp: number;
  okxUrl: string;
};

export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  quoteVolume: number;
  complete?: boolean;
};

export type ScanResponse = {
  snapshotAt: string;
  parameters: ScanParameters;
  universeCount: number;
  successCount: number;
  failedCount: number;
  matchCount: number;
  cacheSeconds: number;
  results: MarketResult[];
};

export type Source = {
  type: "X" | "官方" | "研究" | "市场数据";
  title: string;
  publisher: string;
  date: string;
  url: string;
  summary: string;
};

export type ResearchReport = {
  instrument: string;
  generatedAt: string;
  confidence: number;
  executiveSummary: string;
  marketAssessment: string;
  xSentiment: {
    label: "偏多" | "中性" | "偏空" | "分歧";
    score: number;
    summary: string;
  };
  xSignals: Array<{
    author: string;
    handle: string;
    date: string;
    url: string;
    stance: "看多" | "中性" | "看空";
    summary: string;
  }>;
  scenarios: Array<{
    name: "乐观" | "基准" | "悲观";
    probability: number;
    priceRange: string;
    conditions: string;
    invalidation: string;
  }>;
  catalysts: string[];
  risks: string[];
  dataGaps: string[];
  sources: Source[];
  disclaimer: string;
};

export type ForecastCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type XPostPackage = {
  postText: string;
  thesis: string;
  chartTitle: string;
  chartSubtitle: string;
  forecastBasis: string;
  forecastCandles: ForecastCandle[];
  sources: Array<{ title: string; url: string }>;
  disclaimer: string;
};

export type AssetSnapshot = {
  snapshotAt: string;
  parameters: ScanParameters;
  instrument: {
    instId: string;
    baseCcy: string;
    quoteCcy: string;
    state: string;
    tickSize: string;
    minSize: string;
  };
  market: MarketResult;
  candles: Candle[];
};
