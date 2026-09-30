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

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
)

const {
  data: { session }
} = await supabase.auth.getSession()

if (!session?.user) {
  window.location.replace('index.html')
  throw new Error('Not authenticated')
}

const loggedInEmail = (session.user.email || '').toLowerCase()
const loggedInName =
  session.user.user_metadata?.display_name ||
  loggedInEmail.split('@')[0] ||
  'Mailbox'

const accounts = loggedInEmail
  ? [{
      name: loggedInName,
      email: loggedInEmail
    }]
  : []

let activeAccount = accounts[0] || null
let activeFolder = 'Inbox'
let activeMessageId = null
let currentMessages = []

const accountList = document.getElementById('accountList')
const mailboxHeading = document.getElementById('mailboxHeading')
const mailboxAddress = document.getElementById('mailboxAddress')
const messageList = document.getElementById('messageList')
const readerPanel = document.getElementById('readerPanel')
const searchInput = document.getElementById('searchInput')
const composeModal = document.getElementById('composeModal')
const composeFrom = document.getElementById('composeFrom')
const manageEmailsLink = document.getElementById('manageEmailsLink')

async function applyManageEmailsAccess() {
  // Deny by default. Only an active Supabase row with role=admin can reveal the link.
  if (manageEmailsLink) manageEmailsLink.hidden = true

  const { data, error } = await supabase
    .from('dflandscape_mail_access')
    .select('role, active')
    .eq('user_id', session.user.id)
    .maybeSingle()

  const isAdmin =
    !error &&
    data?.active === true &&
    String(data?.role || '').toLowerCase() === 'admin'

  if (manageEmailsLink) {
    manageEmailsLink.hidden = !isAdmin
  }
}

await applyManageEmailsAccess()

function accountIcon() {
  return `
    <span class="account-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2"></rect>
        <path d="m4 7 8 6 8-6"></path>
      </svg>
    </span>
  `
}

function emptyMailIcon() {
  return `
    <div class="mail-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round"
        stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2"></rect>
        <path d="m4 7 8 6 8-6"></path>
      </svg>
    </div>
  `
}

async function callMailFunction(payload) {
  const {
    data: { session }
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    window.location.replace('index.html')
    throw new Error('Not signed in.')
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/dflandscape-mail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify(payload)
    }
  )

  const result = await response.json()

  if (!response.ok) {
    throw new Error(
      result.error || 'Mail request failed.'
    )
  }

  return result.data
}

function renderAccounts() {
  if (!accounts.length) {
    accountList.innerHTML =
      '<div class="no-access">No mailbox access.</div>'
    return
  }

  accountList.innerHTML = accounts.map(account => `
    <button
      class="account-btn ${
        account.email === activeAccount.email ? 'active' : ''
      }"
      data-email="${account.email}"
    >
      ${accountIcon()}
      <span class="account-copy">
        <strong>${account.name}</strong>
        <span>${account.email}</span>
      </span>
    </button>
  `).join('')

  accountList
    .querySelectorAll('.account-btn')
    .forEach(btn => {
      btn.addEventListener('click', async () => {
        activeAccount = accounts.find(
          a => a.email === btn.dataset.email
        )

        activeMessageId = null
        renderAccounts()
        await loadMessages()
        renderReader()
        renderComposeAccounts()
      })
    })
}

async function loadMessages() {
  if (!activeAccount) return

  mailboxHeading.textContent = activeFolder
  mailboxAddress.textContent = activeAccount.email

  messageList.innerHTML = `
    <div class="empty-reader" style="height:220px">
      <strong>Loading mail...</strong>
    </div>
  `

  try {
    currentMessages = await callMailFunction({
      action: 'list',
      folder: activeFolder
    })

    renderMessages()
  } catch (error) {
    console.error(error)

    messageList.innerHTML = `
      <div class="empty-reader" style="height:220px">
        <strong>Unable to load mail</strong>
        <span>${escapeHtml(error.message)}</span>
      </div>
    `
  }
}

