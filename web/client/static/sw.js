/**
 * tindone's service worker: shows the push notifications id.kbn.one delivers.
 *
 * The subscription is made in the page (`client/islands/push_button.tsx`) and stored on the IdP,
 * which signs each push with its own VAPID key. This worker only turns a push into a notification
 * and a click into a window. Served at `/sw.js` so its scope is the whole app.
 */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const parse = (event) => {
  if (!event.data) return {};
  try {
    const json = event.data.json();
    return typeof json === "object" && json !== null ? json : {};
  } catch {
    return { body: event.data.text() };
  }
};

// The Badging API count the IdP forwards, when the server sent one. 0 clears the badge.
const applyBadge = async (count) => {
  if (typeof count !== "number" || !Number.isFinite(count)) return;
  try {
    if (count > 0 && "setAppBadge" in navigator) {
      await navigator.setAppBadge(Math.trunc(count));
    } else if ("clearAppBadge" in navigator) {
      await navigator.clearAppBadge();
    }
  } catch {
    // Badging unavailable — nothing to do.
  }
};

self.addEventListener("push", (event) => {
  const data = parse(event);
  const title = typeof data.title === "string" && data.title.trim()
    ? data.title
    : "tindone";
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "You have an update.",
      icon: typeof data.icon === "string" ? data.icon : "/static/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url: typeof data.url === "string" ? data.url : "/" },
    }),
    applyBadge(data.badgeCount),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow?.(url);
  })());
});
