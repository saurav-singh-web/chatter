const CACHE_NAME = "chatter-v1";

// Install — skip waiting
self.addEventListener("install", (event) => {
  console.log("Chatter SW: Installed");
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — only cache in production, skip all dev/API requests
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // skip everything that's not a real page/asset request
  if (
    url.includes("ws://") ||
    url.includes("wss://") ||
    url.includes("localhost:8080") ||
    url.includes("@vite") ||
    url.includes("@react-refresh") ||
    url.includes("hot-update") ||
    url.includes("src/") ||
    url.includes("node_modules")
  ) {
    return; // let it go to network normally
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match("/index.html");
    })
  );
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  notification.close();

  const sender = notification.data ? notification.data.sender : null;
  const targetPath = sender ? `/chat/${sender}` : "/chats";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // 1. Try to find an existing open window/tab of the app
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          // Focus the window
          client.focus();
          // Send a message to the client tab to navigate to the chat
          if (sender && "postMessage" in client) {
            client.postMessage({ type: "navigate", chat: sender });
          }
          return;
        }
      }
      // 2. If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});