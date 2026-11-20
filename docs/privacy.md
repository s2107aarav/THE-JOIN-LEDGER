# Privacy and report sharing

The browser reads files and pasted tables locally. A dedicated worker parses, calculates and prepares report previews. The workspace does not send table contents to a backend, use analytics, persist a case, or run third-party scripts. The host can observe ordinary requests for public app assets.

Imported data is held in tab memory. Clear the workspace or reload the page to drop the case. The example share link contains only a predefined example and join preset. Your custom case has no share URL.

The default Markdown report contains join rules, generic table names, numerical counts and redacted explanations. Amounts and units, keys, and original field excerpts each require an explicit choice. Excerpts can include sensitive project information in any field. Review the full preview before copying, saving or printing. The preview is the same content that leaves the workspace. Feedback opens a blank GitHub issue.

The Vercel and Cloudflare deployment configurations set an HTTP Content-Security-Policy for the document and worker. The policy disallows network connections and restricts asset sources. The app relies on the browser and its environment to enforce these rules.
