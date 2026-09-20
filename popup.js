const DEFAULTS = { enabled: true, mode: "baidu-html", apiEndpoint: "" };

const enabled = document.querySelector("#enabled");
const mode = document.querySelector("#mode");
const apiSettings = document.querySelector("#api-settings");
const apiEndpoint = document.querySelector("#api-endpoint");
const apiToken = document.querySelector("#api-token");
const help = document.querySelector("#mode-help");
const status = document.querySelector("#status");

init();

async function init() {
  const [settings, local] = await Promise.all([
    chrome.storage.sync.get(DEFAULTS),
    chrome.storage.local.get({ apiToken: "" })
  ]);
  enabled.checked = settings.enabled;
  mode.value = settings.mode;
  apiEndpoint.value = settings.apiEndpoint;
  apiToken.value = local.apiToken;
  renderMode();
}

mode.addEventListener("change", renderMode);
enabled.addEventListener("change", async () => {
  await chrome.storage.sync.set({ enabled: enabled.checked });
  await clearAndRefresh();
  showStatus(enabled.checked ? "已启用" : "已暂停");
});

document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";

  const endpoint = apiEndpoint.value.trim();
  if (mode.value === "custom-api") {
    let originPattern;
    try {
      const url = new URL(endpoint);
      if (!/^https?:$/.test(url.protocol)) throw new Error("只支持 HTTP(S)");
      originPattern = `${url.origin}/*`;
    } catch (error) {
      showStatus(`API 地址无效：${error.message}`, true);
      return;
    }

    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) {
      showStatus("未授予 API 域名访问权限", true);
      return;
    }
  }

  await chrome.storage.sync.set({
    enabled: enabled.checked,
    mode: mode.value,
    apiEndpoint: endpoint
  });
  await chrome.storage.local.set({ apiToken: apiToken.value.trim() });
  await clearAndRefresh();
  showStatus("设置已保存，结果已刷新");
});

document.querySelector("#clear-cache").addEventListener("click", async () => {
  await clearAndRefresh();
  showStatus("缓存已清除");
});

function renderMode() {
  const custom = mode.value === "custom-api";
  apiSettings.hidden = !custom;
  help.textContent = custom
    ? "POST 请求体：{ query, results: [{ domain, url }] }。返回 results 对象，状态可为 official、not_official、not_found 或 unavailable。"
    : "直接读取百度搜索页中的“官方”标识。百度可能触发安全验证，因此这是实验性方案；不可用时插件会明确提示，不会误判。";
}

async function clearAndRefresh() {
  await chrome.runtime.sendMessage({ type: "CLEAR_CACHE" });
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    try {
      await chrome.tabs.sendMessage(tabs[0].id, { type: "REFRESH_BADGES" });
    } catch (_error) {
      // The active tab may not be a supported Google results page.
    }
  }
}

function showStatus(message, error = false) {
  status.textContent = message;
  status.style.color = error ? "#c5221f" : "#1967d2";
}
