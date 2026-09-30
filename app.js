const LOGIN_MAILBOX_ACCESS = {
  'don@dflandscape.com': ['don@dflandscape.com']
}

const loginForm = document.getElementById('loginForm')
const loginMessage = document.getElementById('loginMessage')

loginForm.addEventListener('submit', (event) => {
  event.preventDefault()

  const email = document.getElementById('email').value.trim().toLowerCase()
  const password = document.getElementById('password').value

  if (!LOGIN_MAILBOX_ACCESS[email]) {
    loginMessage.textContent = 'This email does not have mailbox access.'
    return
  }

  if (!password) {
    loginMessage.textContent = 'Enter your password.'
    return
  }

  // Temporary preview session only.
  // Replace this with a verified Supabase session in the next step.
  sessionStorage.setItem('dfEmailLogin', email)
  window.location.href = 'mail.html'
})
