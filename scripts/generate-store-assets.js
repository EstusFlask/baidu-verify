const path = require("path");
const fs = require("fs");
const sharp = require(require.resolve("sharp", {
  paths: ["C:\\Users\\x-ray\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules"]
}));
const { chromium } = require(require.resolve("playwright", {
  paths: ["C:\\Users\\x-ray\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules"]
}));

const root = path.resolve(__dirname, "..");
const iconSource = path.join(root, "store-assets", "icon-source.svg");
const iconDir = path.join(root, "icons");

(async () => {
  fs.mkdirSync(iconDir, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    await sharp(iconSource).resize(size, size).png().toFile(path.join(iconDir, `icon-${size}.png`));
  }

  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`file:///${path.join(root, "store-assets", "screenshot.html").replace(/\\/g, "/")}`);
  await page.screenshot({ path: path.join(root, "store-assets", "screenshot-1280x800.png") });
  await page.setViewportSize({ width: 440, height: 280 });
  await page.goto(`file:///${path.join(root, "store-assets", "promo.html").replace(/\\/g, "/")}`);
  await page.screenshot({ path: path.join(root, "store-assets", "promo-440x280.png") });
  await browser.close();
  console.log("store-assets: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
