// ── firebase-messaging-sw.js ──
// Must live at the ROOT of your site (same level as index.html)
// GitHub Pages: commit this file to your repo root

importScripts("https://www.gstatic.com/firebasejs/10.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.6.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "AIzaSyBhrDmhz7xPfHIVPUrgJzQTWD7L005U9jo",
  authDomain:        "studyhaven-35eab.firebaseapp.com",
  projectId:         "studyhaven-35eab",
  storageBucket:     "studyhaven-35eab.firebasestorage.app",
  messagingSenderId: "1088021134661",
  appId:             "1:1088021134661:web:ccfbe3efcb367a15b6122c",
});

const messaging = firebase.messaging();

// ── Background message handler ──
// Fires when the app is NOT in the foreground (tab closed / minimised)
messaging.onBackgroundMessage(payload => {
  const { title, body, icon, url } = payload.notification || payload.data || {};
  self.registration.showNotification(title || "StudyHaven", {
    body:    body  || "You have a new reminder.",
    icon:    icon  || "/icons/icon-192.png",
    badge:   "/icons/badge-72.png",
    data:    { url: url || "/" },
    vibrate: [200, 100, 200],
    actions: [
      { action: "open",    title: "Open StudyHaven" },
      { action: "dismiss", title: "Dismiss" },
    ],
  });
});

// ── Notification click handler ──
self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes("studyhaven") && "focus" in c);
      if (existing) return existing.focus();
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