function renderMessages() {
  const query =
    searchInput.value.trim().toLowerCase()

  let messages = [...currentMessages]

  if (query) {
    messages = messages.filter(message =>
      `
        ${message.sender}
        ${message.from}
        ${message.subject}
      `
        .toLowerCase()
        .includes(query)
    )
  }

  if (!messages.length) {
    messageList.innerHTML = `
      <div class="empty-reader" style="height:220px">
        <strong>No messages</strong>
        <span>This folder is empty.</span>
      </div>
    `
    return
  }

  messageList.innerHTML = messages
    .map(message => `
      <button
        class="message-row ${
          String(message.uid) === String(activeMessageId)
            ? 'active'
            : ''
        }"
        data-id="${message.uid}"
      >
        <span class="sender">
          ${escapeHtml(message.sender || message.from)}
        </span>

        <span class="time">
          ${escapeHtml(formatDate(message.date))}
        </span>

        <span class="subject">
          ${escapeHtml(message.subject || '(No subject)')}
        </span>

        <span class="snippet">
          ${escapeHtml(message.from || '')}
        </span>
      </button>
    `)
    .join('')

  messageList
    .querySelectorAll('.message-row')
    .forEach(row => {
      row.addEventListener('click', async () => {
        activeMessageId = row.dataset.id
        renderMessages()
        await loadMessage(activeMessageId)
      })
    })
}

function sanitizeEmailHtml(html = '') {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  doc.querySelectorAll('script,iframe,object,embed,form,input,button,textarea,select,base').forEach(el => el.remove())
  doc.querySelectorAll('meta[http-equiv]').forEach(el => el.remove())

  doc.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()

      if (name.startsWith('on')) el.removeAttribute(attr.name)
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:')) {
        el.removeAttribute(attr.name)
      }
    }
  })

  doc.querySelectorAll('a[href]').forEach(link => {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  })

  const style = doc.createElement('style')
  style.textContent = `
    html,body{margin:0;padding:0;background:#fff;color:#222;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;overflow-wrap:anywhere}
    body{padding:18px;box-sizing:border-box}
    img{max-width:100%!important;height:auto!important}
    table{max-width:100%!important}
    a{color:#245f35}
  `
  doc.head.appendChild(style)

  return '<!doctype html>' + doc.documentElement.outerHTML
}

function looksLikeHtml(value = '') {
  const text = String(value || '').trim()
  if (!text) return false
  return /<!doctype\s+html|<html[\s>]|<body[\s>]|<(?:div|table|p|span|img|a|style|h[1-6]|br|blockquote)[\s>]/i.test(text)
}

function collectMessageStrings(value, path = '', output = [], depth = 0) {
  if (depth > 5 || value == null) return output

  if (typeof value === 'string') {
    const text = value.trim()
    if (text) output.push({ path: path.toLowerCase(), value: text })
    return output
  }

  if (Array.isArray(value)) {
    value.slice(0, 30).forEach((item, index) => {
      collectMessageStrings(item, path + '[' + index + ']', output, depth + 1)
    })
    return output
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/^(attachments?|headers?|envelope)$/i.test(key)) continue
      collectMessageStrings(item, path ? path + '.' + key : key, output, depth + 1)
    }
  }

  return output
}

function isBodyPlaceholder(value = '') {
  return /^this message (?:does not contain a plain-text body|has no readable body)\.?$/i.test(
    String(value || '').trim()
  )
}

function getMessageHtml(message = {}) {
  const candidates = [
    message.html,
    message.htmlBody,
    message.bodyHtml,
    message.body_html,
    message.textAsHtml,
    message.text_as_html,
    message.content?.html,
    message.content?.htmlBody,
    message.content?.textAsHtml,
    message.contentHtml,
    message.data?.html,
    message.data?.htmlBody,
    message.data?.textAsHtml
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && looksLikeHtml(candidate)) {
      return candidate
    }
  }

  const strings = collectMessageStrings(message)

  const preferred = strings
    .filter(item =>
      !isBodyPlaceholder(item.value) &&
      looksLikeHtml(item.value) &&
      /(html|body|content|message|textashtml|source|raw)/i.test(item.path)
    )
    .sort((a, b) => b.value.length - a.value.length)

  if (preferred[0]) return preferred[0].value

  const anyHtml = strings
    .filter(item => !isBodyPlaceholder(item.value) && looksLikeHtml(item.value))
    .sort((a, b) => b.value.length - a.value.length)

  return anyHtml[0]?.value || ''
}

