# Desert Forest Landscape Email Portal

Static GitHub Pages frontend for `email.dflandscape.com`.

## Current setup

- Supabase Auth handles website login.
- Users and mailboxes are separate concepts.
- `dflandscape_mail_access` controls whether a login is active and whether it is an admin.
- Admins (including Don and Kiara) can access every active mailbox.
- `dflandscape_mailboxes` is the canonical list of real mailboxes.
- `dflandscape_mailbox_permissions` assigns specific mailboxes to non-admin users.
- Hostinger mailbox credentials are never stored in this repo.
- Hostinger IMAP/SMTP passwords stay in Supabase Edge Function Secrets using names like `DF_MAIL_PASSWORD_ESTIMATES`.

## Mail backend

The `dflandscape-mail` Edge Function handles IMAP/SMTP server-side and only permits active mailboxes registered in `dflandscape_mailboxes`.
