/* 每秒进账 · 离线缓存
 * VERSION 每次发版同步修改；旧缓存会在 activate 时清掉。
 *
 * 关键修复：Cache API 里存的响应体已经是解码后的，如果还带着
 * Content-Encoding: br，iOS Safari 从缓存回放时会解码失败，表现为
 * 「Safari 打不开网页」。所以所有写缓存的响应都先去掉编码头。
 *
 * 导航策略：网络优先（900ms 超时），失败回退干净缓存，再失败给友好离线页。
 * 这样新版能立刻生效，慢网/断网也不会白屏。
 */
const VERSION = "1.4.3";
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
const STRIP = ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"];

async function cleanResponse(res) {
  const headers = new Headers(res.headers);
  STRIP.forEach((h) => headers.delete(h));
  const body = await res.arrayBuffer();
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

async function cachePut(cache, key, res) {
  try {
    await cache.put(key, await cleanResponse(res.clone()));
    return true;
  } catch (e) {
    return false;
  }
}

async function getHtml(cache) {
  const res = await cache.match("./index.html");
  if (!res || res.status !== 200) return null;
  if (res.headers.get("content-encoding")) return null;
  return res;
}

function offlinePage() {
  return new Response(
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>每秒进账 · 离线</title><style>' +
    'html,body{height:100%;margin:0;background:#08090b;color:#f3f5f7;' +
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;' +
    'display:grid;place-items:center;text-align:center}' +
    'div{padding:24px}p{color:#8b95a3;font-size:13px;line-height:1.8}' +
    'b{display:block;font-size:17px;margin-bottom:8px}' +
    'button{margin-top:18px;height:42px;padding:0 22px;border:0;border-radius:12px;' +
    'background:linear-gradient(135deg,#ffd76a,#f7b21a);color:#1a1204;font-size:14px;font-weight:700}' +
    '</style></head><body><div><b>还没连上</b><p>检查一下网络，再点下面重试。<br>第一次打开需要联网建立缓存。</p>' +
    '<button onclick="location.reload()">重试</button></div></body></html>',
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch(new Request("./index.html", { cache: "reload" }));
    if (!res || !res.ok) throw new Error("index fetch failed");
    await cachePut(cache, "./index.html", res.clone());
    if (!(await cache.match("./index.html"))) throw new Error("index not cached");
    await Promise.all(CORE.slice(1).map(async (url) => {
      try {
        const r = await fetch(url, { cache: "reload" });
        if (r && r.ok) await cachePut(cache, url, r.clone());
      } catch (e) {}
    }));
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
      let cache = null;
      try { cache = await caches.open(CACHE); } catch (e) {}

      // 网络优先，900ms 内没回来就用缓存
      const network = fetch(req);
      network.then((res) => {
        if (res && res.ok && cache) cachePut(cache, "./index.html", res.clone());
      }).catch(() => {});
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 900));
      try {
        const res = await Promise.race([network, timeout]);
        if (res && res.ok) return res;
      } catch (e) {}

      if (cache) {
        try {
          const cached = await getHtml(cache);
          if (cached) return cached;
        } catch (e) {}
      }
      return offlinePage();
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
    } catch (e) {}
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        try {
          const cache = await caches.open(CACHE);
          await cachePut(cache, req, res.clone());
        } catch (e) {}
      }
      return res;
    } catch (e) {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
