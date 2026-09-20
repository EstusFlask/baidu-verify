(function () {
  "use strict";

  const BADGE_CLASS = "baidu-official-check-badge";
  let runTimer = null;
  let lastRunKey = "";
  let runGeneration = 0;

  const LABELS = {
    loading: "百度核验中",
    official: "百度官方",
    not_official: "未显示官方",
    not_found: "百度无结果",
    unavailable: "核验不可用",
    disabled: "核验已暂停"
  };

  function normalizeDomain(value) {
    try {
      return new URL(value).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    } catch (_error) {
      return "";
    }
  }

  function currentQuery() {
    return new URL(location.href).searchParams.get("q")?.trim() || "";
  }

  function collectResults() {
    const seenContainers = new Set();
    const output = [];

    for (const heading of document.querySelectorAll("#search h3")) {
      const anchor = heading.closest("a") || heading.parentElement?.closest("a");
      if (!anchor?.href) continue;

      let url;
      try {
        url = new URL(anchor.href);
      } catch (_error) {
        continue;
      }
      if (!/^https?:$/.test(url.protocol) || /(^|\.)google\./i.test(url.hostname)) continue;

      const container = heading.closest(".MjjYud, .g, [data-snhf]") || anchor.parentElement;
      if (!container || seenContainers.has(container)) continue;
      seenContainers.add(container);

      const domain = normalizeDomain(url.href);
      if (!domain) continue;
      output.push({ domain, url: `${url.origin}${url.pathname}`, heading, container });
    }
    return output;
  }

  function ensureBadge(item) {
    let badge = item.container.querySelector(`:scope .${BADGE_CLASS}[data-domain="${CSS.escape(item.domain)}"]`);
    const sourceRow = item.container.querySelector(".byrV5b")
      || item.container.querySelector("cite")?.parentElement;

    if (!badge) {
      badge = document.createElement("span");
      badge.className = BADGE_CLASS;
      badge.dataset.domain = item.domain;
      badge.dataset.status = "loading";
      badge.textContent = LABELS.loading;
      badge.title = "正在通过百度核验此搜索结果";
      badge.setAttribute("role", "button");
      badge.tabIndex = 0;

      const openSource = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const sourceUrl = badge.dataset.sourceUrl;
        if (sourceUrl) window.open(sourceUrl, "_blank", "noopener,noreferrer");
      };
      badge.addEventListener("click", openSource);
      badge.addEventListener("mousedown", (event) => event.stopPropagation());
      badge.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") openSource(event);
      });
    }

    if (sourceRow && badge.parentElement !== sourceRow) {
      sourceRow.appendChild(badge);
    } else if (!badge.isConnected) {
      const titleRow = item.heading.closest("a") || item.heading;
      titleRow.insertAdjacentElement("afterend", badge);
    }
    return badge;
  }

  function paintBadge(badge, verification) {
    const status = verification?.status || "unavailable";
    badge.dataset.status = status;
    badge.textContent = LABELS[status] || LABELS.unavailable;
    badge.title = verification?.reason || "没有核验详情";
    badge.dataset.sourceUrl = verification?.sourceUrl || "";
    badge.setAttribute("aria-label", `${badge.textContent}：${badge.title}`);
  }

  async function run(force = false) {
    const query = currentQuery();
    const items = collectResults();
    if (!query || !items.length) return;

    const runKey = `${location.href}|${items.map((item) => item.domain).join(",")}`;
    if (!force && runKey === lastRunKey) return;
    lastRunKey = runKey;
    const generation = ++runGeneration;

    for (const item of items) ensureBadge(item);

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "VERIFY_DOMAINS",
        query,
        items: items.map(({ domain, url }) => ({ domain, url }))
      });
    } catch (error) {
      response = { ok: false, error: error?.message || "扩展后台无响应" };
    }

    if (generation !== runGeneration) return;
    for (const item of items) {
      const badge = ensureBadge(item);
      paintBadge(badge, response?.ok
        ? response.results?.[item.domain]
        : { status: "unavailable", reason: response?.error || "核验失败" });
    }
  }

  function schedule(force = false) {
    clearTimeout(runTimer);
    runTimer = setTimeout(() => run(force), 350);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "REFRESH_BADGES") {
      lastRunKey = "";
      schedule(true);
    }
  });

  const observer = new MutationObserver(() => schedule(false));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  schedule(true);
})();
