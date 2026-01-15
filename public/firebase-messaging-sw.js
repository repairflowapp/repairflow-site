/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

firebase.initializeApp({
// paste your Firebase config (same one from your web app)
});

const messaging = firebase.messaging();

// Shows notification when browser is CLOSED / in background
messaging.onBackgroundMessage((payload) => {
const title = payload?.notification?.title || "Notification";
const options = {
body: payload?.notification?.body || "",
data: payload?.data || {},
};
self.registration.showNotification(title, options);
});

// Optional: handle click
self.addEventListener("notificationclick", (event) => {
event.notification.close();
event.waitUntil(self.clients.openWindow("/")); // change to your route if you want
});


