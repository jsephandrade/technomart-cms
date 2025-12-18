/**
 * Service Worker for Push Notifications
 * Handles push notification display and click events
 */

const CACHE_NAME = 'technomart-notifications-v1';

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(['/', '/index.html', '/manifest.json']);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received', event);

  let notificationData = {
    title: 'New Notification',
    message: 'You have a new notification',
    type: 'info',
    timestamp: new Date().toISOString(),
  };

  try {
    if (event.data) {
      notificationData = event.data.json();
    }
  } catch (error) {
    console.error('[Service Worker] Failed to parse push data:', error);
  }

  const { title, message, type = 'info', timestamp } = notificationData;

  // Determine icon and badge based on notification type
  const icon = '/logo192.png';
  const badge = '/logo192.png';

  const options = {
    body: message,
    icon: icon,
    badge: badge,
    vibrate: [200, 100, 200],
    tag: `notification-${timestamp}`,
    requireInteraction: type === 'error' || type === 'warning',
    data: {
      timestamp,
      type,
      url: '/',
    },
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/icons/view.png',
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/dismiss.png',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch((error) => {
      console.error('[Service Worker] Failed to show notification:', error);
    })
  );
});

// Notification click event - handle user interaction
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click received', event);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Default action or 'view' action - open the app
  event.waitUntil(
    self.clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // If a window is already open, focus it
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }

        // Otherwise, open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow('/notifications');
        }
      })
  );
});

// Handle notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification closed', event);
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET requests. This avoids noisy console errors when
  // third-party resources (fonts, auth scripts) are blocked/unavailable.
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Never interfere with API/media requests.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/media')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response;
      return fetch(event.request).catch(() => {
        // SPA fallback when offline.
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
