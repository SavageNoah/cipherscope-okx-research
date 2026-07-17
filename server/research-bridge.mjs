import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fetch as undiciFetch, ProxyAgent } from "undici";

const HOST = "127.0.0.1";
const PORT = Number(process.env.RESEARCH_BRIDGE_PORT || 8788);
const OKX_API = "https://www.okx.com/api/v5";
const CACHE_TTL_MS = 5 * 60 * 1000;
const candleCache = new Map();
const analysisCache = new Map();
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
const proxyDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

const STABLE_BASES = new Set([
  "USDT",
  "USDC",
  "DAI",
  "USDG",
  "USDE",
  "FDUSD",
  "TUSD",
  "PYUSD",
]);

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "instrument",
    "generatedAt",
    "confidence",
    "executiveSummary",
    "marketAssessment",
    "xSentiment",
    "xSignals",
    "scenarios",
    "catalysts",
    "risks",
    "dataGaps",
    "sources",
    "disclaimer",
  ],
  properties: {
    instrument: { type: "string" },
    generatedAt: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    executiveSummary: { type: "string" },
    marketAssessment: { type: "string" },
    xSentiment: {
      type: "object",
      additionalProperties: false,
      required: ["label", "score", "summary"],
      properties: {
        label: { type: "string", enum: ["偏多", "中性", "偏空", "分歧"] },
        score: { type: "integer", minimum: -100, maximum: 100 },
        summary: { type: "string" },
      },
    },
    xSignals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["author", "handle", "date", "url", "stance", "summary"],
        properties: {
          author: { type: "string" },
          handle: { type: "string" },
          date: { type: "string" },
          url: { type: "string" },
          stance: { type: "string", enum: ["看多", "中性", "看空"] },
          summary: { type: "string" },
        },
      },
    },
    scenarios: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "probability", "priceRange", "conditions", "invalidation"],
        properties: {
          name: { type: "string", enum: ["乐观", "基准", "悲观"] },
          probability: { type: "integer", minimum: 0, maximum: 100 },
          priceRange: { type: "string" },
          conditions: { type: "string" },
          invalidation: { type: "string" },
        },
      },
    },
    catalysts: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    dataGaps: { type: "array", items: { type: "string" } },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "publisher", "date", "url", "summary"],
        properties: {
          type: { type: "string", enum: ["X", "官方", "研究", "市场数据"] },
          title: { type: "string" },
          publisher: { type: "string" },
          date: { type: "string" },
          url: { type: "string" },
          summary: { type: "string" },
        },
      },
    },
    disclaimer: { type: "string" },
  },
};

const X_POST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "postText",
    "thesis",
    "chartTitle",
    "chartSubtitle",
    "forecastBasis",
    "forecastCandles",
    "sources",
    "disclaimer",
  ],
  properties: {
    postText: { type: "string" },
    thesis: { type: "string" },
    chartTitle: { type: "string" },
    chartSubtitle: { type: "string" },
    forecastBasis: { type: "string" },
    forecastCandles: {
      type: "array",
      minItems: 13,
      maxItems: 13,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "open", "high", "low", "close"],
        properties: {
          date: { type: "string" },
          open: { type: "number" },
          high: { type: "number" },
          low: { type: "number" },
          close: { type: "number" },
        },
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url"],
        properties: {
          title: { type: "string" },
          url: { type: "string" },
        },
      },
    },
    disclaimer: { type: "string" },
  },
};

