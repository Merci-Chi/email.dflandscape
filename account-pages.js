// Prevent Safari/iOS double-tap zoom.
let lastTouchEnd = 0

document.addEventListener('touchend', event => {
  const now = Date.now()

  if (now - lastTouchEnd <= 300) {
    event.preventDefault()
  }

  lastTouchEnd = now
}, { passive: false })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://wfxuxrvygyzonkflpwoq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_e2h4t8AvCobzftt36UrDbw_NJGq8qlJ'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const { data: { session } } = await supabase.auth.getSession()

if (!session?.user) {
  window.location.replace('index.html')
  throw new Error('Not authenticated')
}

const user = session.user
const email = (user.email || '').toLowerCase()
const displayName = user.user_metadata?.display_name || email.split('@')[0] || 'Mailbox'

const accountList = document.getElementById('accountList')
if (accountList) {
  accountList.innerHTML = `
    <a class="account-btn active" href="mail.html" style="text-decoration:none">
      <span class="account-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2"></rect>
          <path d="m4 7 8 6 8-6"></path>
        </svg>
      </span>
      <span class="account-copy">
        <strong>${escapeHtml(displayName)}</strong>
        <span>${escapeHtml(email)}</span>
      </span>
    </a>
  `
}

const settingsEmail = document.getElementById('settingsEmail')
const settingsDisplayName = document.getElementById('settingsDisplayName')
if (settingsEmail) settingsEmail.value = email
if (settingsDisplayName) settingsDisplayName.value = displayName

const managedEmailList = document.getElementById('managedEmailList')
if (managedEmailList) {
  managedEmailList.innerHTML = `
    <div class="email-account-row">
      <div class="email-account-copy">
        <strong>${escapeHtml(displayName)}</strong>
        <span>${escapeHtml(email)}</span>
      </div>
      <span class="email-badge">Primary</span>
    </div>
  `
}

document.getElementById('profileForm')?.addEventListener('submit', async event => {
  event.preventDefault()
  const button = event.currentTarget.querySelector('button[type="submit"]')
  const message = document.getElementById('profileMessage')
  const newDisplayName = settingsDisplayName.value.trim()

  message.classList.remove('success')
  message.textContent = ''
  button.disabled = true

  const { error } = await supabase.auth.updateUser({
    data: { display_name: newDisplayName }
  })

  button.disabled = false

  if (error) {
    message.textContent = error.message || 'Unable to save profile.'
    return
  }

  message.classList.add('success')
  message.textContent = 'Profile updated.'
})

document.getElementById('passwordForm')?.addEventListener('submit', async event => {
  event.preventDefault()
  const button = event.currentTarget.querySelector('button[type="submit"]')
  const message = document.getElementById('passwordMessage')
  const password = document.getElementById('settingsPassword').value
  const confirmPassword = document.getElementById('settingsPasswordConfirm').value

  message.classList.remove('success')
  message.textContent = ''

  if (password.length < 8) {
    message.textContent = 'Password must be at least 8 characters.'
    return
  }

  if (password !== confirmPassword) {
    message.textContent = 'Passwords do not match.'
    return
  }

  button.disabled = true
  const { error } = await supabase.auth.updateUser({ password })
  button.disabled = false

  if (error) {
    message.textContent = error.message || 'Unable to update password.'
    return
  }

  event.currentTarget.reset()
  message.classList.add('success')
  message.textContent = 'Password updated.'
})

document.querySelector('.signout')?.addEventListener('click', async event => {
  event.preventDefault()
  await supabase.auth.signOut()
  window.location.replace('index.html')
})

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  }[char]))
}
