# Chain Digest Feed

Chain Builders Digest 的**中心化 X feed**。抓取在 GitHub Actions 里跑（官方 X API v2），
本地 chain-digest 只 fetch 本 repo 的 `feed-x.json`，不再直连 nitter。

## 架构

```
GitHub Actions (每天 17:23 UTC)         本地 (每天 02:47 CST)
┌──────────────────────────┐            ┌──────────────────────────┐
│ generate-feed.js         │            │ prepare-digest.js        │
│  X_BEARER_TOKEN (secret) │──commit──▶ │  fetch feed-x.json (raw) │
│  官方 API v2             │ feed-x.json│  ↓ 失败才 fallback nitter│
└──────────────────────────┘            └──────────────────────────┘
```

## 设置（一次性）

1. **建 repo 并 push**（本仓库内容）
2. **加 secret**：repo → Settings → Secrets and variables → Actions
   → `X_BEARER_TOKEN`（官方 API v2 Bearer token）
3. 首次可手动触发：Actions → Generate X Feed → Run workflow

没有 token 时 workflow 生成空 feed 并提示，RSS 部分（本地）照常工作。

## 文件

- `scripts/generate-feed.js` — 抓取脚本（零 npm 依赖，Node 20+）
- `config/sources.json` — 14 个 crypto builders 名单
- `state/user-ids.json` — user id 缓存（自动生成，减少 API 调用）
- `feed-x.json` — 输出（每次运行自动更新）
