# CipherScope

本地运行的 OKX 加密资产投研终端。它会实时扫描 OKX 活跃 USDT 现货市场，并为每个候选资产提供独立研究页、交互 K 线、X 观点、三个月情景分析以及可发布的 X 推文与预测图卡。

## 启动

在本目录运行：

```powershell
npm run dev
```

然后打开 `http://localhost:3000`。该命令会同时启动网页和只监听本机的研究桥接服务。

## 本机要求

- Node.js 22+
- WSL 中已安装并登录 Grok CLI，默认路径 `/home/noah/.local/bin/grok`
- 本机代理默认使用 `http://127.0.0.1:10808`

如本机配置不同，可在启动前设置：

```powershell
$env:GROK_CLI_PATH = "/your/wsl/path/grok"
$env:GROK_MODEL = "grok-4.5"
$env:GROK_PROXY = "http://127.0.0.1:10808"
npm run dev
```

## 数据与分析边界

- 筛选数据来自 OKX 公共 API；现价使用最新 ticker，最低收盘和成交额只使用已完成日线。
- 研究报告由 Grok 在打开币种页时动态生成，并要求提供可点击的 X、官方和研究来源。
- 三个月预测是条件情景，不是确定性价格预测。
- “打开 X 发布”只打开 X 官方发布页，不保存账号凭据，也不会自动点击发布。图片需由用户上传并最终确认。

## 验证

```powershell
npm run test
```
