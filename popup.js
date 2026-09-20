const DEFAULTS = { enabled: true };

const enabled = document.querySelector("#enabled");
const status = document.querySelector("#status");

init();

async function init() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  enabled.checked = settings.enabled;
}

enabled.addEventListener("change", async () => {
  await chrome.storage.sync.set({ enabled: enabled.checked });
  await clearAndRefresh();
  showStatus(enabled.checked ? "已启用" : "已暂停");
});

document.querySelector("#clear-cache").addEventListener("click", async () => {
  await clearAndRefresh();
  showStatus("缓存已清除");
});

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

function showStatus(message) {
  status.textContent = message;
  status.style.color = "#1967d2";
}
