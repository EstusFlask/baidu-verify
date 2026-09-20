require("../lib/baidu-parser.js");

const html = `
  <html><title>百度一下</title>
  <div id="1" class="result c-container" mu="https://www.baidu.com/">
    <h3><a href="https://www.baidu.com/">百度</a></h3><span class="c-text-public">官方</span>
  </div>
  <div id="2" class="result c-container" mu="https://example.com/">
    <h3><a href="https://example.com/">Example</a></h3>
  </div></html>`;

const parsed = globalThis.BaiduParser.parse(html);
const expected = {
  ok: true,
  matchedDomains: ["baidu.com", "example.com"],
  officialDomains: ["baidu.com"],
  officialResults: [{ domain: "baidu.com", url: "https://www.baidu.com/", title: "百度" }]
};

for (const [key, value] of Object.entries(expected)) {
  if (JSON.stringify(parsed[key]) !== JSON.stringify(value)) {
    throw new Error(`${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(parsed[key])}`);
  }
}

const challenge = globalThis.BaiduParser.parse("<title>百度安全验证</title>");
if (challenge.ok) throw new Error("Challenge page must not be accepted");

console.log("parser-test: PASS");
