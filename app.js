const allowedEmails = [
  'don@dflandscape.com',
  'office@dflandscape.com',
  'estimates@dflandscape.com'
]

const loginForm = document.getElementById('loginForm')
const loginMessage = document.getElementById('loginMessage')

loginForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const email = document.getElementById('email').value.trim().toLowerCase()

  if (!allowedEmails.includes(email)) {
    loginMessage.textContent = 'Use an approved @dflandscape.com email.'
    return
  }

  loginMessage.textContent = 'Supabase login is not connected yet.'
})
