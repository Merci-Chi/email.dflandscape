import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://wfxuxrvygyzonkflpwoq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_e2h4t8AvCobzftt36UrDbw_NJGq8qlJ'
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const { data: { session } } = await supabase.auth.getSession()
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

// This determines which actual mailboxes an authenticated login can see.
// Later, when Office and Estimates are connected, Don can simply be mapped
// to all three addresses here or loaded from Supabase instead.
const LOGIN_MAILBOX_ACCESS = {
  'don@dflandscape.com': ['don@dflandscape.com']
}

const demoMessages = {
  'don@dflandscape.com': [
    {
      id: 1,
      sender: 'Desert Forest Landscape',
      from: 'don@dflandscape.com',
      subject: 'Mailbox ready',
      snippet: 'Don\'s mailbox is ready for the Hostinger mail connection.',
      time: 'Today',
      unread: true,
      body: 'This is the Desert Forest Landscape email portal preview.\n\nThe next backend step will connect this mailbox to Hostinger IMAP for incoming mail and SMTP for outgoing mail.'
    }
  ]
}

const allowedMailboxEmails = LOGIN_MAILBOX_ACCESS[loggedInEmail] || []
const accounts = allowedMailboxEmails.map(email => MAILBOXES[email]).filter(Boolean)

let activeAccount = accounts[0] || null
let activeFolder = 'Inbox'
let activeMessageId = null

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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2"></rect>
        <path d="m4 7 8 6 8-6"></path>
      </svg>
    </span>`
}

function emptyMailIcon() {
  return `
    <div class="mail-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2"></rect>
        <path d="m4 7 8 6 8-6"></path>
      </svg>
    </div>`
}

function renderAccounts() {
  if (!accounts.length) {
    accountList.innerHTML = '<div class="no-access">No mailbox access.</div>'
    return
  }

  accountList.innerHTML = accounts.map(account => `
    <button class="account-btn ${account.email === activeAccount.email ? 'active' : ''}" data-email="${account.email}">
      ${accountIcon()}
      <span class="account-copy">
        <strong>${account.name}</strong>
        <span>${account.email}</span>
      </span>
    </button>
  `).join('')

  accountList.querySelectorAll('.account-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeAccount = accounts.find(a => a.email === btn.dataset.email)
      activeMessageId = null
      renderAll()
    })
  })
}

function renderMessages() {
  if (!activeAccount) {
    mailboxHeading.textContent = 'No mailbox'
    mailboxAddress.textContent = loggedInEmail
    messageList.innerHTML = '<div class="empty-reader" style="height:220px"><strong>No mailbox access</strong></div>'
    return
  }

  mailboxHeading.textContent = activeFolder
  mailboxAddress.textContent = activeAccount.email

  const query = searchInput.value.trim().toLowerCase()
  let messages = activeFolder === 'Inbox' ? (demoMessages[activeAccount.email] || []) : []

  if (query) {
    messages = messages.filter(m => `${m.sender} ${m.from} ${m.subject} ${m.snippet}`.toLowerCase().includes(query))
  }

  if (!messages.length) {
    messageList.innerHTML = `<div class="empty-reader" style="height:220px"><strong>No messages</strong><span>${activeFolder === 'Inbox' ? 'No matching preview emails.' : 'This folder will load from Hostinger later.'}</span></div>`
    return
  }

  messageList.innerHTML = messages.map(message => `
    <button class="message-row ${message.unread ? 'unread' : ''} ${message.id === activeMessageId ? 'active' : ''}" data-id="${message.id}">
      <span class="sender">${escapeHtml(message.sender)}</span>
      <span class="time">${escapeHtml(message.time)}</span>
      <span class="subject">${escapeHtml(message.subject)}</span>
      <span class="snippet">${escapeHtml(message.snippet)}</span>
    </button>
  `).join('')

  messageList.querySelectorAll('.message-row').forEach(row => {
    row.addEventListener('click', () => {
      activeMessageId = Number(row.dataset.id)
      renderMessages()
      renderReader()
    })
  })
}

function renderReader() {
  if (!activeAccount) {
    readerPanel.innerHTML = `<div class="empty-reader">${emptyMailIcon()}<strong>No mailbox available</strong></div>`
    return
  }

  const message = (demoMessages[activeAccount.email] || []).find(m => m.id === activeMessageId)

  if (!message) {
    readerPanel.innerHTML = `<div class="empty-reader">${emptyMailIcon()}<strong>Select an email</strong><span>Choose a message to read it here.</span></div>`
    return
  }

  readerPanel.innerHTML = `
    <article class="reader">
      <div class="eyebrow dark">Message</div>
      <h2>${escapeHtml(message.subject)}</h2>
      <div class="reader-meta">From: ${escapeHtml(message.sender)} &lt;${escapeHtml(message.from)}&gt;<br>To: ${escapeHtml(activeAccount.email)}</div>
      <div class="reader-body">${escapeHtml(message.body)}</div>
    </article>`
}

function renderComposeAccounts() {
  if (!activeAccount) {
    composeFrom.innerHTML = ''
    return
  }

  composeFrom.innerHTML = accounts.map(a => `<option value="${a.email}" ${a.email === activeAccount.email ? 'selected' : ''}>${a.email}</option>`).join('')
}

function renderAll() {
  renderAccounts()
  renderMessages()
  renderReader()
  renderComposeAccounts()
}

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]))
}

document.querySelectorAll('.folder').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.folder').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activeFolder = btn.dataset.folder
    activeMessageId = null
    renderMessages()
    renderReader()
  })
})

searchInput.addEventListener('input', renderMessages)
document.getElementById('refreshBtn').addEventListener('click', renderMessages)
document.getElementById('composeBtn').addEventListener('click', () => {
  if (!activeAccount) return
  renderComposeAccounts()
  composeModal.classList.remove('hidden')
})
document.getElementById('closeCompose').addEventListener('click', () => composeModal.classList.add('hidden'))
composeModal.addEventListener('click', e => {
  if (e.target === composeModal) composeModal.classList.add('hidden')
})
document.getElementById('composeForm').addEventListener('submit', e => {
  e.preventDefault()
  document.getElementById('composeStatus').textContent = 'SMTP sending is not connected yet.'
})

document.querySelector('.signout').addEventListener('click', async (event) => {
  event.preventDefault()
  await supabase.auth.signOut()
  window.location.replace('index.html')
})

renderAll()
