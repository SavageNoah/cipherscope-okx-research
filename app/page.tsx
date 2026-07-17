"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { bridgeFetch } from "./lib/api";
import type { ScanParameters, ScanResponse } from "./lib/types";

const DEFAULTS: ScanParameters = {
  lookbackDays: 180,
  minDrawdownPct: 60,
  maxLowDistancePct: 20,
  turnoverDays: 30,
  minAvgTurnoverUsd: 1_000_000,
};

function formatPrice(value: number) {
  if (value >= 1000) return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
  if (value >= 0.01) return value.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
  return value.toPrecision(5);
}

function formatMoney(value: number) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function Home() {
  const [parameters, setParameters] = useState<ScanParameters>(DEFAULTS);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<"checking" | "ready" | "offline">("checking");
  const [query, setQuery] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    bridgeFetch<{ ok: boolean }>("/api/health")
      .then(() => setHealth("ready"))
      .catch(() => setHealth("offline"));
  }, []);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  const filteredResults = useMemo(() => {
    if (!scan) return [];
    const needle = query.trim().toUpperCase();
    if (!needle) return scan.results;
    return scan.results.filter((item) => item.instId.includes(needle));
  }, [query, scan]);

  function updateParameter(key: keyof ScanParameters, value: string) {
    setParameters((current) => ({ ...current, [key]: Number(value) }));
  }

  async function runScan(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setElapsed(0);
    setError("");
    try {
      const result = await bridgeFetch<ScanResponse>("/api/scan", {
        method: "POST",
        body: JSON.stringify(parameters),
      });
      setScan(result);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "筛选失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell scanner-page">
      <header className="topbar">
        <a className="brand" href="/" aria-label="CipherScope 首页">
          <span className="brand-mark">C</span>
          <span>CipherScope</span>
        </a>
        <div className="system-status" aria-live="polite">
          <span className={`status-dot ${health}`} />
          {health === "ready" ? "研究引擎在线" : health === "offline" ? "本地桥接未启动" : "正在连接"}
        </div>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow">OKX SPOT RESEARCH TERMINAL</div>
          <h1>从深跌资产里，<br />找出值得继续研究的少数。</h1>
          <p>
            扫描 OKX 全部活跃 USDT 现货交易对，用实时价格、完整日线与成交额过滤候选；
            每个结果都有独立研究页、X 观点与三个月情景分析。
          </p>
          <div className="hero-notes">
            <span>实时 OKX 行情</span>
            <span>Grok + X 动态研究</span>
            <span>条件式情景预测</span>
          </div>
        </div>

        <form className="filter-panel" onSubmit={runScan}>
          <div className="panel-heading">
            <div>
              <span className="section-kicker">筛选器</span>
              <h2>定义你的深跌区间</h2>
            </div>
            <button className="text-button" type="button" onClick={() => setParameters(DEFAULTS)}>恢复默认</button>
          </div>

          <div className="filter-grid">
            <label>
              <span>回看周期</span>
              <div className="input-unit"><input min="30" max="300" type="number" value={parameters.lookbackDays} onChange={(e) => updateParameter("lookbackDays", e.target.value)} /><b>天</b></div>
            </label>
            <label>
              <span>距高点至少下跌</span>
              <div className="input-unit"><input min="1" max="99" step="1" type="number" value={parameters.minDrawdownPct} onChange={(e) => updateParameter("minDrawdownPct", e.target.value)} /><b>%</b></div>
            </label>
            <label>
              <span>距最低收盘不超过</span>
              <div className="input-unit"><input min="0" max="200" step="1" type="number" value={parameters.maxLowDistancePct} onChange={(e) => updateParameter("maxLowDistancePct", e.target.value)} /><b>%</b></div>
            </label>
            <label>
              <span>成交额均值周期</span>
              <div className="input-unit"><input min="7" max="90" type="number" value={parameters.turnoverDays} onChange={(e) => updateParameter("turnoverDays", e.target.value)} /><b>天</b></div>
            </label>
            <label className="wide-input">
              <span>日均成交额至少</span>
              <div className="input-unit"><input min="0" step="100000" type="number" value={parameters.minAvgTurnoverUsd} onChange={(e) => updateParameter("minAvgTurnoverUsd", e.target.value)} /><b>USDT</b></div>
            </label>
          </div>

          <button className="primary-button scan-button" disabled={loading || health === "offline"} type="submit">
            {loading ? <><span className="spinner" />正在扫描全市场 · {elapsed}s</> : "开始筛选"}
          </button>
          <p className="form-note">筛选使用最新 ticker；成交额与最低收盘仅使用已完成日线。</p>
        </form>
      </section>

      {error && <div className="alert error-alert"><strong>筛选未完成</strong><span>{error}</span></div>}

      <section className="results-section" aria-live="polite">
        <div className="results-header">
          <div>
            <span className="section-kicker">候选资产</span>
            <h2>{scan ? `${scan.matchCount} 个交易对符合条件` : "等待第一次扫描"}</h2>
            <p>
              {scan
                ? `已检查 ${scan.successCount}/${scan.universeCount} 个市场 · 快照 ${new Date(scan.snapshotAt).toLocaleString("zh-CN")}`
                : "点击开始筛选后，结果会按距高点回撤幅度排序。"}
            </p>
          </div>
          {scan && scan.results.length > 0 && (
            <label className="search-box">
              <span>搜索</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="BTC / SUI / DOT" />
            </label>
          )}
        </div>

        {!scan && !loading && (
          <div className="empty-state">
            <div className="empty-orbit"><span /></div>
            <h3>没有静态榜单，只有当下的数据</h3>
            <p>参数可随时修改。每次扫描都会重新获取 OKX 市场快照。</p>
          </div>
        )}

        {scan && scan.results.length === 0 && (
          <div className="empty-state compact">
            <h3>当前没有标的同时满足这些条件</h3>
            <p>可以适度降低回撤要求、放宽距低点距离，或降低成交额门槛后重试。</p>
          </div>
        )}

        {scan && scan.results.length > 0 && (
          <div className="market-table-wrap">
            <table className="market-table">
              <thead>
                <tr>
                  <th>资产</th>
                  <th>现价</th>
                  <th>距高点</th>
                  <th>距最低收盘</th>
                  <th>日均成交额</th>
                  <th>30日涨跌</th>
                  <th>RSI 14</th>
                  <th><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((item, index) => (
                  <tr key={item.instId}>
                    <td>
                      <div className="asset-cell">
                        <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                        <div className="coin-avatar">{item.baseCcy.slice(0, 2)}</div>
                        <div><strong>{item.baseCcy}</strong><span>/ USDT</span></div>
                      </div>
                    </td>
                    <td className="mono">{formatPrice(item.currentPrice)}</td>
                    <td><span className="metric-negative">−{item.drawdownPct.toFixed(1)}%</span></td>
                    <td><span className={item.lowDistancePct <= 3 ? "metric-warning" : ""}>{item.lowDistancePct >= 0 ? "+" : ""}{item.lowDistancePct.toFixed(1)}%</span></td>
                    <td className="mono">{formatMoney(item.avgTurnoverUsd)}</td>
                    <td className={Number(item.change30dPct) >= 0 ? "metric-positive" : "metric-negative"}>{Number(item.change30dPct) >= 0 ? "+" : ""}{item.change30dPct?.toFixed(1)}%</td>
                    <td className="mono">{item.rsi14?.toFixed(0) ?? "—"}</td>
                    <td>
                      <a className="row-action" href={`/asset/${encodeURIComponent(item.instId)}?lookbackDays=${scan.parameters.lookbackDays}&turnoverDays=${scan.parameters.turnoverDays}`}>
                        打开研究页 <span>↗</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="site-footer">
        <span>CipherScope · 本地加密资产投研终端</span>
        <span>所有输出仅供信息参考，不构成投资建议。</span>
      </footer>
    </main>
  );
}
