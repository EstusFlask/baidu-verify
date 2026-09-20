importScripts("lib/baidu-parser.js");

const DEFAULTS = {
  enabled: true
};

const CACHE_KEY = "verificationCacheV2";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set(current);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "VERIFY_DOMAINS") {
    verifyDomains(message).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: safeError(error) });
    });
    return true;
  }

  if (message?.type === "CLEAR_CACHE") {
    chrome.storage.local.remove(CACHE_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

async function verifyDomains(message) {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  const query = cleanText(message.query, 300);
  const items = sanitizeItems(message.items);

  if (!settings.enabled) return { ok: true, results: makeUniform(items, "disabled", "扩展已暂停") };
  if (!query || !items.length) return { ok: true, results: {} };

  const cacheId = query.toLowerCase();
  const cached = await readCache(cacheId);
  if (cached) {
    return {
      ok: true,
      cached: true,
      results: selectResults(cached.results, items),
      officialResults: sanitizeOfficialResults(cached.officialResults)
    };
  }

  const verification = await verifyWithBaidu(query, items);

  await writeCache(cacheId, verification);
  return {
    ok: true,
    cached: false,
    results: selectResults(verification.results, items),
    officialResults: sanitizeOfficialResults(verification.officialResults)
  };
}

async function verifyWithBaidu(query, items) {
  const url = new URL("https://www.baidu.com/s");
  url.searchParams.set("wd", query);
  url.searchParams.set("ie", "utf-8");
  url.searchParams.set("rn", "20");

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      headers: { "Accept-Language": "zh-CN,zh;q=0.9" }
    });
  } catch (error) {
    return verificationUniform(items, "unavailable", `无法访问百度：${safeError(error)}`, url.href);
  }

  if (!response.ok) {
    return verificationUniform(items, "unavailable", `百度返回 HTTP ${response.status}`, url.href);
  }

  const html = await response.text();
  const parsed = BaiduParser.parse(html);
  if (!parsed.ok) return verificationUniform(items, "unavailable", parsed.reason, url.href);

  const official = new Set(parsed.officialDomains.map(normalizeDomain));
  const matched = new Set(parsed.matchedDomains.map(normalizeDomain));
  const results = {};

  for (const item of items) {
    if (domainSetHas(official, item.domain)) {
      results[item.domain] = result("official", "百度在当前搜索词下展示了“官方”标识", url.href);
    } else if (domainSetHas(matched, item.domain)) {
      results[item.domain] = result("not_official", "百度结果中找到该网站，但未发现“官方”标识", url.href);
    } else {
      results[item.domain] = result("not_found", "百度当前结果页中未找到该网站，不能据此判断它不是官网", url.href);
    }
  }
  return { results, officialResults: parsed.officialResults };
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const output = [];
  for (const item of items.slice(0, 30)) {
    const domain = normalizeDomain(item?.domain || item?.url);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    output.push({ domain, url: cleanText(item?.url, 2000) });
  }
  return output;
}

function normalizeDomain(value) {
  if (!value) return "";
  try {
    const input = String(value).includes("://") ? String(value) : `https://${value}`;
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch (_error) {
    return "";
  }
}

function domainSetHas(set, domain) {
  for (const candidate of set) {
    if (candidate === domain || candidate.endsWith(`.${domain}`) || domain.endsWith(`.${candidate}`)) return true;
  }
  return false;
}

function result(status, reason, sourceUrl = "") {
  return { status, reason, sourceUrl, checkedAt: Date.now() };
}

function makeUniform(items, status, reason, sourceUrl = "") {
  return Object.fromEntries(items.map((item) => [item.domain, result(status, reason, sourceUrl)]));
}

function verificationUniform(items, status, reason, sourceUrl = "") {
  return { results: makeUniform(items, status, reason, sourceUrl), officialResults: [] };
}

function sanitizeOfficialResults(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const output = [];
  for (const item of items.slice(0, 10)) {
    const domain = normalizeDomain(item?.domain || item?.url);
    let url;
    try {
      url = new URL(item?.url);
      if (!/^https?:$/.test(url.protocol)) continue;
    } catch (_error) {
      continue;
    }
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    output.push({ domain, url: url.href, title: cleanText(item?.title, 200) || domain });
  }
  return output;
}

function selectResults(results, items) {
  return Object.fromEntries(items.map((item) => [
    item.domain,
    results[item.domain] || result("not_found", "没有该域名的核验结果")
  ]));
}

async function readCache(cacheId) {
  const data = await chrome.storage.local.get(CACHE_KEY);
  const entry = data[CACHE_KEY]?.[cacheId];
  if (!entry || Date.now() - entry.createdAt > (entry.ttlMs || CACHE_TTL_MS)) return null;
  return entry;
}

async function writeCache(cacheId, verification) {
  const data = await chrome.storage.local.get(CACHE_KEY);
  const cache = data[CACHE_KEY] || {};
  const hasUnavailable = Object.values(verification.results).some((item) => item?.status === "unavailable");
  cache[cacheId] = {
    createdAt: Date.now(),
    ttlMs: hasUnavailable ? 5 * 60 * 1000 : CACHE_TTL_MS,
    results: verification.results,
    officialResults: sanitizeOfficialResults(verification.officialResults)
  };

  const trimmed = Object.fromEntries(
    Object.entries(cache)
      .sort((a, b) => b[1].createdAt - a[1].createdAt)
      .slice(0, MAX_CACHE_ENTRIES)
  );
  await chrome.storage.local.set({ [CACHE_KEY]: trimmed });
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error || "未知错误");
}
