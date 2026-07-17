"use client";

import { PointerEvent, WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Candle, ForecastCandle } from "../lib/types";

type Props = {
  candles: Candle[];
  forecast?: ForecastCandle[];
};

function nicePrice(value: number) {
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(3);
  if (value >= 0.01) return value.toFixed(5);
  return value.toPrecision(4);
}

function movingAverage(values: number[], period: number) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

export default function CandlestickChart({ candles, forecast = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; offset: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 440 });
  const [visibleCount, setVisibleCount] = useState(90);
  const [offset, setOffset] = useState(0);
  const [showVolume, setShowVolume] = useState(true);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setDimensions({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(340, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visible = useMemo(() => {
    const end = Math.max(0, candles.length - offset);
    const start = Math.max(0, end - visibleCount);
    return candles.slice(start, end);
  }, [candles, offset, visibleCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || visible.length === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * ratio;
    canvas.height = dimensions.height * ratio;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);

    const width = dimensions.width;
    const height = dimensions.height;
    const margin = { top: 24, right: 68, bottom: 34, left: 12 };
    const volumeHeight = showVolume ? Math.min(84, height * 0.2) : 0;
    const priceBottom = height - margin.bottom - volumeHeight - (showVolume ? 16 : 0);
    const plotWidth = width - margin.left - margin.right;
    const futureSlots = offset === 0 && forecast.length ? forecast.length * 7 + 4 : 0;
    const totalSlots = visible.length + futureSlots;
    const xStep = plotWidth / Math.max(1, totalSlots);
    const allHighs = [...visible.map((bar) => bar.high), ...forecast.map((bar) => bar.high)];
    const allLows = [...visible.map((bar) => bar.low), ...forecast.map((bar) => bar.low)];
    const rawMax = Math.max(...allHighs);
    const rawMin = Math.min(...allLows);
    const padding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.006);
    const maxPrice = rawMax + padding;
    const minPrice = Math.max(0, rawMin - padding);
    const priceHeight = priceBottom - margin.top;
    const y = (price: number) => margin.top + ((maxPrice - price) / (maxPrice - minPrice || 1)) * priceHeight;
    const x = (index: number) => margin.left + (index + 0.5) * xStep;

    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#0e1720");
    gradient.addColorStop(1, "#091016");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(148, 167, 181, 0.12)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#8292a0";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    for (let line = 0; line <= 4; line += 1) {
      const lineY = margin.top + (priceHeight / 4) * line;
      ctx.beginPath();
      ctx.moveTo(margin.left, lineY);
      ctx.lineTo(width - margin.right, lineY);
      ctx.stroke();
      const label = maxPrice - ((maxPrice - minPrice) / 4) * line;
      ctx.fillText(nicePrice(label), width - margin.right + 8, lineY + 4);
    }

    const bodyWidth = Math.max(1.5, Math.min(9, xStep * 0.62));
    visible.forEach((bar, index) => {
      const rising = bar.close >= bar.open;
      const color = rising ? "#2fd7a4" : "#ff6b6b";
      const cx = x(index);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, bodyWidth * 0.17);
      ctx.beginPath();
      ctx.moveTo(cx, y(bar.high));
      ctx.lineTo(cx, y(bar.low));
      ctx.stroke();
      const top = y(Math.max(bar.open, bar.close));
      const bottom = y(Math.min(bar.open, bar.close));
      ctx.fillStyle = color;
      ctx.fillRect(cx - bodyWidth / 2, top, bodyWidth, Math.max(1.5, bottom - top));
    });

    const closes = visible.map((bar) => bar.close);
    const drawAverage = (period: number, color: string) => {
      const average = movingAverage(closes, period);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      average.forEach((value, index) => {
        if (value == null) return;
        if (!started) {
          ctx.moveTo(x(index), y(value));
          started = true;
        } else ctx.lineTo(x(index), y(value));
      });
      ctx.stroke();
    };
    drawAverage(7, "#f2c46d");
    drawAverage(25, "#7ca4ff");

    if (offset === 0 && forecast.length) {
      const dividerX = x(visible.length + 1.5);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "rgba(242,196,109,.55)";
      ctx.beginPath();
      ctx.moveTo(dividerX, margin.top);
      ctx.lineTo(dividerX, priceBottom);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#f2c46d";
      ctx.font = "600 11px system-ui";
      ctx.fillText("三个月基准情景", dividerX + 8, margin.top + 14);
      forecast.forEach((bar, index) => {
        const slot = visible.length + 5 + index * 7;
        const cx = x(slot);
        const rising = bar.close >= bar.open;
        const color = rising ? "rgba(47,215,164,.78)" : "rgba(255,107,107,.78)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, y(bar.high));
        ctx.lineTo(cx, y(bar.low));
        ctx.stroke();
        const top = y(Math.max(bar.open, bar.close));
        const bottom = y(Math.min(bar.open, bar.close));
        ctx.fillStyle = color;
        ctx.fillRect(cx - Math.max(2, bodyWidth) / 2, top, Math.max(2, bodyWidth), Math.max(2, bottom - top));
      });
    }

    if (showVolume) {
      const maxVolume = Math.max(...visible.map((bar) => bar.quoteVolume), 1);
      const volumeTop = priceBottom + 16;
      visible.forEach((bar, index) => {
        const barHeight = (bar.quoteVolume / maxVolume) * volumeHeight;
        ctx.fillStyle = bar.close >= bar.open ? "rgba(47,215,164,.28)" : "rgba(255,107,107,.25)";
        ctx.fillRect(x(index) - bodyWidth / 2, height - margin.bottom - barHeight, bodyWidth, barHeight);
      });
      ctx.fillStyle = "#687985";
      ctx.font = "10px system-ui";
      ctx.fillText("成交额", margin.left + 2, volumeTop + 10);
    }

    const labelEvery = Math.max(1, Math.ceil(visible.length / 6));
    ctx.fillStyle = "#687985";
    ctx.font = "10px ui-monospace, monospace";
    visible.forEach((bar, index) => {
      if (index % labelEvery !== 0 && index !== visible.length - 1) return;
      const date = new Date(bar.timestamp).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
      ctx.fillText(date, x(index) - 16, height - 12);
    });
  }, [dimensions, forecast, offset, showVolume, visible]);

  function onWheel(event: WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    setVisibleCount((count) => Math.max(30, Math.min(180, count + (event.deltaY > 0 ? 10 : -10))));
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, offset };
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const pixelsPerCandle = Math.max(3, dimensions.width / visibleCount);
    const days = Math.round((event.clientX - dragRef.current.x) / pixelsPerCandle);
    setOffset(Math.max(0, Math.min(candles.length - 30, dragRef.current.offset + days)));
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }

  return (
    <div className="chart-shell">
      <div className="chart-toolbar">
        <div className="range-tabs" aria-label="K线显示范围">
          {[30, 90, 180].map((days) => (
            <button className={visibleCount === days ? "active" : ""} key={days} onClick={() => { setVisibleCount(days); setOffset(0); }} type="button">{days}D</button>
          ))}
        </div>
        <div className="chart-legend">
          <span className="legend-ma7">MA7</span>
          <span className="legend-ma25">MA25</span>
          <button type="button" onClick={() => setShowVolume((value) => !value)}>{showVolume ? "隐藏量能" : "显示量能"}</button>
          {offset > 0 && <button type="button" onClick={() => setOffset(0)}>回到最新</button>}
        </div>
      </div>
      <div className="resizable-chart" ref={containerRef}>
        <canvas
          aria-label={`${visible.length} 根日K线图，可用鼠标滚轮缩放并拖动查看历史`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          ref={canvasRef}
          role="img"
        />
      </div>
      <p className="chart-hint">滚轮缩放 · 左右拖动历史 · 右下角拖动可调整图表高度</p>
    </div>
  );
}
