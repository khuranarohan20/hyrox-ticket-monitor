# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-script monitor that scrapes the HYROX Bengaluru event page (`https://hyrox.co.in/event/hyrox-bengaluru/`) and sends Telegram alerts when ticket/registration appears to open. There is no server — the whole program is `index.js`, run once per invocation and exiting.

## Commands

- `node index.js` (or `npm start`) — run one check. Requires `BOT_TOKEN` and `CHAT_ID` env vars (Telegram bot token + chat id); without them the Telegram POST fails.
- `npm ci` — install deps (`axios`, `cheerio`). No build, lint, or test setup exists.

## How it runs in production

`.github/workflows/check.yml` runs `node index.js` on two cron schedules (times are UTC):
- `*/30 * * * *` — the registration check every 30 min.
- `30 23 * * *` — the 05:00 IST daily status ping.

`BOT_TOKEN`/`CHAT_ID` come from GitHub Actions secrets. Any change to check cadence or the daily-status time must be kept in sync between the workflow cron and the `now.getUTCHours() === 23 && now.getUTCMinutes() === 30` guard in `index.js:58` — the cron only wakes the job, the code decides which message to send.

## Detection logic (index.js)

`checkRegistration()` loads the page and decides `registrationOpen` from two signals:
1. The "registration will open soon" banner is *absent*, OR
2. an `<a>` with register/ticket/book-style href or text exists.

This is heuristic and site-structure-dependent — it will break or false-positive if the page markup changes. That heuristic is the thing to revisit when tuning, not the plumbing around it.

Branches: daily-status window → send status message and return; else if open → send LIVE alert; else log only. Errors are caught at the bottom and reported to Telegram best-effort.

## Note on state.json

`state.json` (`{"registrationOpen": false}`) is committed but nothing in the current `index.js` reads or writes it — each run is stateless, so alerts fire on every 30-min check while registration looks open. If you add dedup ("only alert on transition"), this is the file to wire up (and the workflow would need a commit step to persist it).
