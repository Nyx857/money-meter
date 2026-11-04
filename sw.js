/* 每秒进账 · 离线缓存
 * 每次发版把 VERSION 改成新的版本号，旧缓存会在 activate 时清掉。
 * 页面导航先返回缓存（桌面/PWA 冷启动秒开），后台再拉一份最新的进缓存；
 * 新版本会在下一次打开时生效。
 */
const VERSION = "1.3.7";
const CACHE = "money-meter-" + VERSION;
const CORE = [
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 逐个 add，单个图标失败不影响整体安装
    await Promise.all(CORE.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match("./index.html");
      const network = fetch(req).then(async (res) => {
        if (res && res.ok) await cache.put("./index.html", res.clone());
        return res;
      }).catch(() => null);
      return cached || (await network) || Response.error();
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) await cache.put(req, res.clone());
      return res;
    } catch (e) {
      return Response.error();
    }
  })());
});
