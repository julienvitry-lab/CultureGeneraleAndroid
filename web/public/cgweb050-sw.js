"use strict";

const CACHE = "cgweb050-shell-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./cgweb044.css",
  "./cgweb044.js",
  "./cgweb045.css","./cgweb045.js",
  "./cgweb046.css","./cgweb046.js",
  "./cgweb047.css","./cgweb047.js",
  "./cgweb048.css","./cgweb048.js",
  "./cgweb049.css","./cgweb049.js",
  "./cgweb050.css","./cgweb050.js",
  "./cgweb051.css","./cgweb051.js",
  "./cgweb052.css","./cgweb052.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map(async (url) => {
      const res = await fetch(url, { cache: "reload" });
      if (res.ok) await cache.put(url, res.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("cgweb050-shell-") && k !== CACHE).map((k) => caches.delete(k)));
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
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        if (fresh.ok) cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match(req)) || (await caches.match("./index.html"));
      }
    })());
    return;
  }

  if (!/\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|json|webmanifest)$/i.test(url.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async (res) => {
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
