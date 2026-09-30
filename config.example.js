// FUTURE CONNECTION SETTINGS
// Keep passwords and private service keys on the backend only.
// These server hostnames are safe to document here, but the browser itself
// should NOT log directly into IMAP/SMTP with the mailbox password.

window.DF_EMAIL_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  apiBaseUrl: '',

  mailboxes: {
    'don@dflandscape.com': {
      imapServer: 'imap.hostinger.com',
      smtpServer: 'smtp.hostinger.com'
    }
  }
}
