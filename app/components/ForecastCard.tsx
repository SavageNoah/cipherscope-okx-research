"use client";

import { useEffect, useRef, useState } from "react";
import type { Candle, MarketResult, XPostPackage } from "../lib/types";

type Props = {
  candles: Candle[];
  market: MarketResult;
  post: XPostPackage;
};

function weeklyCandles(candles: Candle[]) {
  const recent = candles.slice(-91);
  const result = [];
  for (let index = 0; index < recent.length; index += 7) {
    const week = recent.slice(index, index + 7);
    if (!week.length) continue;
    result.push({
      date: new Date(week[0].timestamp).toISOString().slice(0, 10),
      open: week[0].open,
      high: Math.max(...week.map((bar) => bar.high)),
      low: Math.min(...week.map((bar) => bar.low)),
      close: week.at(-1)!.close,
    });
  }
  return result.slice(-13);
}

function compact(value: number) {
  if (value >= 1) return value.toFixed(3);
  if (value >= 0.01) return value.toFixed(5);
  return value.toPrecision(4);
}

export default function ForecastCard({ candles, market, post }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 1600;
    canvas.height = 900;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const actual = weeklyCandles(candles);
    const forecast = post.forecastCandles;
    const all = [...actual, ...forecast];
    const max = Math.max(...all.map((bar) => bar.high));
    const min = Math.min(...all.map((bar) => bar.low));
    const padding = (max - min || max * 0.1) * 0.12;
    const maxPrice = max + padding;
    const minPrice = Math.max(0, min - padding);
    const chart = { x: 84, y: 246, w: 1430, h: 460 };
    const step = chart.w / all.length;
    const y = (price: number) => chart.y + ((maxPrice - price) / (maxPrice - minPrice || 1)) * chart.h;

    const background = ctx.createLinearGradient(0, 0, 1600, 900);
    background.addColorStop(0, "#07131d");
    background.addColorStop(0.55, "#0c1a24");
    background.addColorStop(1, "#10202a");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 1600, 900);

    const glow = ctx.createRadialGradient(1260, 130, 20, 1260, 130, 520);
    glow.addColorStop(0, "rgba(47,215,164,.16)");
    glow.addColorStop(1, "rgba(47,215,164,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(700, 0, 900, 600);

    ctx.fillStyle = "#2fd7a4";
    ctx.font = "700 24px system-ui";
    ctx.fillText("CIPHERSCOPE · 3M SCENARIO", 84, 72);
    ctx.fillStyle = "#f4f7f8";
    ctx.font = "700 52px system-ui";
    ctx.fillText(post.chartTitle.slice(0, 30), 84, 145);
    ctx.fillStyle = "#9fb0bb";
    ctx.font = "26px system-ui";
    ctx.fillText(post.chartSubtitle.slice(0, 68), 84, 192);

    const chips = [
      `现价 ${compact(market.currentPrice)} USDT`,
      `距半年高点 -${market.drawdownPct.toFixed(1)}%`,
      `RSI14 ${market.rsi14?.toFixed(0) ?? "—"}`,
    ];
    let chipX = 950;
    ctx.font = "600 18px system-ui";
    chips.forEach((label) => {
      const chipWidth = ctx.measureText(label).width + 34;
      ctx.fillStyle = "rgba(255,255,255,.07)";
      ctx.beginPath();
      ctx.roundRect(chipX, 154, chipWidth, 42, 21);
      ctx.fill();
      ctx.fillStyle = "#dbe4e8";
      ctx.fillText(label, chipX + 17, 182);
      chipX += chipWidth + 12;
    });

    ctx.strokeStyle = "rgba(170,190,200,.12)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#7f919d";
    ctx.font = "17px ui-monospace, monospace";
    for (let line = 0; line <= 4; line += 1) {
      const lineY = chart.y + (chart.h / 4) * line;
      ctx.beginPath();
      ctx.moveTo(chart.x, lineY);
      ctx.lineTo(chart.x + chart.w, lineY);
      ctx.stroke();
      const price = maxPrice - ((maxPrice - minPrice) / 4) * line;
      ctx.fillText(compact(price), chart.x + chart.w - 84, lineY - 8);
    }

    const dividerX = chart.x + actual.length * step;
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = "rgba(242,196,109,.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dividerX, chart.y - 16);
    ctx.lineTo(dividerX, chart.y + chart.h + 28);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#9fb0bb";
    ctx.font = "600 18px system-ui";
    ctx.fillText("过去 13 周 · OKX 实际周K", chart.x, chart.y - 24);
    ctx.fillStyle = "#f2c46d";
    ctx.fillText("未来 13 周 · 基准情景预测", dividerX + 22, chart.y - 24);

    all.forEach((bar, index) => {
      const cx = chart.x + (index + 0.5) * step;
      const rising = bar.close >= bar.open;
      const historical = index < actual.length;
      const color = rising ? "#2fd7a4" : "#ff6b6b";
      ctx.globalAlpha = historical ? 0.98 : 0.76;
      ctx.strokeStyle = color;
      ctx.lineWidth = historical ? 3 : 2.4;
      ctx.beginPath();
      ctx.moveTo(cx, y(bar.high));
      ctx.lineTo(cx, y(bar.low));
      ctx.stroke();
      ctx.fillStyle = color;
      const top = y(Math.max(bar.open, bar.close));
      const bottom = y(Math.min(bar.open, bar.close));
      ctx.fillRect(cx - step * 0.22, top, step * 0.44, Math.max(4, bottom - top));
      ctx.globalAlpha = 1;
    });

    ctx.fillStyle = "rgba(255,255,255,.055)";
    ctx.beginPath();
    ctx.roundRect(84, 755, 1430, 86, 18);
    ctx.fill();
    ctx.fillStyle = "#dbe4e8";
    ctx.font = "600 21px system-ui";
    ctx.fillText("情景依据", 112, 791);
    ctx.fillStyle = "#9fb0bb";
    ctx.font = "19px system-ui";
    const basis = post.forecastBasis.slice(0, 95);
    ctx.fillText(basis, 112, 822);
    ctx.fillStyle = "#667a86";
    ctx.font = "16px system-ui";
    ctx.fillText("虚线右侧为模型条件情景，不是价格承诺。数据仅供信息参考，不构成投资建议。", 84, 875);
    ctx.textAlign = "right";
    ctx.fillText(new Date().toLocaleDateString("zh-CN"), 1514, 875);
    ctx.textAlign = "left";
  }, [candles, market, post]);

  async function copyPost() {
    await navigator.clipboard.writeText(post.postText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${market.instId}-3m-scenario.png`;
      link.href = objectUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    }, "image/png");
  }

  return (
    <section className="x-package">
      <div className="x-copy-panel">
        <div className="panel-heading">
          <div><span className="section-kicker">X POST PACKAGE</span><h2>推文与预测图已生成</h2></div>
          <span className="char-count">{[...post.postText].length} 字符</span>
        </div>
        <blockquote>{post.postText}</blockquote>
        <p className="forecast-basis">{post.forecastBasis}</p>
        <div className="action-row">
          <button className="secondary-button" type="button" onClick={copyPost}>{copied ? "已复制" : "复制推文"}</button>
          <button className="secondary-button" type="button" onClick={downloadImage}>下载预测图 PNG</button>
          <a className="primary-button compact-button" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.postText)}`} target="_blank" rel="noreferrer">打开 X 发布 ↗</a>
        </div>
        <p className="publish-hint">X 网页不会自动带入本地图片：打开发布页后，请上传刚下载的 PNG。</p>
      </div>
      <div className="forecast-preview"><canvas ref={canvasRef} aria-label={`${market.instId} 过去和未来三个月周K线情景图`} role="img" /></div>
    </section>
  );
}