function corsHeaders(origin = "") {
  const allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  return {
    "access-control-allow-origin": allowed ? origin : "http://localhost:3000",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function jsonResponse(res, status, body, origin) {
  res.writeHead(status, {
    ...corsHeaders(origin),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeParameters(input = {}) {
  return {
    lookbackDays: Math.round(clampNumber(input.lookbackDays, 180, 30, 300)),
    minDrawdownPct: clampNumber(input.minDrawdownPct, 60, 1, 99),
    maxLowDistancePct: clampNumber(input.maxLowDistancePct, 20, 0, 200),
    turnoverDays: Math.round(clampNumber(input.turnoverDays, 30, 7, 90)),
    minAvgTurnoverUsd: clampNumber(input.minAvgTurnoverUsd, 1_000_000, 0, 1e12),
  };
}

async function okx(path, params = {}, attempts = 4) {
  const url = new URL(`${OKX_API}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await undiciFetch(url, {
        headers: { "user-agent": "CipherScope/1.0" },
        signal: AbortSignal.timeout(25_000),
        dispatcher: proxyDispatcher,
      });
      const payload = await response.json();
      if (response.ok && payload.code === "0") return payload.data;
      lastError = new Error(payload.msg || `OKX HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw lastError || new Error("OKX 请求失败");
}

async function mapConcurrent(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, value: await task(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function getCandles(instId) {
  const cached = candleCache.get(instId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const data = await okx("/market/candles", { instId, bar: "1Dutc", limit: 300 });
  candleCache.set(instId, { at: Date.now(), data });
  return data;
}

function rsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

function evaluateInstrument(instId, ticker, rawCandles, parameters) {
  const bars = rawCandles
    .map((row) => ({
      timestamp: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      quoteVolume: Number(row[7]),
      complete: row[8] === "1",
    }))
    .filter((bar) => Object.values(bar).every((value) => typeof value === "boolean" || Number.isFinite(value)))
    .sort((a, b) => a.timestamp - b.timestamp);

  const completed = bars.filter((bar) => bar.complete);
  if (bars.length < parameters.lookbackDays || completed.length < Math.max(parameters.lookbackDays, parameters.turnoverDays)) {
    return null;
  }

  const currentPrice = Number(ticker.last);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const lookbackBars = bars.slice(-parameters.lookbackDays);
  const completedLookback = completed.slice(-parameters.lookbackDays);
  const turnoverBars = completed.slice(-parameters.turnoverDays);
  const highPrice = Math.max(...lookbackBars.map((bar) => bar.high));
  const lowClose = Math.min(...completedLookback.map((bar) => bar.close));
  const avgTurnoverUsd = turnoverBars.reduce((sum, bar) => sum + bar.quoteVolume, 0) / turnoverBars.length;
  const drawdownPct = (1 - currentPrice / highPrice) * 100;
  const lowDistancePct = (currentPrice / lowClose - 1) * 100;
  const last30 = completed.slice(-30);
  const range30Pct = last30.length
    ? (Math.max(...last30.map((bar) => bar.high)) / Math.min(...last30.map((bar) => bar.low)) - 1) * 100
    : null;
  const closes = completed.map((bar) => bar.close);
  const change7dPct = closes.length > 7 ? (currentPrice / closes.at(-8) - 1) * 100 : null;
  const change30dPct = closes.length > 30 ? (currentPrice / closes.at(-31) - 1) * 100 : null;

  if (
    drawdownPct < parameters.minDrawdownPct ||
    lowDistancePct > parameters.maxLowDistancePct ||
    avgTurnoverUsd < parameters.minAvgTurnoverUsd
  ) {
    return null;
  }

  return {
    instId,
    baseCcy: instId.replace(/-USDT$/, ""),
    currentPrice,
    highPrice,
    lowClose,
    drawdownPct,
    lowDistancePct,
    avgTurnoverUsd,
    range30Pct,
    change7dPct,
    change30dPct,
    rsi14: rsi(closes),
    tickerTimestamp: Number(ticker.ts),
    okxUrl: `https://www.okx.com/trade-spot/${instId.toLowerCase()}`,
  };
}

async function scanMarkets(input) {
  const parameters = normalizeParameters(input);
  const [instruments, tickers] = await Promise.all([
    okx("/public/instruments", { instType: "SPOT" }),
    okx("/market/tickers", { instType: "SPOT" }),
  ]);

  const universe = instruments.filter(
    (instrument) =>
      instrument.quoteCcy === "USDT" &&
      instrument.state === "live" &&
      !STABLE_BASES.has(instrument.baseCcy),
  );
  const tickerMap = new Map(tickers.map((ticker) => [ticker.instId, ticker]));
  const fetched = await mapConcurrent(universe, 12, async (instrument) => {
    const ticker = tickerMap.get(instrument.instId);
    if (!ticker) throw new Error("缺少 ticker");
    const candles = await getCandles(instrument.instId);
    return evaluateInstrument(instrument.instId, ticker, candles, parameters);
  });

  const results = fetched
    .filter((item) => item.ok && item.value)
    .map((item) => item.value)
    .sort((a, b) => b.drawdownPct - a.drawdownPct);
  const failed = fetched.filter((item) => !item.ok).length;

  return {
    snapshotAt: new Date().toISOString(),
    parameters,
    universeCount: universe.length,
    successCount: universe.length - failed,
    failedCount: failed,
    matchCount: results.length,
    cacheSeconds: CACHE_TTL_MS / 1000,
    results,
  };
}

async function getAssetSnapshot(instId, input = {}) {
  if (!/^[A-Z0-9]+-USDT$/.test(instId)) throw new Error("无效的交易对");
  const parameters = normalizeParameters(input);
  const [instrumentRows, tickerRows, rawCandles] = await Promise.all([
    okx("/public/instruments", { instType: "SPOT", instId }),
    okx("/market/ticker", { instId }),
    getCandles(instId),
  ]);
  const instrument = instrumentRows[0];
  const ticker = tickerRows[0];
  if (!instrument || instrument.state !== "live" || instrument.quoteCcy !== "USDT" || !ticker) {
    throw new Error("该交易对目前不在 OKX USDT 现货市场正常交易");
  }

  const permissive = {
    ...parameters,
    minDrawdownPct: 0,
    maxLowDistancePct: 1_000,
    minAvgTurnoverUsd: 0,
  };
  const metrics = evaluateInstrument(instId, ticker, rawCandles, permissive);
  if (!metrics) throw new Error("历史日线不足，无法生成研究页");

  const candles = rawCandles
    .map((row) => ({
      timestamp: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      quoteVolume: Number(row[7]),
      complete: row[8] === "1",
    }))
    .filter((bar) => bar.complete && [bar.timestamp, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-parameters.lookbackDays);

  return {
    snapshotAt: new Date().toISOString(),
    parameters,
    instrument: {
      instId,
      baseCcy: instrument.baseCcy,
      quoteCcy: instrument.quoteCcy,
      state: instrument.state,
      tickSize: instrument.tickSz,
      minSize: instrument.minSz,
    },
    market: metrics,
    candles,
  };
}

function grokAvailability() {
  if (process.platform === "win32") {
    const probe = spawnSync("wsl.exe", ["-e", "/bin/sh", "-lc", "command -v grok"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return { available: probe.status === 0, command: probe.stdout.trim() || "WSL grok" };
  }
  const probe = spawnSync("/bin/sh", ["-lc", "command -v grok"], { encoding: "utf8", timeout: 5_000 });
  return { available: probe.status === 0, command: probe.stdout.trim() || "grok" };
}

function buildResearchPrompt(market) {
  const marketJson = JSON.stringify(market, null, 2);
  return `你是一名审慎的加密资产研究员。请对 ${market.instId} 进行截至当前时间的动态投资研究，并严格输出符合 JSON Schema 的中文 JSON。

必须完成：
1. 使用网络搜索核验项目官方信息、代币机制、近期事件和市场风险。
2. 必须搜索 X.com 上最近 90 天关于该资产的具体分析。优先项目官方、研究员、链上分析师和有论据的交易观点；至少尝试找到 3 位不同作者。
3. xSignals 中每条都必须给出真实、可点击的 x.com 帖文 URL、作者、日期、立场与中文摘要。不得编造链接、作者、日期或观点；无法核验时宁可留空，并在 dataGaps 解释。
4. sources 必须包含实际使用的 X、项目官方材料和其他研究来源，并区分来源类型。
5. 给出未来三个月乐观、基准、悲观三个情景。三者概率总和必须为 100；价格区间使用 USDT，写明成立条件和失效条件。
6. 区分事实、观点和推断。不要把社交媒体热度当作事实，不得承诺收益。
7. 结合下面来自 OKX 的实时量价快照，但不要声称它代表其他交易所：
${marketJson}

报告应具体、紧凑、可验证。disclaimer 明确说明这不是投资建议。`;
}

function parseGrokJson(output) {
  const clean = output.replace(/\u001b\[[0-9;]*m/g, "").trim();
  if (!clean) throw new Error("Grok 没有返回内容");
  try {
    const parsed = JSON.parse(clean);
    if (parsed?.structuredOutput && typeof parsed.structuredOutput === "object") return parsed.structuredOutput;
    if (typeof parsed?.text === "string") return JSON.parse(parsed.text);
    if (typeof parsed?.result === "string") return JSON.parse(parsed.result);
    if (typeof parsed?.response === "string") return JSON.parse(parsed.response);
    return parsed;
  } catch {
    const first = clean.indexOf("{");
    const last = clean.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(clean.slice(first, last + 1));
    throw new Error("无法解析 Grok 返回的 JSON");
  }
}

function toWslPath(filePath) {
  const match = /^([A-Za-z]):\\(.*)$/.exec(filePath);
  if (!match) return filePath.replaceAll("\\", "/");
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

async function runGrok(prompt, schema = ANALYSIS_SCHEMA, maxTurns = 8) {
  const promptDirectory = path.join(tmpdir(), "cipherscope-grok");
  await mkdir(promptDirectory, { recursive: true });
  const promptPath = path.join(promptDirectory, `prompt-${randomUUID()}.txt`);
  await writeFile(promptPath, prompt, "utf8");

  return new Promise((resolve, reject) => {
    const executable = process.platform === "win32" ? "wsl.exe" : "grok";
    const grokPath = process.env.GROK_CLI_PATH || "/home/noah/.local/bin/grok";
    const grokArgs = [
      "-m",
      process.env.GROK_MODEL || "grok-4.5",
      "--prompt-file",
      process.platform === "win32" ? toWslPath(promptPath) : promptPath,
      "--json-schema",
      JSON.stringify(schema),
      "--no-subagents",
      "--no-memory",
      "--max-turns",
      String(maxTurns),
      "--permission-mode",
      "bypassPermissions",
      "--no-alt-screen",
      "--no-plan",
    ];
    const proxy = process.env.GROK_PROXY || "http://127.0.0.1:10808";
    const args = process.platform === "win32"
      ? [
          "-e",
          "/usr/bin/env",
          `HTTPS_PROXY=${proxy}`,
          `HTTP_PROXY=${proxy}`,
          `ALL_PROXY=${proxy}`,
          grokPath,
          ...grokArgs,
        ]
      : grokArgs;
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 300_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 4_000_000) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      void unlink(promptPath).catch(() => {});
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      void unlink(promptPath).catch(() => {});
      if (timedOut) {
        if (stdout.trim()) {
          try {
            resolve(parseGrokJson(stdout));
            return;
          } catch {
            // Fall through to the actionable timeout error.
          }
        }
        reject(new Error("Grok 在 300 秒内没有返回可用内容，请检查代理或重新登录 Grok CLI"));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Grok 退出码 ${code}`));
        return;
      }
      try {
        resolve(parseGrokJson(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function analyzeMarket(input) {
  const market = input?.market;
  if (!market || !/^[A-Z0-9]+-USDT$/.test(String(market.instId || ""))) {
    throw new Error("无效的交易对");
  }
  const safeMarket = {
    instId: market.instId,
    currentPrice: Number(market.currentPrice),
    highPrice: Number(market.highPrice),
    lowClose: Number(market.lowClose),
    drawdownPct: Number(market.drawdownPct),
    lowDistancePct: Number(market.lowDistancePct),
    avgTurnoverUsd: Number(market.avgTurnoverUsd),
    range30Pct: Number(market.range30Pct),
    change7dPct: Number(market.change7dPct),
    change30dPct: Number(market.change30dPct),
    rsi14: Number(market.rsi14),
    snapshotAt: input.snapshotAt || new Date().toISOString(),
  };
  const cacheKey = `${safeMarket.instId}:${Math.round(safeMarket.currentPrice * 1e8)}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.data;
  const data = await runGrok(buildResearchPrompt(safeMarket));
  analysisCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

function buildXPostPrompt(market, analysis) {
  return `基于下面已经完成的加密资产研究，生成一条可发布到 X 的中文第一人称投资观察，以及未来 13 周的基准情景周 K 线预测数据。严格输出符合 JSON Schema 的 JSON。

规则：
1. postText 使用第一人称判断，重点介绍投资价值、当前技术形态、我会观察的确认条件和主要风险；包含“不构成投资建议”的简短提示。
2. postText 总长度控制在 260 个中文字符以内，最多 2 个英文 hashtag，不使用夸张承诺、收益保证、煽动性语言或虚构事实。
3. 至少引用研究报告中两个可核验来源；不得新增无法核验的数据或 URL。
4. forecastCandles 为从下一个完整周开始的连续 13 根周 K。第一根 open 接近当前价，此后每根 open 接近前一根 close；high 不低于 open/close，low 不高于 open/close，所有价格必须为正数。
5. 预测必须与报告的“基准”三个月情景一致，并体现正常波动，不得画成单调直线。forecastBasis 明确这是条件情景而非承诺。
6. 图表标题和副标题简洁、准确，不能把预测伪装成历史事实。

OKX 市场快照：
${JSON.stringify(market, null, 2)}

研究报告：
${JSON.stringify(analysis, null, 2)}`;
}

function normalizeForecast(result, currentPrice) {
  if (!Array.isArray(result.forecastCandles) || result.forecastCandles.length !== 13) {
    throw new Error("Grok 没有返回完整的 13 周预测 K 线");
  }
  let previousClose = currentPrice;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + ((8 - start.getUTCDay()) % 7 || 7));
  start.setUTCHours(0, 0, 0, 0);
  const forecastCandles = result.forecastCandles.map((candle, index) => {
    const suppliedOpen = Number(candle.open);
    const open = index === 0 && Number.isFinite(suppliedOpen) && suppliedOpen > 0
      ? suppliedOpen
      : previousClose;
    const close = Number(candle.close);
    if (!Number.isFinite(close) || close <= 0) throw new Error("预测 K 线包含无效价格");
    const high = Math.max(open, close, Number(candle.high) || 0);
    const lowCandidate = Number(candle.low);
    const low = Math.max(Number.EPSILON, Math.min(open, close, Number.isFinite(lowCandidate) ? lowCandidate : Math.min(open, close)));
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index * 7);
    previousClose = close;
    return { date: date.toISOString().slice(0, 10), open, high, low, close };
  });
  return { ...result, forecastCandles };
}

async function generateXPost(input) {
  const market = input?.market;
  const analysis = input?.analysis;
  if (!market || !analysis || !/^[A-Z0-9]+-USDT$/.test(String(market.instId || ""))) {
    throw new Error("缺少有效的市场快照或研究报告");
  }
  const result = await runGrok(buildXPostPrompt(market, analysis), X_POST_SCHEMA, 5);
  return normalizeForecast(result, Number(market.currentPrice));
}

const availability = grokAvailability();
const server = createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    if (req.method === "GET" && url.pathname === "/api/health") {
      jsonResponse(res, 200, {
        ok: true,
        service: "CipherScope research bridge",
        grok: availability,
        now: new Date().toISOString(),
      }, origin);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/asset") {
      const instId = String(url.searchParams.get("instId") || "").toUpperCase();
      const parameters = Object.fromEntries(url.searchParams.entries());
      jsonResponse(res, 200, await getAssetSnapshot(instId, parameters), origin);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/scan") {
      const body = await readJson(req);
      jsonResponse(res, 200, await scanMarkets(body), origin);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/analyze") {
      if (!availability.available) {
        jsonResponse(res, 503, { error: "未检测到 WSL Grok CLI，请先安装并登录" }, origin);
        return;
      }
      const body = await readJson(req);
      jsonResponse(res, 200, await analyzeMarket(body), origin);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/generate-x-post") {
      if (!availability.available) {
        jsonResponse(res, 503, { error: "未检测到 WSL Grok CLI，请先安装并登录" }, origin);
        return;
      }
      const body = await readJson(req);
      jsonResponse(res, 200, await generateXPost(body), origin);
      return;
    }
    jsonResponse(res, 404, { error: "接口不存在" }, origin);
  } catch (error) {
    jsonResponse(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Research bridge: http://${HOST}:${PORT}`);
  console.log(`Grok CLI: ${availability.available ? "ready" : "not found"}`);
});

export { analyzeMarket, evaluateInstrument, generateXPost, getAssetSnapshot, normalizeParameters, scanMarkets };