function getMessageText(message = {}) {
  const candidates = [
    message.body,
    message.text,
    message.textBody,
    message.bodyText,
    message.body_text,
    message.plainText,
    message.plain_text,
    message.content?.text,
    message.content?.textBody,
    message.content?.plainText,
    message.data?.text,
    message.data?.body,
    message.data?.textBody
  ]

  for (const candidate of candidates) {
    if (
      typeof candidate === 'string' &&
      candidate.trim() &&
      !looksLikeHtml(candidate) &&
      !isBodyPlaceholder(candidate)
    ) {
      return candidate
    }
  }

  const strings = collectMessageStrings(message)
    .filter(item =>
      !isBodyPlaceholder(item.value) &&
      !looksLikeHtml(item.value) &&
      item.value.length > 40 &&
      /(body|text|content|message|plain|source|raw)/i.test(item.path)
    )
    .sort((a, b) => b.value.length - a.value.length)

  return strings[0]?.value || ''
}

function resolveCidImages(html = '', attachments = []) {
  let resolved = String(html || '')

  for (const item of attachments || []) {
    if (!item?.dataUrl) continue

    const cid = String(
      item.contentId ||
      item.contentID ||
      item.cid ||
      item.content_id ||
      ''
    ).replace(/^<|>$/g, '').trim()

    if (!cid) continue

    const variants = [
      'cid:' + cid,
      'cid:<' + cid + '>',
      'cid:%3C' + cid + '%3E'
    ]

    for (const variant of variants) {
      resolved = resolved.split(variant).join(item.dataUrl)
    }
  }

  return resolved
}

function renderAttachments(attachments = []) {
  const visible = attachments.filter(item => item.dataUrl)
  if (!visible.length) return ''

  return `
    <div class="email-attachments">
      <div class="email-attachments-title">Attachments</div>
      <div class="email-attachment-list">
        ${visible.map(item => {
          const name = escapeHtml(item.filename || 'Attachment')
          const isImage = String(item.mimeType || '').startsWith('image/')
          return `
            <a class="email-attachment" href="${item.dataUrl}" download="${name}" target="_blank" rel="noopener">
              ${isImage ? `<img src="${item.dataUrl}" alt="${name}">` : '<span class="attachment-file-icon">↧</span>'}
              <span>${name}</span>
            </a>
          `
        }).join('')}
      </div>
    </div>
  `
}

async function loadMessage(uid) {
  readerPanel.innerHTML = `
    <div class="empty-reader">
      ${emptyMailIcon()}
      <strong>Loading email...</strong>
    </div>
  `

  try {
    const message = await callMailFunction({
      action: 'get',
      folder: activeFolder,
      uid
    })

    readerPanel.innerHTML = `
      <article class="reader reader-rich">
        <button class="mobile-reader-back" id="mobileReaderBack" type="button" aria-label="Back to inbox">← Back</button>
        <div class="eyebrow dark">Message</div>
        <h2>${escapeHtml(message.subject || '(No subject)')}</h2>

        <div class="reader-meta">
          From: ${escapeHtml(message.sender || '')}
          &lt;${escapeHtml(message.from || '')}&gt;<br>
          To: ${escapeHtml(message.to || activeAccount.email)}<br>
          ${escapeHtml(formatFullDate(message.date))}
        </div>

        <div id="richMessageBody" class="rich-message-body"></div>
        ${renderAttachments(message.attachments || [])}
      </article>
    `

    const bodyHost = document.getElementById('richMessageBody')
    readerPanel.classList.add('mobile-open')

    document.getElementById('mobileReaderBack')?.addEventListener('click', () => {
      readerPanel.classList.remove('mobile-open')
      activeMessageId = null
      renderMessages()
    })

    const richHtml = getMessageHtml(message)
    const textContent = getMessageText(message)

    if (richHtml) {
      const frame = document.createElement('iframe')
      frame.className = 'email-frame'
      frame.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox')
      frame.setAttribute('referrerpolicy', 'no-referrer')
      frame.setAttribute('title', message.subject || 'Email message')
      frame.srcdoc = sanitizeEmailHtml(
        resolveCidImages(richHtml, message.attachments || [])
      )
      bodyHost.appendChild(frame)
    } else if (textContent) {
      const textBody = document.createElement('div')
      textBody.className = 'reader-body'
      textBody.textContent = textContent
      bodyHost.appendChild(textBody)
    } else {
      bodyHost.innerHTML = '<div class="reader-body muted-email-body">This message has no readable body.</div>'
    }
  } catch (error) {
    readerPanel.innerHTML = `
      <div class="empty-reader">
        ${emptyMailIcon()}
        <strong>Unable to open email</strong>
        <span>${escapeHtml(error.message)}</span>
      </div>
    `
  }
}

