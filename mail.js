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

const MAILBOXES = {
  'don@dflandscape.com': {
    name: 'Don',
    email: 'don@dflandscape.com'
  }
}

const LOGIN_MAILBOX_ACCESS = {
  'don@dflandscape.com': ['don@dflandscape.com']
}

const allowedMailboxEmails =
  LOGIN_MAILBOX_ACCESS[loggedInEmail] || []

const accounts = allowedMailboxEmails
  .map(email => MAILBOXES[email])
  .filter(Boolean)

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
      <article class="reader">
        <div class="eyebrow dark">
          Message
        </div>

        <h2>
          ${escapeHtml(
            message.subject || '(No subject)'
          )}
        </h2>

        <div class="reader-meta">
          From:
          ${escapeHtml(message.sender || '')}
          &lt;${escapeHtml(message.from || '')}&gt;
          <br>

          To:
          ${escapeHtml(message.to || activeAccount.email)}

          <br>

          ${escapeHtml(
            formatFullDate(message.date)
          )}
        </div>

        <div class="reader-body">
          ${escapeHtml(message.body || '')}
        </div>
      </article>
    `
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
