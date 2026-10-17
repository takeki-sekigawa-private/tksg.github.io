/* 北関東旅行 Service Worker: ホーム画面追加・オフライン表示用 */
var VER = 'kk-v1.25';
var SHELL = VER + '-shell', RT = VER + '-rt', TILES = 'kk-tiles';
var SHELL_FILES = ['./', './index.html', './kusatsu-town-map.jpg', './manifest.webmanifest', './icon-192.png', './icon-180.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
/* 写真共有・解析・天気APIはキャッシュしない（常に最新を取得） */
var BYPASS = /firestore\.googleapis|identitytoolkit|securetoken|googletagmanager|google-analytics|open-meteo|firebaseinstallations/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return Promise.all(SHELL_FILES.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== RT && k !== TILES; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function trim(name, max) {
  caches.open(name).then(function (c) { c.keys().then(function (ks) { if (ks.length > max) { for (var i = 0; i < ks.length - max; i++) c.delete(ks[i]); } }); });
}
function swr(req, name, max) {
  return caches.open(name).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); trim(name, max); }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (BYPASS.test(url.hostname)) return;
  /* ページ本体: ネット優先（3.5秒で諦めて保存版を表示） */
  if (req.mode === 'navigate') {
    e.respondWith(new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { caches.match('./index.html', { ignoreSearch: true }).then(function (r) { if (r && !done) { done = true; resolve(r); } }); }, 3500);
      fetch(req).then(function (res) {
        if (res.ok) { var cp = res.clone(); caches.open(SHELL).then(function (c) { c.put('./index.html', cp); }); }
        if (!done) { done = true; clearTimeout(timer); resolve(res); }
      }).catch(function () {
        caches.match('./index.html', { ignoreSearch: true }).then(function (r) { if (!done) { done = true; clearTimeout(timer); resolve(r || Response.error()); } });
      });
    }));
    return;
  }
  /* 地図タイル: キャッシュ優先 */
  if (/cyberjapandata\.gsi\.go\.jp|tile\.openstreetmap\.org/.test(url.hostname)) {
    e.respondWith(caches.open(TILES).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); trim(TILES, 600); } return res; });
      });
    }));
    return;
  }
  /* それ以外（画像・フォント・ライブラリ・写真）: 保存版を即表示しつつ裏で更新 */
  e.respondWith(swr(req, url.origin === location.origin ? SHELL : RT, 200));
});
