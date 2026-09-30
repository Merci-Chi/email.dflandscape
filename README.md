# Desert Forest Landscape Email

Simple front-end starter for `email.dflandscape.com`.

## Current mailbox access

For now only one login/mailbox is enabled:

- Login: `don@dflandscape.com`
- Mailbox shown: `don@dflandscape.com`

The project has an access map so a login can later be granted multiple mailboxes. When Office and Estimates are ready, Don can be mapped to all three.

## Don mailbox servers

- IMAP server: `imap.hostinger.com`
- SMTP server: `smtp.hostinger.com`

Do **not** put the mailbox password in `app.js`, `mail.js`, `config.example.js`, GitHub Pages, or any other browser-visible file.

## Next backend step

Use Supabase Auth for the website login, then call a protected backend/Edge Function to read and send mail. The backend keeps the Hostinger mailbox credentials secret and connects to IMAP/SMTP on behalf of the signed-in user.

The current login is only a local preview flow and is not security/authentication yet.
