const CACHE = 'jj-camera-v1';
const OFFLINE_URL = '/phone-camera.html';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([OFFLINE_URL, '/jj-trades-logo.jpg'])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// Keep alive ping every 20 seconds from the page
self.addEventListener('message', e => {
  if (e.data === 'keepalive') {
    e.ports[0]?.postMessage('alive');
  }
});
