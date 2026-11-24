# Arqade — Project Handoff

Last updated: 2026-11-24

## 1. Tech Stack & Packages
- Node + Express server (`server.js`); Neon Postgres in production, SQLite locally; vanilla JS front end; Three.js r128 for the 3D games
- Controller support: browser Gamepad API, standard mapping, no libraries
- Stripe: plain REST + HMAC webhook verification, no SDK

## 2. File Structure
- `server.js` — all backend: accounts, scores, likes, feedback, chat servers, Orbs currency, Stripe prep
- `public/index.html` — portal: account bar (name/tags/title + Orbs balance pill), Featured + More games cards, Continue bar, likes
- `public/games/shop.html` — Orb Shop app: balance, daily/weekly tasks + Claim, name-color/title cosmetics, Buy Orbs packs
- `public/games/admin-panel.js` — shared panel for all game pages except Mining Simulator: admin tools, sign-in gate, appearance system, Orbs pill, fullscreen pill, controller translator
- `public/miner-cat-2.html` + `public/game.js` + `public/styles.css` — Mining Simulator (own auth overlay; inline Orbs pill + controller translator)
- `public/games/bloxcraft.html` — Bloxcraft (own `pollPad` controller loop: sticks + triggers)
- `public/games/pursuit3d.html` + `pursuit3d-world.js` + `pursuit3d-b.js` — City Pursuit 3D
- Other pages in `public/games/`: chat, settings, feedback, meteor, clickersim, racer, lander, browser, and the 2D games

## 3. Data, APIs & State
- Tables: users (with `orbs` balance), scores (float), game_likes, feedback, chat_servers, orb_tasks, orb_games, orb_owned, orb_equip, stripe_events
- Orbs: `GET /api/orbs`, `POST /api/orbs/claim`, `GET /api/orbs/shop`, `POST /api/orbs/buy`, `POST /api/orbs/equip` — all rewards/prices fixed server-side; task periods are Pacific day + ISO week; plays count at most once per 2 minutes per player
- Stripe prep (inert until keys exist): `GET /api/orbs/packs` (100/$0.99, 550/$4.99, 1,200/$9.99, 3,000/$19.99), `POST /api/orbs/checkout`, `POST /api/stripe/webhook` (HMAC-verified, credits Orbs once per event)
- Controller mapping: left stick + D-pad → WASD + arrow keys; A=Space, B=Esc, X=F, Y=E, Start=Enter; right stick drives a cursor, A clicks at it

## 4. Working vs. Next Steps / Bugs
- Working: Orbs + Shop app, controller support on every game, Mining Simulator Arqade retheme, Bloxcraft 4.0 (landmarks, animals, day/night), City Pursuit HDR bloom graphics
- Next: switching money purchases on is parent-gated — needs a Stripe account, `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in the server environment, and the webhook registered in Stripe
- Open: Bloxcraft stairs not built (needs new geometry); voice chat never tested with a real microphone; arqade.io domain purchase still pending
