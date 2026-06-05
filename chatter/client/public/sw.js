// Chatter Service Worker
// Handles push notifications ONLY — does NOT intercept any fetch/cache requests
// to avoid breaking asset loading on production (Render/Vercel etc.)

// Install — skip waiting so the new SW takes over immediately
self.addEventListener("install", () => {
  self.skipWaiting();
});

// Activate — claim all clients immediately, clean nothing (no caches used)
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// DO NOT add a fetch handler here.
// Intercepting fetch causes the SW to interfere with JS bundle loading,
// API calls, and other network requests — leading to a black screen.
// All network requests go directly to the server (default browser behaviour).

// Handle push notifications from server
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Chatter", body: event.data ? event.data.text() : "New message" };
  }

  const title = data.title || "Chatter";
  const options = {
    body: data.body || "You have a new message",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "chatter-notification",
    renotify: true,
    data: data.data || {},
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click — open or focus the app
self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  notification.close();

  const sender = notification.data ? notification.data.sender : null;
  const targetPath = sender ? `/chat/${sender}` : "/chats";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing open window if any
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.focus();
          if (sender && "postMessage" in client) {
            client.postMessage({ type: "navigate", chat: sender });
          }
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});