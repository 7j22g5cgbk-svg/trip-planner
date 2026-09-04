/* Travel — minimal app-shell service worker.
   All paths are relative so this works from a GitHub Pages subpath. */
var CACHE = "travel-v16";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Never touch the API — always straight to the network.
  if (url.hostname === "api.anthropic.com") return;
  if (url.origin !== self.location.origin) return;

  // shared/data.js is the safety copy the app restores from, so it is always
  // network-first: a cached copy is kept only as an offline fallback and is
  // never served while the network can answer.
  if (url.pathname.indexOf("/shared/data.js") !== -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || Response.error();
        });
      })
    );
    return;
  }

  // The shared read-only page is not part of this app shell. This worker's
  // scope covers it, so leave it entirely alone: caching it here would serve
  // a stale data.js, and the offline fallback below would answer a /shared/
  // navigation with the main app.
  if (url.pathname.indexOf("/shared/") !== -1) return;

  // Navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html", { ignoreSearch: true })
          .then(function (hit) { return hit || caches.match("./"); });
      })
    );
    return;
  }

  // Everything else same-origin (icons, manifest): cache-first.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
