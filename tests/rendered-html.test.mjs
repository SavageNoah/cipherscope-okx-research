import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the OKX scanner product shell", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>CipherScope｜OKX 加密资产投研终端<\/title>/i);
  assert.match(html, /CipherScope/);
  assert.match(html, /开始筛选/);
  assert.match(html, /OKX SPOT RESEARCH TERMINAL/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("renders a dedicated asset HTML route", async () => {
  const response = await render("/asset/DOT-USDT");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /DOT-USDT 独立研究｜CipherScope/);
  assert.match(html, /正在载入[\s\S]{0,30}DOT-USDT/);
});

test("source contains dynamic research and X publishing capabilities", async () => {
  const [page, asset, bridge, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/asset/[instId]/AssetResearchClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/research-bridge.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /\/api\/scan/);
  assert.match(page, /\/asset\//);
  assert.match(asset, /CandlestickChart/);
  assert.match(asset, /\/api\/analyze/);
  assert.match(asset, /\/api\/generate-x-post/);
  assert.match(bridge, /x\.com/);
  assert.match(bridge, /forecastCandles/);
  assert.match(bridge, /grok-4\.5/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
