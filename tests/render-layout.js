const { chromium } = require(require.resolve("playwright", {
  paths: ["C:\\Users\\x-ray\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules"]
}));
const path = require("path");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 320 }, deviceScaleFactor: 1 });
  await page.goto(`file:///${path.join(__dirname, "layout-test.html").replace(/\\/g, "/")}`);

  const badge = page.locator(".baidu-official-check-badge");
  const cite = page.locator("cite");
  const menu = page.locator(".google-menu");
  const [badgeBox, citeBox, menuBox, styles] = await Promise.all([
    badge.boundingBox(),
    cite.boundingBox(),
    menu.boundingBox(),
    badge.evaluate((element) => {
      const style = getComputedStyle(element);
      return { direction: style.direction, transform: style.transform, writingMode: style.writingMode };
    })
  ]);

  if (!badgeBox || !citeBox || !menuBox || badgeBox.x < menuBox.x + menuBox.width + 6 || Math.abs(badgeBox.y - citeBox.y) > 2) {
    throw new Error("Badge is not aligned to the right of the URL row");
  }
  if (styles.direction !== "ltr" || styles.transform !== "none" || styles.writingMode !== "horizontal-tb") {
    throw new Error(`Unexpected badge styles: ${JSON.stringify(styles)}`);
  }

  await page.screenshot({ path: path.join(__dirname, "layout-test.png") });
  console.log("layout-test: PASS", JSON.stringify({ badgeBox, citeBox, menuBox, styles }));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
