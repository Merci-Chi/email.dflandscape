const accounts = [
  { name: 'Don', email: 'don@dflandscape.com' },
  { name: 'Office', email: 'office@dflandscape.com' },
  { name: 'Estimates', email: 'estimates@dflandscape.com' }
]

const demoMessages = {
  'don@dflandscape.com': [
    { id: 1, sender: 'Desert Forest Landscape', from: 'office@dflandscape.com', subject: 'Mailbox ready', snippet: 'This is only a preview message for the mailbox layout.', time: 'Today', unread: true, body: 'This is a preview of the Desert Forest Landscape email portal.\n\nReal inbox messages will appear here once the IMAP backend is connected.' },
    { id: 2, sender: 'Website Contact', from: 'customer@example.com', subject: 'Landscape inquiry', snippet: 'Example customer inquiry for testing the layout.', time: 'Yesterday', unread: false, body: 'Hello,\n\nI am interested in getting an estimate for landscaping work.\n\nThis is demo content only.' }
  ],
  'office@dflandscape.com': [
    { id: 3, sender: 'Desert Forest Landscape', from: 'don@dflandscape.com', subject: 'Office mailbox', snippet: 'The office inbox will load here.', time: 'Today', unread: true, body: 'The office mailbox is ready for the real mail connection.' }
  ],
  'estimates@dflandscape.com': [
    { id: 4, sender: 'Estimate Request', from: 'lead@example.com', subject: 'Requesting an estimate', snippet: 'A sample estimate request.', time: 'Today', unread: true, body: 'Name: Example Customer\nProject: Backyard cleanup\n\nReal estimate emails will load from your mail server later.' }
  ]
}

let activeAccount = accounts[0]
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

function renderAccounts() {
  accountList.innerHTML = accounts.map(account => `
    <button class="account-btn ${account.email === activeAccount.email ? 'active' : ''}" data-email="${account.email}">
      <strong>${account.name}</strong>
      <span>${account.email}</span>
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
  mailboxHeading.textContent = activeFolder
  mailboxAddress.textContent = activeAccount.email
  const query = searchInput.value.trim().toLowerCase()
  let messages = activeFolder === 'Inbox' ? (demoMessages[activeAccount.email] || []) : []
  if (query) messages = messages.filter(m => `${m.sender} ${m.from} ${m.subject} ${m.snippet}`.toLowerCase().includes(query))

  if (!messages.length) {
    messageList.innerHTML = `<div class="empty-reader" style="height:220px"><strong>No messages</strong><span>${activeFolder === 'Inbox' ? 'No matching preview emails.' : 'This folder will connect later.'}</span></div>`
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
  const message = (demoMessages[activeAccount.email] || []).find(m => m.id === activeMessageId)
  if (!message) {
    readerPanel.innerHTML = `<div class="empty-reader"><div class="mail-icon">✉</div><strong>Select an email</strong><span>Choose a message to read it here.</span></div>`
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
  composeFrom.innerHTML = accounts.map(a => `<option value="${a.email}" ${a.email === activeAccount.email ? 'selected' : ''}>${a.email}</option>`).join('')
}

function renderAll() {
  renderAccounts()
  renderMessages()
  renderReader()
  renderComposeAccounts()
}

function escapeHtml(value='') {
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
document.getElementById('composeBtn').addEventListener('click', () => { renderComposeAccounts(); composeModal.classList.remove('hidden') })
document.getElementById('closeCompose').addEventListener('click', () => composeModal.classList.add('hidden'))
composeModal.addEventListener('click', e => { if (e.target === composeModal) composeModal.classList.add('hidden') })
document.getElementById('composeForm').addEventListener('submit', e => {
  e.preventDefault()
  document.getElementById('composeStatus').textContent = 'Mail sending is not connected yet.'
})

renderAll()
