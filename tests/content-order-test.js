const { chromium } = require(require.resolve("playwright", {
  paths: ["C:\\Users\\x-ray\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules"]
}));
const path = require("path");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true
  });
  const page = await browser.newPage();
  const base = `file:///${path.join(__dirname, "content-order-test.html").replace(/\\/g, "/")}`;

  await page.goto(`${base}?q=test`);
  await page.waitForSelector("#rso > #official-result:first-child[data-baidu-official-promoted='true']");

  await page.goto(`${base}?q=test&scenario=missing`);
  await page.waitForSelector("#rso > .baidu-official-promoted-card:first-child");
  const href = await page.locator(".baidu-official-promoted-link").getAttribute("href");
  if (href !== "https://official.example/") throw new Error(`Unexpected promoted href: ${href}`);

  const cardColor = await page.locator(".baidu-official-promoted-card").evaluate((element) =>
    getComputedStyle(element).borderLeftColor
  );
  if (cardColor !== "rgb(24, 128, 56)") throw new Error(`Unexpected promoted card color: ${cardColor}`);

  const callsBeforeRestore = await page.evaluate(() => window.verifyCallCount);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await page.waitForFunction((before) => window.verifyCallCount > before, callsBeforeRestore);

  console.log("content-order-test: PASS");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
