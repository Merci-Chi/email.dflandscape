const CACHE_NAME = 'dfl-email-mobile-actions-grid-2'
const APP_SHELL = [
  '/styles.css',
  '/app.js',
  '/mail.js',
  '/account-pages.js',
  '/manifest.json',
  '/assets/icon-192x192.png',
  '/assets/icon-512x512.png'
]

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await Promise.all(APP_SHELL.map(async url => {
      try {
        const response = await fetch(new Request(url, { cache: 'no-store' }))
        if (response.ok) await cache.put(url, response.clone())
      } catch {}
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter(key => key.startsWith('dfl-email-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate' || request.destination === 'document' || /\.html$/.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        return await fetch(new Request(request, { cache: 'no-store' }))
      } catch {
        return new Response(
          '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui;padding:24px">You are offline. Reconnect and refresh to load this page.</body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
        )
      }
    })())
    return
  }

  const isAppAsset =
    ['script', 'style', 'manifest', 'image'].includes(request.destination) ||
    /\.(?:js|css|json|png|jpg|jpeg|webp|svg)$/.test(url.pathname)

  if (!isAppAsset) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)

    try {
      const response = await fetch(new Request(request, { cache: 'no-store' }))
      if (response && response.ok) {
        cache.put(url.pathname, response.clone()).catch(() => {})
      }
      return response
    } catch (error) {
      const cached = await cache.match(request) || await cache.match(url.pathname)
      if (cached) return cached
      throw error
    }
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = event.notification?.data?.url || '/mail.html'

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })

    for (const client of windows) {
      try {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === self.location.origin) {
          await client.navigate(target)
          return client.focus()
        }
      } catch {}
    }

    return self.clients.openWindow(target)
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_APP_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter(key => key.startsWith('dfl-email-'))
          .map(key => caches.delete(key))
      )
    })())
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const data = event.data
    event.waitUntil(
      self.registration.showNotification(
        data.title || 'New email',
        {
          body: data.body || '',
          icon: '/assets/icon-192x192.png',
          badge: '/assets/icon-192x192.png',
          tag: data.tag || 'dfl-mail',
          renotify: true,
          data: {
            url: data.url || '/mail.html'
          }
        }
      )
    )
  }
})