function renderReader() {
  readerPanel.classList.remove('mobile-open')
  readerPanel.innerHTML = `
    <div class="empty-reader">
      ${emptyMailIcon()}
      <strong>Select an email</strong>
      <span>Choose a message to read it here.</span>
    </div>
  `
}

function renderComposeAccounts() {
  if (!activeAccount) {
    composeFrom.innerHTML = ''
    return
  }

  composeFrom.innerHTML = accounts
    .map(account => `
      <option
        value="${account.email}"
        ${
          account.email === activeAccount.email
            ? 'selected'
            : ''
        }
      >
        ${account.email}
      </option>
    `)
    .join('')
}

function escapeHtml(value = '') {
  return String(value).replace(
    /[&<>'"]/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#039;',
      '"': '&quot;'
    }[char])
  )
}

function formatDate(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const now = new Date()

  if (
    date.toDateString() ===
    now.toDateString()
  ) {
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  })
}

function formatFullDate(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

document
  .querySelectorAll('.folder')
  .forEach(btn => {
    btn.addEventListener('click', async () => {
      document
        .querySelectorAll('.folder')
        .forEach(button =>
          button.classList.remove('active')
        )

      btn.classList.add('active')

      activeFolder = btn.dataset.folder
      activeMessageId = null

      renderReader()
      await loadMessages()
    })
  })

searchInput.addEventListener(
  'input',
  renderMessages
)

document
  .getElementById('refreshBtn')
  .addEventListener('click', async () => {
    await loadMessages()
  })

document
  .getElementById('composeBtn')
  .addEventListener('click', () => {
    if (!activeAccount) return

    renderComposeAccounts()
    composeModal.classList.remove('hidden')
  })

document
  .getElementById('closeCompose')
  .addEventListener('click', () => {
    composeModal.classList.add('hidden')
  })

composeModal.addEventListener(
  'click',
  event => {
    if (event.target === composeModal) {
      composeModal.classList.add('hidden')
    }
  }
)

document
  .getElementById('composeForm')
  .addEventListener('submit', async event => {
    event.preventDefault()

    const status =
      document.getElementById('composeStatus')

    const to =
      document.getElementById('composeTo')
        .value
        .trim()

    const subject =
      document.getElementById('composeSubject')
        .value
        .trim()

    const body =
      document.getElementById('composeBody')
        .value

    status.textContent = 'Sending...'

    try {
      await callMailFunction({
        action: 'send',
        to,
        subject,
        body
      })

      status.textContent = 'Sent.'

      event.target.reset()

      setTimeout(() => {
        composeModal.classList.add('hidden')
        status.textContent = ''
      }, 800)
    } catch (error) {
      console.error(error)
      status.textContent =
        error.message || 'Unable to send.'
    }
  })

document
  .querySelector('.signout')
  .addEventListener(
    'click',
    async event => {
      event.preventDefault()

      await supabase.auth.signOut()

      window.location.replace('index.html')
    }
  )

renderAccounts()
renderReader()
renderComposeAccounts()
await loadMessages()
