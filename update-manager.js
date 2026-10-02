(() => {
  const CHECK_EVERY_MS = 2 * 60 * 1000
  const INITIAL_CHECK_DELAY_MS = 8000
  const STORAGE_KEY = 'dfl_email_deploy_fingerprint_v1'
  const WATCH_FILES = [
    '/',
    '/index.html',
    '/mail.html',
    '/settings.html',
    '/manage-emails.html',
    '/app.js',
    '/mail.js',
    '/account-pages.js',
    '/styles.css',
    '/manifest.json',
    '/update-manager.js',
    '/service-worker.js'
  ]

  let checkInFlight = false
  let updatePending = false
  let updateFingerprint = ''
  let banner = null

  function absolutePath(path) {
    return new URL(path, location.origin).href
  }

  async function sha256(text) {
    if (!crypto?.subtle) {
      let hash = 2166136261
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      return String(hash >>> 0)
    }

    const data = new TextEncoder().encode(text)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  }

  async function getDeployFingerprint() {
    const parts = []

    for (const path of WATCH_FILES) {
      try {
        const url = new URL(absolutePath(path))
        url.searchParams.set('__dfl_update_check', Date.now().toString())

        const response = await fetch(url.href, {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'Cache-Control': 'no-cache' }
        })

        if (!response.ok) {
          parts.push(path + ':missing:' + response.status)
          continue
        }

        const text = await response.text()
        parts.push(path + ':' + await sha256(text))
      } catch (error) {
        parts.push(path + ':unavailable')
      }
    }

    return sha256(parts.join('|'))
  }

  function hasUnsavedWork() {
    const active = document.activeElement
    if (active && (active.matches?.('input, textarea, select, [contenteditable="true"]'))) {
      return true
    }

    const compose = document.getElementById('composeModal')
    if (compose && !compose.classList.contains('hidden')) {
      const values = [...compose.querySelectorAll('input, textarea, select')]
        .some(field => String(field.value || '').trim().length > 0)
      if (values) return true
    }

    return [...document.querySelectorAll('form')].some(form => {
      if (form.id === 'loginForm' || form.id === 'forgotForm' || form.id === 'resetForm' || form.id === 'firstLoginForm') {
        return false
      }
      return [...form.querySelectorAll('input:not([type="hidden"]), textarea, select')]
        .some(field => {
          if (field.type === 'checkbox' || field.type === 'radio') {
            return field.checked !== field.defaultChecked
          }
          return String(field.value ?? '') !== String(field.defaultValue ?? '')
        })
    })
  }

  function injectBannerStyles() {
    if (document.getElementById('dflUpdateStyles')) return
    const style = document.createElement('style')
    style.id = 'dflUpdateStyles'
    style.textContent = `
      .dfl-update-banner{position:fixed;z-index:99999;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(calc(100% - 24px),460px);background:#173622;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:13px;box-shadow:0 16px 50px rgba(8,23,13,.28);padding:12px 13px;display:flex;align-items:center;gap:12px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
      .dfl-update-copy{min-width:0;flex:1}.dfl-update-copy strong{display:block;font-size:13px;margin-bottom:2px}.dfl-update-copy span{display:block;font-size:11px;line-height:1.35;color:#dce8de}
      .dfl-update-btn{border:0;border-radius:8px;background:#fff;color:#173622;font-weight:900;font-size:12px;padding:9px 11px;white-space:nowrap}
    `
    document.head.appendChild(style)
  }

  function showUpdateBanner() {
    if (banner) return
    injectBannerStyles()

    banner = document.createElement('div')
    banner.className = 'dfl-update-banner'
    banner.setAttribute('role', 'status')
    banner.innerHTML = `
      <div class="dfl-update-copy">
        <strong>Update ready</strong>
        <span>A newer version of DFL Email is ready. Your current work will stay here until you update.</span>
      </div>
      <button class="dfl-update-btn" type="button">Update now</button>
    `

    banner.querySelector('button').addEventListener('click', () => applyUpdate())
    document.body.appendChild(banner)
  }

  async function applyUpdate() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.filter(key => key.startsWith('dfl-email-')).map(key => caches.delete(key)))
      }

      const registration = await navigator.serviceWorker?.getRegistration?.()
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
      registration?.active?.postMessage({ type: 'CLEAR_APP_CACHE' })
    } catch (error) {
      console.warn('DFL updater cache clear skipped:', error)
    }

    if (updateFingerprint) {
      localStorage.setItem(STORAGE_KEY, updateFingerprint)
    }

    const url = new URL(location.href)
    url.searchParams.set('__updated', Date.now().toString())
    location.replace(url.href)
  }

  async function handleDetectedUpdate(fingerprint) {
    updatePending = true
    updateFingerprint = fingerprint

    if (hasUnsavedWork()) {
      showUpdateBanner()
      return
    }

    window.setTimeout(() => {
      if (hasUnsavedWork()) {
        showUpdateBanner()
      } else {
        applyUpdate()
      }
    }, 900)
  }

  async function checkForUpdate() {
    if (checkInFlight || !navigator.onLine) return
    checkInFlight = true

    try {
      const fingerprint = await getDeployFingerprint()
      if (!fingerprint) return

      const previous = localStorage.getItem(STORAGE_KEY)

      if (!previous) {
        localStorage.setItem(STORAGE_KEY, fingerprint)
        return
      }

      if (fingerprint !== previous) {
        await handleDetectedUpdate(fingerprint)
      }
    } catch (error) {
      console.warn('DFL update check failed:', error)
    } finally {
      checkInFlight = false
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return

    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
        updateViaCache: 'none'
      })

      registration.update().catch(() => {})

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            checkForUpdate()
          }
        })
      })
    } catch (error) {
      console.warn('DFL service worker registration failed:', error)
    }
  }

  registerServiceWorker()

  window.setTimeout(checkForUpdate, INITIAL_CHECK_DELAY_MS)
  window.setInterval(checkForUpdate, CHECK_EVERY_MS)

  window.addEventListener('online', checkForUpdate)
  window.addEventListener('focus', () => {
    if (updatePending && !hasUnsavedWork()) applyUpdate()
    else checkForUpdate()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (updatePending && !hasUnsavedWork()) applyUpdate()
    else checkForUpdate()
  })

  document.addEventListener('submit', () => {
    if (!updatePending) return
    window.setTimeout(() => {
      if (!hasUnsavedWork()) applyUpdate()
    }, 1200)
  })
})()
