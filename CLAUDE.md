# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-script monitor that scrapes HYROX event pages and sends Telegram alerts when ticket/registration appears to open. There is no server — the whole program is `index.js`, run once per invocation and exiting.

Events monitored live in the `EVENTS` array at the top of `index.js` (currently HYROX Bengaluru on `hyrox.co.in` and HYROX Hong Kong on `hyrox.com` — note the two domains). Each entry is `{ name, url, slug }`; `slug` is the city token used to ignore other cities' event links that appear on the page. Add an event by pushing another entry.

## Commands

- `node index.js` (or `npm start`) — run one check of every event. Requires `BOT_TOKEN` and `CHAT_ID` env vars (Telegram bot token + chat id); without them the Telegram POST fails.
- `npm ci` — install deps (`axios`, `cheerio`). No build, lint, or test setup exists.

## How it runs in production

Checks are driven by **cron-job.org**, which POSTs to GitHub's `repository_dispatch` API every 30 min (GitHub's own cron is unreliable/delayed). `.github/workflows/check.yml` triggers on `repository_dispatch`, `workflow_dispatch` (manual test), and a single `schedule` cron (`30 23 * * *`) kept only as a best-effort fallback for the 05:00 IST daily status.

`BOT_TOKEN`/`CHAT_ID` come from GitHub Actions secrets. The daily-status format fires when a run lands in the `now.getUTCHours() === 23 && now.getUTCMinutes() === 30` window (23:30 UTC = 05:00 IST) — so the cron-job.org schedule must include the :30 minute mark for it to hit. `FORCE_NOTIFY=true` (set only on manual `workflow_dispatch` runs) forces the daily-status format on demand.

## Detection logic (index.js)

`isRegistrationOpen(html, slug)` decides `open` purely from links: registration is considered open when an `<a>` with a register/ticket/`raceid`/`myraceresult`-style href or register/book text exists for THIS event. Two exclusions prevent false positives:
- charity/promo links (`charity`, `race-for-impact`) — hyrox.com carries a "Race for Impact" *charity tickets* link that would otherwise match on "ticket".
- other cities' event links (`/event/hyrox-…` not containing `slug`).

This is heuristic and site-structure-dependent — it will break or false-positive if the page markup changes. That heuristic is the thing to revisit when tuning, not the plumbing around it. When adding/tuning an event, fetch the real page and confirm `isRegistrationOpen` returns the expected value before shipping.

## Message flow

`main()` checks every event (each wrapped in its own try/catch so one failing page doesn't sink the rest), then sends **one combined Telegram message** per run with a line per event. The header varies: `☀️ Daily Status` (daily window or `FORCE_NOTIFY`), else `🚨 …is LIVE!` if any event is open, else `🔴 …Watch`. A message goes out on **every** run regardless of state.

## Note on state.json

`state.json` (`{"registrationOpen": false}`) is committed but nothing in `index.js` reads or writes it — each run is stateless, so alerts fire on every check while registration looks open. If you add dedup ("only alert on transition"), this is the file to wire up (and the workflow would need a commit step to persist it, now per-event).
