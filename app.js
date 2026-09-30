// Prevent Safari/iOS double-tap zoom.
let lastTouchEnd = 0

document.addEventListener('touchend', event => {
  const now = Date.now()

  if (now - lastTouchEnd <= 300) {
    event.preventDefault()
  }

  lastTouchEnd = now
}, { passive: false })

// Keep the mobile viewport fixed at 100% while preserving normal scrolling.
for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(eventName, event => event.preventDefault(), { passive: false })
}

document.addEventListener('touchmove', event => {
  if (event.touches?.length > 1) event.preventDefault()
}, { passive: false })

document.addEventListener('wheel', event => {
  if (event.ctrlKey) event.preventDefault()
}, { passive: false })

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && ['+', '=', '-', '0'].includes(event.key)) {
    event.preventDefault()
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://wfxuxrvygyzonkflpwoq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_e2h4t8AvCobzftt36UrDbw_NJGq8qlJ'

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const loginForm = document.getElementById('loginForm')
const forgotForm = document.getElementById('forgotForm')
const firstLoginForm = document.getElementById('firstLoginForm')
const resetForm = document.getElementById('resetForm')
const authTitle = document.getElementById('authTitle')
const authSubtext = document.getElementById('authSubtext')
const loginMessage = document.getElementById('loginMessage')
const forgotMessage = document.getElementById('forgotMessage')
const firstLoginMessage = document.getElementById('firstLoginMessage')
const resetMessage = document.getElementById('resetMessage')

const eyeSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
const eyeOffSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"></path><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a16 16 0 0 1-2.2 3.2"></path><path d="M6.2 6.2C3.5 8.1 2 12 2 12s3.5 8 10 8a9.8 9.8 0 0 0 4.1-.9"></path></svg>'
const copySvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'

document.querySelectorAll('.password-toggle').forEach(button => {
  button.innerHTML = eyeSvg
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.target)
    const showing = input.type === 'text'
    input.type = showing ? 'password' : 'text'
    button.innerHTML = showing ? eyeSvg : eyeOffSvg
    button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password')
    button.title = showing ? 'Show password' : 'Hide password'
  })
})

document.querySelectorAll('.copy-password').forEach(button => {
  button.innerHTML = copySvg
  button.addEventListener('click', async () => {
    const input = document.getElementById(button.dataset.target)
    if (!input.value) return
    try {
      await navigator.clipboard.writeText(input.value)
      const original = button.innerHTML
      button.textContent = '✓'
      setTimeout(() => { button.innerHTML = original }, 900)
    } catch {
      input.select()
      document.execCommand('copy')
      input.setSelectionRange(input.value.length, input.value.length)
    }
  })
})

function showOnly(form) {
  [loginForm, forgotForm, firstLoginForm, resetForm].forEach(item => item.classList.add('hidden'))
  form.classList.remove('hidden')
}

function setHeading(title, subtitle) {
  authTitle.textContent = title
  authSubtext.textContent = subtitle
}

function validatePasswords(password, confirmPassword) {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password !== confirmPassword) return 'Passwords do not match.'
  return ''
}

async function routeSignedInUser(user) {
  if (!user) return
  const complete = user.user_metadata?.onboarding_complete === true
  if (!complete) {
    document.getElementById('displayName').value = user.user_metadata?.display_name || ''
    setHeading('Finish setup', 'Add your display name and choose your private login password.')
    showOnly(firstLoginForm)
    return
  }
  window.location.replace('mail.html')
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    setHeading('Reset password', 'Choose a new password for your company email login.')
    showOnly(resetForm)
  }
})

const { data: { session } } = await supabase.auth.getSession()
if (session?.user && !location.hash.includes('type=recovery')) {
  await routeSignedInUser(session.user)
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const email = document.getElementById('email').value.trim().toLowerCase()
  const password = document.getElementById('password').value
  const submitButton = loginForm.querySelector('button[type="submit"]')

  loginMessage.textContent = ''
  submitButton.disabled = true
  submitButton.textContent = 'Signing in...'

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await routeSignedInUser(data.user)
  } catch (error) {
    loginMessage.textContent = error.message === 'Invalid login credentials'
      ? 'Incorrect email or password.'
      : (error.message || 'Unable to sign in.')
  } finally {
    submitButton.disabled = false
    submitButton.textContent = 'Sign in'
  }
})

document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
  document.getElementById('forgotEmail').value = document.getElementById('email').value
  forgotMessage.textContent = ''
  setHeading('Forgot password', 'We will email you a secure password reset link.')
  showOnly(forgotForm)
})

document.getElementById('backToLoginBtn').addEventListener('click', () => {
  setHeading('Email', 'Sign in to your company mailbox.')
  showOnly(loginForm)
})

forgotForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const email = document.getElementById('forgotEmail').value.trim().toLowerCase()
  const submitButton = forgotForm.querySelector('button[type="submit"]')

  forgotMessage.textContent = ''
  submitButton.disabled = true
  submitButton.textContent = 'Sending...'

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://email.dflandscape.com'
    })
    if (error) throw error
    forgotMessage.classList.add('success')
    forgotMessage.textContent = 'Reset link sent. Check your inbox.'
  } catch (error) {
    forgotMessage.classList.remove('success')
    forgotMessage.textContent = error.message || 'Unable to send reset link.'
  } finally {
    submitButton.disabled = false
    submitButton.textContent = 'Send reset link'
  }
})

firstLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const displayName = document.getElementById('displayName').value.trim()
  const password = document.getElementById('firstNewPassword').value
  const confirmPassword = document.getElementById('firstConfirmPassword').value
  const submitButton = firstLoginForm.querySelector('button[type="submit"]')

  firstLoginMessage.textContent = ''
  const validationError = validatePasswords(password, confirmPassword)
  if (validationError) {
    firstLoginMessage.textContent = validationError
    return
  }
  if (!displayName) {
    firstLoginMessage.textContent = 'Enter a display name.'
    return
  }

  submitButton.disabled = true
  submitButton.textContent = 'Saving...'

  try {
    const { data, error } = await supabase.auth.updateUser({
      password,
      data: {
        display_name: displayName,
        onboarding_complete: true
      }
    })
    if (error) throw error
    if (!data.user) throw new Error('Unable to finish setup.')
    window.location.replace('mail.html')
  } catch (error) {
    firstLoginMessage.textContent = error.message || 'Unable to finish setup.'
  } finally {
    submitButton.disabled = false
    submitButton.textContent = 'Finish setup'
  }
})

resetForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const password = document.getElementById('resetPassword').value
  const confirmPassword = document.getElementById('resetConfirmPassword').value
  const submitButton = resetForm.querySelector('button[type="submit"]')

  resetMessage.textContent = ''
  const validationError = validatePasswords(password, confirmPassword)
  if (validationError) {
    resetMessage.textContent = validationError
    return
  }

  submitButton.disabled = true
  submitButton.textContent = 'Changing...'

  try {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    resetMessage.classList.add('success')
    resetMessage.textContent = 'Password changed. You can continue to your mailbox.'
    setTimeout(() => window.location.replace('mail.html'), 900)
  } catch (error) {
    resetMessage.classList.remove('success')
    resetMessage.textContent = error.message || 'Unable to change password.'
  } finally {
    submitButton.disabled = false
    submitButton.textContent = 'Change password'
  }
})
