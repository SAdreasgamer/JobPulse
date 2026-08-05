# Privacy

Job Tracker is a self-hosted personal tool. It has no third-party analytics, advertising SDKs, or developer-operated telemetry service. The browser extension sends data only to the Job Tracker server address compiled into it (localhost by default).

## Browser permissions

- **Site access for LinkedIn and Gmail** lets the content script identify supported job pages and LinkedIn job emails, add tracker controls, and capture a listing when applicable.
- **Access to the configured `/api/*` origin** lets the extension read and update your tracker.
- **Storage** keeps extension preferences, including keyword rules and the diagnostics opt-in.
- **Active tab** lets the popup derive a suggested company search from the page you opened it on.
- **Scripting** and **web navigation** restore the controls after supported sites replace a page during in-app navigation.
- **Alarms** periodically check whether your configured server is reachable.

The extension reads supported pages' visible job-card and job-detail content. For LinkedIn captures this can include the platform listing ID and URL, title, company and company URL, location, workplace/apply type, salary, posting date, fit indicators, and job-description text. On Gmail, it inspects rendered content in the browser to recognize supported LinkedIn job messages and extract the structured job and action data needed by the tracker. It does not send or store the email body as a job description. Manually entered jobs and notes contain exactly what you submit.

## Storage and diagnostics

The server stores jobs, listings, events, notes, documents, preferences, and diagnostics in SQLite/libSQL. The default is a local `apps/api/jobtracker.db` file. Optional Turso modes synchronize that database to the Turso account you configure; using Turso means that provider processes and stores the synced database under its own terms.

Search diagnostics use a **Never**, **30 minutes**, or **Always** scope. A fresh install uses Never and sends and stores nothing. Both active scopes store the timestamp, page host, automatic seed and extraction rule, the seed's result count, the final query and result count, and clicked job ID. Seed replacement is derived by comparing the seed and final query; a click is derived from the presence of a job ID. Diagnostics remain on your configured Job Tracker server, are capped at the newest 1,000 rows, and can be erased at any time with **Clear stored data** in extension settings. If that database is configured to sync with Turso, the diagnostic rows sync with it as part of the database.

## Backup, deletion, and uninstall

Follow the API's tested [backup and restore procedure](apps/api/README.md#backup--restore) to export the database as portable SQL. Delete the database file (and its `.sync` sibling in local-first mode) to remove local server data. If Turso is configured, deleting local files does not delete the remote database; remove it separately in your Turso account.

Removing the extension deletes its browser-local settings but does **not** delete records already stored by the server. Removing the repository or uninstalling dependencies likewise leaves database and backup files until you delete them explicitly.
