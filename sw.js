/* sw.js — network-first service worker.
   Always tries the network first so new versions appear automatically,
   and falls back to the last cached copy when offline. Replaces the old
   cache-first worker that made updates "stick" on the old version. */

var CACHE = "trip-cache-v2026-09-06";
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./shared/data.js"
];

/* Install the new worker immediately, don't wait for old tabs to close. */
self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ASSETS).catch(function () {}); /* ignore any missing */
    })
  );
});

/* On activation, delete old caches and take control of open pages. */
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) { if (k !== CACHE) return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

/* Network-first: fetch fresh, cache a copy, fall back to cache when offline. */
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(req).then(function (m) {
        return m || caches.match("./index.html");
      });
    })
  );
});
