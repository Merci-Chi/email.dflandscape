# Desert Forest Landscape Email Portal

Static GitHub Pages frontend for `email.dflandscape.com`.

## Current setup

- Supabase Auth handles the website login.
- `don@dflandscape.com` is the only mailbox shown right now.
- The mailbox page requires an active Supabase session.
- Hostinger mailbox credentials are **not** stored in this repo.
- Hostinger IMAP/SMTP secrets should stay in Supabase Edge Function Secrets.

## Next backend step

Connect the mailbox UI to a protected Supabase Edge Function that reads the Hostinger secrets and handles IMAP/SMTP server-side.
