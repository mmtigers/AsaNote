// キャッシュ名を上げると旧キャッシュを一掃する。
const CACHE_NAME = "yoru-note-shell-v1";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// ナビゲーションはネットワーク優先、失敗時はキャッシュ済みシェルへフォールバック(通信断対策)。
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Supabase等の他オリジンへのAPIリクエストはキャッシュ対象外(常にネットワークへ)。
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // アプリ内リンク遷移でNext.jsが取得するRSCデータ(URLに`?_rsc=`が付き、`RSC`ヘッダを持つ)は
  // キャッシュしない。キャッシュ優先で返すと更新後も古いデータが残り続け、保存先も際限なく
  // 増えるため。取得に失敗したときはNext.jsがページ全体の遷移(上のnavigate分岐)に切り替える。
  if (url.searchParams.has("_rsc") || request.headers.has("RSC")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

// 未入力日のリマインドPush通知。送信側(supabase/functions/send-reminders)は
// { title, body, url } のJSONを送る。ペイロードが読めない場合は最低限の表示にフォールバックする。
self.addEventListener("push", (event) => {
  let payload = { title: "よるノート", body: "今夜の記録がまだのようです", url: "/" };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      // JSONでなければ既定文言のまま表示する。
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    })
  );
});

// 通知タップでアプリを開く/前面に出す。既に開いているタブがあればそこへフォーカスする。
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
