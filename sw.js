const CACHE_NAME = "t1-app-v14";
const CORE_ASSETS = [
  "./", "./index.html", "./utils.js", "./state.js", "./api.js",
  "./ui.js", "./app.js", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (url.hostname.includes("supabase.co")) return;
  if (request.method !== "GET") return;
  e.respondWith(
    fetch(request).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(request, copy)); }
      return res;
    }).catch(() => caches.match(request).then(m => m || caches.match("./index.html")))
  );
});
