"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CandlestickChart from "../../components/CandlestickChart";
import ForecastCard from "../../components/ForecastCard";
import { bridgeFetch } from "../../lib/api";
import type { AssetSnapshot, ResearchReport, XPostPackage } from "../../lib/types";

function price(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
  if (value >= 0.01) return value.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
  return value.toPrecision(5);
}

function money(value: number) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${(value / 1e3).toFixed(1)}K`;
}

function scenarioClass(name: string) {
  if (name === "乐观") return "bull";
  if (name === "悲观") return "bear";
  return "base";
}

export default function AssetResearchClient({ instId }: { instId: string }) {
  const [snapshot, setSnapshot] = useState<AssetSnapshot | null>(null);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [post, setPost] = useState<XPostPackage | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingPost, setLoadingPost] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [reportError, setReportError] = useState("");
  const [postError, setPostError] = useState("");
  const [reportSeconds, setReportSeconds] = useState(0);

  const loadReport = useCallback(async (data: AssetSnapshot) => {
    setLoadingReport(true);
    setReportError("");
    setPost(null);
    const started = Date.now();
    const timer = window.setInterval(() => setReportSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    try {
      const result = await bridgeFetch<ResearchReport>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ market: data.market, snapshotAt: data.snapshotAt }),
      });
      setReport(result);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "动态研究失败");
    } finally {
      window.clearInterval(timer);
      setLoadingReport(false);
    }
  }, []);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const lookbackDays = search.get("lookbackDays") || "180";
    const turnoverDays = search.get("turnoverDays") || "30";
    bridgeFetch<AssetSnapshot>(`/api/asset?instId=${encodeURIComponent(instId)}&lookbackDays=${lookbackDays}&turnoverDays=${turnoverDays}`)
      .then((data) => {
        setSnapshot(data);
        setLoadingMarket(false);
        void loadReport(data);
      })
      .catch((error) => {
        setMarketError(error instanceof Error ? error.message : "行情加载失败");
        setLoadingMarket(false);
      });
  }, [instId, loadReport]);

  const sourceCounts = useMemo(() => {
    if (!report) return { x: 0, other: 0 };
    return {
      x: report.sources.filter((source) => source.type === "X").length,
      other: report.sources.filter((source) => source.type !== "X").length,
    };
  }, [report]);

  async function generatePost() {
    if (!snapshot || !report) return;
    setLoadingPost(true);
    setPostError("");
    try {
      const result = await bridgeFetch<XPostPackage>("/api/generate-x-post", {
        method: "POST",
        body: JSON.stringify({ market: snapshot.market, analysis: report }),
      });
      setPost(result);
      window.setTimeout(() => document.getElementById("x-package")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "推文生成失败");
    } finally {
      setLoadingPost(false);
    }
  }

  if (loadingMarket) {
    return (
      <main className="shell asset-page loading-page">
        <div className="loading-terminal"><span className="spinner large" /><h1>正在载入 {instId}</h1><p>读取 OKX 日线与最新市场快照…</p></div>
      </main>
    );
  }

  if (marketError || !snapshot) {
    return (
      <main className="shell asset-page loading-page">
        <div className="alert error-alert"><strong>无法打开研究页</strong><span>{marketError || "缺少市场数据"}</span><a href="/">返回筛选器</a></div>
      </main>
    );
  }

  const { market } = snapshot;

  return (
    <main className="shell asset-page">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark">C</span><span>CipherScope</span></a>
        <div className="asset-nav-actions">
          <a href={market.okxUrl} target="_blank" rel="noreferrer">在 OKX 查看 ↗</a>
          <a href="/">返回筛选器</a>
        </div>
      </header>

      <section className="asset-hero">
        <div className="asset-title-block">
          <div className="coin-avatar large-avatar">{market.baseCcy.slice(0, 2)}</div>
          <div>
            <div className="eyebrow">INDEPENDENT ASSET DOSSIER</div>
            <h1>{market.baseCcy}<span>/ USDT</span></h1>
            <p>独立研究页 · 行情快照 {new Date(snapshot.snapshotAt).toLocaleString("zh-CN")}</p>
          </div>
        </div>
        <div className="headline-price">
          <span>OKX 最新价</span>
          <strong>{price(market.currentPrice)}</strong>
          <em className={Number(market.change30dPct) >= 0 ? "metric-positive" : "metric-negative"}>{Number(market.change30dPct) >= 0 ? "+" : ""}{market.change30dPct?.toFixed(2)}% · 30D</em>
        </div>
      </section>

      <section className="metric-strip">
        <div><span>距 {snapshot.parameters.lookbackDays} 日高点</span><strong className="metric-negative">−{market.drawdownPct.toFixed(2)}%</strong><small>高点 {price(market.highPrice)}</small></div>
        <div><span>距最低收盘</span><strong>{market.lowDistancePct >= 0 ? "+" : ""}{market.lowDistancePct.toFixed(2)}%</strong><small>低点 {price(market.lowClose)}</small></div>
        <div><span>{snapshot.parameters.turnoverDays} 日日均成交额</span><strong>{money(market.avgTurnoverUsd)}</strong><small>OKX USDT 现货</small></div>
        <div><span>RSI 14</span><strong>{market.rsi14?.toFixed(1) ?? "—"}</strong><small>{Number(market.rsi14) < 30 ? "超卖区域" : Number(market.rsi14) > 70 ? "过热区域" : "中性区域"}</small></div>
        <div><span>30 日振幅</span><strong>{market.range30Pct?.toFixed(1)}%</strong><small>仅作风险参考</small></div>
      </section>

      <section className="chart-section">
        <div className="section-heading-row">
          <div><span className="section-kicker">MARKET STRUCTURE</span><h2>价格与成交额</h2></div>
          {post && <span className="forecast-on">已叠加三个月基准预测</span>}
        </div>
        <CandlestickChart candles={snapshot.candles} forecast={post?.forecastCandles} />
      </section>

      <section className="research-section">
        <div className="research-heading">
          <div>
            <span className="section-kicker">GROK LIVE RESEARCH</span>
            <h2>动态投资研究报告</h2>
            <p>报告实时搜索公开材料与 X 观点，不使用前端预设结论。</p>
          </div>
          <div className="report-actions">
            {report && <span className="source-badge">{sourceCounts.x} 个 X 来源 · {sourceCounts.other} 个其他来源</span>}
            <button className="secondary-button" disabled={loadingReport} onClick={() => loadReport(snapshot)} type="button">{loadingReport ? "研究中…" : report ? "刷新研究" : "重新生成"}</button>
          </div>
        </div>

        {loadingReport && (
          <div className="research-loading">
            <div className="research-pulse"><span /><span /><span /></div>
            <div><h3>Grok 正在检索与交叉核验</h3><p>搜索 X 观点、官方材料和近期事件 · 已用时 {reportSeconds}s</p></div>
          </div>
        )}
        {reportError && <div className="alert error-alert"><strong>研究暂未生成</strong><span>{reportError}</span><button onClick={() => loadReport(snapshot)} type="button">重试</button></div>}

        {report && !loadingReport && (
          <div className="report-grid">
            <article className="report-summary">
              <div className="confidence-ring" style={{ "--confidence": `${report.confidence * 3.6}deg` } as React.CSSProperties}><strong>{report.confidence}</strong><span>置信度</span></div>
              <div><span className="report-label">投资摘要</span><h3>{report.executiveSummary}</h3><p>{report.marketAssessment}</p></div>
            </article>

            <article className="sentiment-card">
              <div className="sentiment-top"><span>X 观点温度</span><strong>{report.xSentiment.label}</strong></div>
              <div className="sentiment-scale"><i style={{ left: `${Math.max(0, Math.min(100, (report.xSentiment.score + 100) / 2))}%` }} /></div>
              <p>{report.xSentiment.summary}</p>
            </article>

            <div className="scenarios-grid">
              {report.scenarios.map((scenario) => (
                <article className={`scenario-card ${scenarioClass(scenario.name)}`} key={scenario.name}>
                  <div><span>{scenario.name}情景</span><b>{scenario.probability}%</b></div>
                  <strong>{scenario.priceRange}</strong>
                  <p>{scenario.conditions}</p>
                  <small>失效条件：{scenario.invalidation}</small>
                </article>
              ))}
            </div>

            <section className="x-signals">
              <div className="subsection-heading"><div><span className="report-label">X SIGNALS</span><h3>X 上的具体观点</h3></div><small>点击来源可核验原帖</small></div>
              {report.xSignals.length ? (
                <div className="signal-list">
                  {report.xSignals.map((signal, index) => (
                    <a className="signal-card" href={signal.url} key={`${signal.url}-${index}`} target="_blank" rel="noreferrer">
                      <div className="signal-author"><span className="x-mark">X</span><div><strong>{signal.author}</strong><small>{signal.handle} · {signal.date}</small></div><em className={`stance ${signal.stance}`}>{signal.stance}</em></div>
                      <p>{signal.summary}</p><span className="source-link">查看原帖 ↗</span>
                    </a>
                  ))}
                </div>
              ) : <div className="data-gap">本次研究没有找到足够可核验的 X 原帖，未用虚构内容补齐。</div>}
            </section>

            <div className="factors-grid">
              <article><span className="report-label positive">潜在催化</span><ul>{report.catalysts.map((item) => <li key={item}>{item}</li>)}</ul></article>
              <article><span className="report-label negative">主要风险</span><ul>{report.risks.map((item) => <li key={item}>{item}</li>)}</ul></article>
            </div>

            <section className="sources-section">
              <div className="subsection-heading"><div><span className="report-label">EVIDENCE</span><h3>研究来源</h3></div><small>{report.sources.length} 个可点击来源</small></div>
              <div className="source-list">
                {report.sources.map((source, index) => (
                  <a href={source.url} key={`${source.url}-${index}`} target="_blank" rel="noreferrer">
                    <span className={`source-type type-${source.type}`}>{source.type}</span>
                    <div><strong>{source.title}</strong><p>{source.summary}</p><small>{source.publisher} · {source.date}</small></div><b>↗</b>
                  </a>
                ))}
              </div>
              {report.dataGaps.length > 0 && <div className="data-gaps"><strong>数据缺口</strong>{report.dataGaps.map((gap) => <span key={gap}>{gap}</span>)}</div>}
            </section>

            <section className="generate-x-panel">
              <div><span className="section-kicker">PUBLISHING STUDIO</span><h2>把研究变成一条可发布的 X 推文</h2><p>Grok 将根据这份报告生成第一人称推文，并输出未来 13 周基准预测 K 线；图表会明确标注预测区间。</p></div>
              <button className="primary-button" disabled={loadingPost} onClick={generatePost} type="button">{loadingPost ? <><span className="spinner" />正在生成推文与图表</> : "生成 X 推文 + 预测 K 线图"}</button>
            </section>
            {postError && <div className="alert error-alert"><strong>生成失败</strong><span>{postError}</span><button onClick={generatePost} type="button">重试</button></div>}
          </div>
        )}
      </section>

      {post && <div id="x-package"><ForecastCard candles={snapshot.candles} market={market} post={post} /></div>}

      <footer className="site-footer"><span>{report?.disclaimer || "所有输出仅供信息参考，不构成投资建议。"}</span><span>预测为条件情景，不代表未来实际价格。</span></footer>
    </main>
  );
}
