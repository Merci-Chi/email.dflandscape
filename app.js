import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://wfxuxrvygyzonkflpwoq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_e2h4t8AvCobzftt36UrDbw_NJGq8qlJ'

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const loginForm = document.getElementById('loginForm')
const loginMessage = document.getElementById('loginMessage')
const submitButton = loginForm.querySelector('button[type="submit"]')

const { data: { session } } = await supabase.auth.getSession()
if (session?.user) {
  window.location.replace('mail.html')
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const email = document.getElementById('email').value.trim().toLowerCase()
  const password = document.getElementById('password').value

  loginMessage.textContent = ''
  submitButton.disabled = true
  submitButton.textContent = 'Signing in...'

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) throw error
    if (!data.user) throw new Error('Unable to sign in.')

    window.location.replace('mail.html')
  } catch (error) {
    loginMessage.textContent = error.message === 'Invalid login credentials'
      ? 'Incorrect email or password.'
      : (error.message || 'Unable to sign in.')
  } finally {
    submitButton.disabled = false
    submitButton.textContent = 'Sign in'
  }
})
