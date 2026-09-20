const fs = require("fs");
const path = require("path");
const vm = require("vm");

const now = Date.now();
const localData = {
  verificationCacheV3: {
    test: {
      createdAt: now,
      results: { "example.com": { status: "unavailable" } },
      officialResults: []
    }
  },
  verificationCacheV2: {
    test: {
      createdAt: now,
      results: { "example.com": { status: "official" } },
      officialResults: []
    }
  },
  verificationLastGoodV1: {
    stale: {
      createdAt: now,
      ttlMs: 7 * 24 * 60 * 60 * 1000,
      results: { "example.com": { status: "official", reason: "previous success" } },
      officialResults: []
    }
  }
};

const context = {
  URL,
  Date,
  Object,
  Array,
  Set,
  String,
  console,
  BaiduParser: { parse() { return { ok: false, reason: "unused" }; } },
  importScripts() {},
  chrome: {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} }
    },
    storage: {
      sync: {
        async get(defaults) { return defaults; },
        async set() {}
      },
      local: {
        async get(keys) {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(requested.filter((key) => key in localData).map((key) => [key, localData[key]]));
        },
        async set(value) { Object.assign(localData, value); },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete localData[key];
        }
      }
    }
  }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), context);

(async () => {
  const cached = await context.readCache("test");
  if (cached?.results?.["example.com"]?.status !== "official") {
    throw new Error("Did not fall back from unavailable V3 cache to successful V2 cache");
  }

  await context.writeCache("failed", {
    results: { "example.com": { status: "unavailable" } },
    officialResults: []
  });
  if (localData.verificationCacheV3.failed) throw new Error("Unavailable result was cached");

  const stale = await context.verifyDomains({
    query: "stale",
    items: [{ domain: "example.com", url: "https://example.com/" }]
  });
  if (!stale.stale || stale.results["example.com"].status !== "official") {
    throw new Error("Did not use the last successful result after a fetch failure");
  }
  if (!stale.results["example.com"].reason.includes("本次刷新失败")) {
    throw new Error("Stale result did not explain the refresh failure");
  }

  console.log("background-cache-test: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
