#!/usr/bin/env node
// ============================================================================
// Chain Builders Digest Feed — Generate X Feed (GitHub Actions)
// ============================================================================
// 在 GitHub Actions 里用官方 X API v2 抓 crypto builders 的推文，
// 输出 feed-x.json 供本地 Chain Builders Digest 拉取。零 npm 依赖（Node 20+ 内置 fetch）。
//
// Env:  X_BEARER_TOKEN (官方 API v2 Bearer token；未设置时生成空 feed 并提示)
// 输出: feed-x.json；state/user-ids.json 仅作本地缓存，不公开提交
// ============================================================================

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import { readJsonWithLimit, redactSensitiveText } from './security-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG = JSON.parse(await readFile(join(ROOT, 'config/sources.json'), 'utf8'));
const STATE_DIR = join(ROOT, 'state');
const ID_CACHE = join(STATE_DIR, 'user-ids.json');

const TOKEN = process.env.X_BEARER_TOKEN || '';
const API = 'https://api.x.com/2';
const NOW = Date.now();
const HOUR = 3600 * 1000;
const LOOKBACK = 30 * HOUR; // 30 小时回溯（与本地 digest 一致）
const MAX_TWEETS_PER_USER = 10;
const MAX_API_RESPONSE_BYTES = 2 * 1024 * 1024;

if (!TOKEN) {
  console.error('⚠️  X_BEARER_TOKEN 未设置 — 生成空 feed（digest 将显示 X 暂缺，RSS 照常）');
  await writeFeed({ x: [], reason: 'missing token' });
  process.exit(0);
}

async function api(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API}${path}${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`X API request failed with HTTP ${res.status}`);
  }
  return readJsonWithLimit(res, MAX_API_RESPONSE_BYTES);
}

async function loadIdCache() {
  if (existsSync(ID_CACHE)) {
    const parsed = JSON.parse(await readFile(ID_CACHE, 'utf8'));
    return Object.fromEntries(Object.entries(parsed).flatMap(([handle, record]) => {
      const id = String(record?.id || '');
      return /^\d{1,30}$/.test(id) ? [[handle, { id }]] : [];
    }));
  }
  return {};
}

async function resolveUserIds(accounts) {
  const cache = await loadIdCache();
  const missing = accounts.filter(a => !cache[a.handle]);
  for (const a of missing) {
    try {
      const j = await api(`/users/by/username/${a.handle}`);
      if (j.data?.id) cache[a.handle] = { id: String(j.data.id) };
      console.log(`resolved: ${a.handle}`);
      await new Promise(r => setTimeout(r, 1100)); // rate limit 宽松
    } catch (e) {
      console.error(`resolve ${a.handle} failed: ${e.message}`);
    }
  }
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(ID_CACHE, JSON.stringify(cache, null, 2));
  return cache;
}

async function fetchTweetsForUser(userId) {
  const j = await api(`/users/${userId}/tweets`, {
    'max_results': String(MAX_TWEETS_PER_USER),
    'tweet.fields': 'created_at',
    'exclude': 'retweets,replies'
  });
  const tweets = (j.data || []).map(t => ({
    id: t.id,
    text: redactSensitiveText(t.text).slice(0, 500),
    createdAt: t.created_at
  }));
  // 过滤回溯窗口
  return tweets.filter(t => {
    const ts = Date.parse(t.createdAt);
    return ts && (NOW - ts) < LOOKBACK;
  });
}

async function main() {
  const accounts = CONFIG.x_accounts || [];
  const idCache = await resolveUserIds(accounts);

  const builders = [];
  for (const a of accounts) {
    const rec = idCache[a.handle];
    if (!rec?.id) { console.error(`skip ${a.handle}: no user id`); continue; }
    try {
      const tweets = await fetchTweetsForUser(rec.id);
      builders.push({
        source: 'x',
        name: a.name,
        handle: a.handle,
        role: a.role,
        tweets
      });
      console.log(`${a.handle}: ${tweets.length} tweets in window`);
      await new Promise(r => setTimeout(r, 1100));
    } catch (e) {
      console.error(`${a.handle} tweets failed: ${e.message}`);
    }
  }

  await writeFeed({ x: builders });
}

async function writeFeed(payload) {
  const feed = {
    generatedAt: new Date().toISOString(),
    lookbackHours: LOOKBACK / HOUR,
    ...payload
  };
  await writeFile(join(ROOT, 'feed-x.json'), JSON.stringify(feed, null, 2));
  console.log(`feed-x.json written (${(feed.x || []).length} builders)`);
}

await main();
