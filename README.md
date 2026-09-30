# Desert Forest Landscape Email Portal

Simple frontend starter for `email.dflandscape.com`.

Included mailboxes:
- don@dflandscape.com
- office@dflandscape.com
- estimates@dflandscape.com

## Branding
The interface uses the existing Desert Forest Landscape image branding from the main website:
- `images/text.png`
- `images/slogan.png`
- `images/leaf.png`

For this starter ZIP, the pages load those exact files from the public `Merci-Chi/DFLandscape` GitHub repository. When you place copies inside this repo later, change the three image URLs to `assets/text.png`, `assets/slogan.png`, and `assets/leaf.png`.

## Files
- `index.html` — sign-in screen
- `mail.html` — mailbox preview interface
- `styles.css` — Desert Forest Landscape styling
- `app.js` — temporary login UI logic
- `mail.js` — temporary mailbox preview logic
- `config.example.js` — placeholder for future public configuration
- `CNAME` — GitHub Pages custom domain

## Important
The login and email server are intentionally NOT connected yet.

Do not put IMAP usernames/passwords directly in these browser files. The safe next step is:
1. Supabase Auth verifies the user.
2. A server-side API / Edge Function stores or reads mailbox credentials securely.
3. That server connects to IMAP for reading mail and SMTP for sending mail.
4. The browser only talks to that protected API.
