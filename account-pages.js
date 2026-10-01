// Prevent Safari/iOS double-tap zoom.
let lastTouchEnd = 0

document.addEventListener('touchend', event => {
  const now = Date.now()
  if (now - lastTouchEnd <= 300) event.preventDefault()
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

const manageEmailsLink = document.getElementById('manageEmailsLink')
if (manageEmailsLink) manageEmailsLink.hidden = true

const { data: accessRow, error: accessError } = await supabase
  .from('dflandscape_mail_access')
  .select('role, active')
  .eq('user_id', user.id)
  .maybeSingle()

const canManageEmails =
  !accessError &&
  accessRow?.active === true &&
  String(accessRow?.role || '').toLowerCase() === 'admin'

if (manageEmailsLink) {
  manageEmailsLink.hidden = !canManageEmails
}

if (
  window.location.pathname.endsWith('/manage-emails.html') &&
  !canManageEmails
) {
  window.location.replace('mail.html')
  throw new Error('No access to Manage Emails')
}

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

/* Additional email request flow */
const emailRequestModal = document.getElementById('emailRequestModal')
const emailRequestForm = document.getElementById('emailRequestForm')
const emailRequestFields = document.getElementById('emailRequestFields')
const emailRequestSuccess = document.getElementById('emailRequestSuccess')
const requestedEmailCount = document.getElementById('requestedEmailCount')
const requestedEmailNames = document.getElementById('requestedEmailNames')
const emailRequestTotal = document.getElementById('emailRequestTotal')
const emailRequestMessage = document.getElementById('emailRequestMessage')
const addEmailCountPreview = document.getElementById('addEmailCountPreview')
const emailRequestPaymentBtn = document.getElementById('emailRequestPaymentBtn')

function getBillingCycle() {
  return document.querySelector('input[name="billingCycle"]:checked')?.value || 'monthly'
}

function renderRequestedEmailFields() {
  if (!requestedEmailCount || !requestedEmailNames) return

  const count = Number(requestedEmailCount.value || 1)
  const existing = [...requestedEmailNames.querySelectorAll('input[data-email-name]')]
    .map(input => input.value)

  requestedEmailNames.innerHTML = Array.from({ length: count }, (_, index) => `
    <label class="request-field">
      Email ${index + 1} name
      <div class="email-name-row">
        <input
          type="text"
          data-email-name
          maxlength="64"
          placeholder="example"
          value="${escapeHtml(existing[index] || '')}"
          required
        >
        <span>@dflandscape.com</span>
      </div>
    </label>
  `).join('')

  if (addEmailCountPreview) {
    addEmailCountPreview.textContent = `${count} ${count === 1 ? 'email' : 'emails'}`
  }

  updateRequestTotal()
}

function updateRequestTotal() {
  if (!requestedEmailCount || !emailRequestTotal) return
  const count = Number(requestedEmailCount.value || 1)
  const cycle = getBillingCycle()

  if (cycle === 'yearly') {
    emailRequestTotal.textContent = `$${count * 24}/year`
  } else {
    emailRequestTotal.textContent = `$${count * 2}/month`
  }
}

function resetEmailRequestModal() {
  if (!emailRequestForm) return
  emailRequestForm.reset()
  if (requestedEmailCount) requestedEmailCount.value = '1'
  emailRequestMessage.textContent = ''
  emailRequestMessage.classList.remove('success')
  emailRequestFields?.classList.remove('hidden')
  emailRequestSuccess?.classList.add('hidden')

  if (emailRequestPaymentBtn) {
    emailRequestPaymentBtn.hidden = true
    emailRequestPaymentBtn.href = '#'
    emailRequestPaymentBtn.textContent = 'Continue to payment'
  }

  renderRequestedEmailFields()
}

function openEmailRequestModal() {
  resetEmailRequestModal()
  emailRequestModal?.classList.remove('hidden')
}

function closeEmailRequestModal() {
  emailRequestModal?.classList.add('hidden')
}

document.getElementById('openEmailRequestBtn')?.addEventListener('click', openEmailRequestModal)
document.getElementById('closeEmailRequestBtn')?.addEventListener('click', closeEmailRequestModal)
document.getElementById('closeRequestSuccessBtn')?.addEventListener('click', closeEmailRequestModal)

emailRequestModal?.addEventListener('click', event => {
  if (event.target === emailRequestModal) closeEmailRequestModal()
})

requestedEmailCount?.addEventListener('change', renderRequestedEmailFields)

document.querySelectorAll('input[name="billingCycle"]').forEach(input => {
  input.addEventListener('change', updateRequestTotal)
})

emailRequestForm?.addEventListener('submit', async event => {
  event.preventDefault()

  const submitButton = event.currentTarget.querySelector('button[type="submit"]')
  const quantity = Number(requestedEmailCount?.value || 1)
  const billingCycle = getBillingCycle()
  const names = [...requestedEmailNames.querySelectorAll('input[data-email-name]')]
    .map(input => input.value.trim())
  const usernames = names.map(name =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '')
      .replace(/^[._-]+|[._-]+$/g, '')
  )

  if (names.some(name => !name)) {
    emailRequestMessage.textContent = 'Enter a name for every email.'
    return
  }

  if (usernames.some(name => !name)) {
    emailRequestMessage.textContent = 'Each email needs at least one valid letter or number.'
    return
  }

  if (new Set(usernames).size !== usernames.length) {
    emailRequestMessage.textContent = 'Each requested email must have a different name.'
    return
  }

  const requestedEmails = usernames.map((username, index) => ({
    name: names[index],
    username,
    email: `${username}@dflandscape.com`
  }))

  emailRequestMessage.textContent = 'Submitting request...'
  submitButton.disabled = true

  const {
    data: request,
    error: requestError
  } = await supabase
    .from('dflandscape_email_requests')
    .insert({
      requested_by: user.id,
      requested_by_email: email,
      quantity,
      billing_cycle: billingCycle,
      price_per_email: billingCycle === 'yearly' ? 24 : 2,
      requested_emails: requestedEmails,
      status: 'pending'
    })
    .select('id')
    .single()

  if (requestError) {
    console.error(requestError)
    submitButton.disabled = false
    emailRequestMessage.textContent =
      requestError.message || 'Unable to submit request.'
    return
  }

  emailRequestMessage.textContent = 'Creating secure payment link...'

  const {
    data: paymentData,
    error: paymentError
  } = await supabase.functions.invoke(
    'create-email-payment-link',
    {
      body: {
        request_id: request.id
      }
    }
  )

  submitButton.disabled = false

  if (paymentError || !paymentData?.payment_link) {
    console.error(paymentError)
    emailRequestMessage.textContent =
      'Request saved, but the payment link could not be created.'
    return
  }

  if (emailRequestPaymentBtn) {
    emailRequestPaymentBtn.href = paymentData.payment_link
    emailRequestPaymentBtn.hidden = false
    emailRequestPaymentBtn.textContent =
      billingCycle === 'monthly'
        ? `Continue to payment — ${quantity * 2}/month`
        : `Continue to payment — ${quantity * 24}/year`
  }

  emailRequestMessage.textContent = ''
  emailRequestFields?.classList.add('hidden')
  emailRequestSuccess?.classList.remove('hidden')
})

if (requestedEmailCount) renderRequestedEmailFields()

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
