const CACHE_NAME = 'dfl-email-runtime-v1'

self.addEventListener('install', event => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(key => key.startsWith('dfl-email-') && key !== CACHE_NAME).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const isAppAsset =
    request.mode === 'navigate' ||
    ['document', 'script', 'style', 'manifest'].includes(request.destination) ||
    /\.(?:html|js|css|json)$/.test(url.pathname)

  if (!isAppAsset) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    try {
      const freshRequest = new Request(request, { cache: 'no-store' })
      const response = await fetch(freshRequest)
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {})
      }
      return response
    } catch (error) {
      const cached = await cache.match(request)
      if (cached) return cached
      throw error
    }
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_APP_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter(key => key.startsWith('dfl-email-')).map(key => caches.delete(key)))
    })())
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
