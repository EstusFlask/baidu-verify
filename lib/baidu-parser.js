(function (root) {
  "use strict";

  const RESULT_START = /<div\b[^>]*(?:\bclass\s*=\s*["'][^"']*\bresult(?:\s|\b)[^"']*["']|\bid\s*=\s*["']\d+["'])[^>]*>/gi;
  const OFFICIAL_TAG = /<(?:span|i|em|b)\b[^>]*>\s*(?:<[^>]+>\s*)*(?:官方|官網)(?:\s*<\/[^>]+>)*\s*<\/(?:span|i|em|b)>/i;
  const OFFICIAL_CLASS = /(?:op_official|official[_-]?(?:site|flag|icon)?|vstar|c-icon-v|c-text-public)/i;
  const URL_ATTR = /\b(?:mu|data-landurl|data-url|data-log-url)\s*=\s*["']([^"']+)["']/gi;
  const JSON_URL_ATTR = /["'](?:mu|landurl|url)["']\s*:\s*["'](https?:\\?\/\\?\/[^"']+)["']/gi;
  const DIRECT_LINK = /<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/gi;

  function decodeEntities(value) {
    return String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  function normalizeDomain(value) {
    if (!value) return null;
    let candidate = decodeEntities(value)
      .replace(/\\\//g, "/")
      .replace(/\\u0026/gi, "&")
      .trim();

    if (candidate.startsWith("//")) candidate = `https:${candidate}`;

    try {
      const url = new URL(candidate);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
      if (!hostname) return null;
      return hostname;
    } catch (_error) {
      return null;
    }
  }

  function normalizeUrl(value) {
    if (!value) return null;
    let candidate = decodeEntities(value)
      .replace(/\\\//g, "/")
      .replace(/\\u0026/gi, "&")
      .trim();
    if (candidate.startsWith("//")) candidate = `https:${candidate}`;
    try {
      const url = new URL(candidate);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch (_error) {
      return null;
    }
  }

  function candidateUrls(fragment) {
    const urls = [];
    for (const regex of [URL_ATTR, JSON_URL_ATTR, DIRECT_LINK]) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(fragment))) {
        const url = normalizeUrl(match[1]);
        const domain = normalizeDomain(url);
        const isBaiduRedirect = regex === DIRECT_LINK && (domain === "baidu.com" || domain?.endsWith(".baidu.com"));
        if (url && !isBaiduRedirect && !urls.includes(url)) urls.push(url);
      }
    }
    return urls;
  }

  function candidateDomains(fragment) {
    return [...new Set(candidateUrls(fragment).map(normalizeDomain).filter(Boolean))];
  }

  function resultTitle(fragment, fallback) {
    const raw = (fragment.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i) || [])[1] || "";
    const title = decodeEntities(raw.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    return title || fallback;
  }

  function splitResults(html) {
    const starts = [];
    RESULT_START.lastIndex = 0;
    let match;
    while ((match = RESULT_START.exec(html))) starts.push(match.index);
    return starts.map((start, index) => html.slice(start, starts[index + 1] || html.length));
  }

  function hasOfficialMarker(fragment) {
    if (OFFICIAL_TAG.test(fragment)) return true;
    if (!OFFICIAL_CLASS.test(fragment)) return false;
    return /官方|官網/.test(fragment);
  }

  function parse(html) {
    const source = String(html || "");
    const title = (source.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
    const challenge = /百度安全验证|百度安全驗證|wappass\.baidu\.com|mkdjump/i.test(source + title);
    if (challenge) {
      return { ok: false, reason: "百度触发了安全验证", matchedDomains: [], officialDomains: [], officialResults: [] };
    }

    const blocks = splitResults(source);
    if (!blocks.length) {
      return { ok: false, reason: "无法识别百度搜索结果格式", matchedDomains: [], officialDomains: [], officialResults: [] };
    }

    const matched = new Set();
    const official = new Set();
    const officialResults = [];
    for (const block of blocks) {
      const domains = candidateDomains(block);
      for (const domain of domains) matched.add(domain);
      if (hasOfficialMarker(block)) {
        const url = candidateUrls(block)[0];
        const domain = normalizeDomain(url);
        if (domain) {
          official.add(domain);
          if (!officialResults.some((item) => item.domain === domain)) {
            officialResults.push({ domain, url, title: resultTitle(block, domain) });
          }
        }
      }
    }

    return {
      ok: true,
      reason: "",
      matchedDomains: [...matched],
      officialDomains: [...official],
      officialResults
    };
  }

  root.BaiduParser = { parse, normalizeDomain };
})(typeof self !== "undefined" ? self : globalThis);
