# Arqade — by Meteor

Free browser games. One account for every game — no downloads, just play.

**Play:** [arqade-0n43.onrender.com](https://arqade-0n43.onrender.com) · [miner-cat-2.onrender.com](https://miner-cat-2.onrender.com)

## Games

- **City Pursuit 3D** — GTA-style open city: steal cars, drift through traffic, and lose the cops to drop your wanted stars
- **Mining Simulator** — dig through 100 stages, collect coins and gems, buy enchants, and mine in a shared multiplayer world
- **Turbo Racer 3D** — one endless highway in full 3D; thread through traffic and build near-miss combos
- **Bloxcraft** — a 3D voxel Earth you can mine and build on: landmarks, animals, day & night, Creative and Survival
- **Clicker Simulator** — click the big coin, buy upgrades, and rebirth for a multiplier that doubles every time
- **Meteor AI** — Arqade's own AI: chat help, a bot player in the multiplayer games, and a Code mode that builds playable games
- Plus the classics: Snake, Breakout, Flappy, Memory Match, 2048, Coin Clicker, Pong, Minesweeper, Space Invaders, Lunar Lander, Word Guess

## Apps

- **Orb Shop** — earn Orbs from daily and weekly tasks, spend them on name colors and titles
- **Arqade Chat** — text + voice chat rooms, including player-created servers
- **Web Browser** — browse the web from inside Arqade
- **Settings** — one place controls every game's settings, plus site backgrounds, colors, and Dark/Light mode
- **Feedback** — send bugs and ideas straight to Dylan

## Features

- One account across the whole site, with per-game leaderboards and portal likes
- **Orbs** — a global currency earned from tasks and spent in the Orb Shop on name colors and titles that show in chat
- **Controller support** — pair an Xbox, PlayStation, or standard controller and play every game with it
- Multiplayer worlds in Mining Simulator and City Pursuit 3D, with a bot player named Meteor
- Works on iPad, phone, and computer

## Latest updates

- **2026-11-28** — Sign-in cards are white now: a clean white sign-in card (Squarespace-style) on the account screen and on every game's sign-in gate, replacing the dark navy card
- **2026-11-28** — New site logo: a gold gamepad tab icon on every page (before this, Arqade tabs showed the generic globe)
- **2026-11-28** — Sign-in is Arqade-branded now: the account screen says Arqade (not Mining Simulator), and creating an account or signing in lands you on the portal instead of inside Mining Simulator
- **2026-11-24** — Controller support across the whole site; Orb Shop became its own app in Featured; Orbs balance pill in the portal account bar and on every game page; new Orb coin logo; Orbs controls in the admin panel (set/give any player's balance); every game now has a 2X gamepass bought with Orbs (10 in Featured games, 2 in the rest)
- **2026-11-23** — Orbs currency launched with harder tasks and the cosmetics shop; Bloxcraft 4.0 (landmarks, animals, world map, day & night, pickaxe, fast travel); Mining Simulator rethemed to Arqade navy and gold
- **2026-11-22** — Bloxcraft launched: a 600×300-block Earth with chunk streaming, home screen, Creative/Survival, and multiple saved worlds

## Tech

Node + Express server, Postgres database, vanilla JS front end, Three.js for the 3D games. See `HANDOFF.md` for the full project handoff.

## Rules for working on Arqade

Dylan's standing rules — they apply to anyone (human or AI) changing this project:

1. **Update this README and `HANDOFF.md` every time** work ships: a dated line in Latest updates here, and the handoff kept current there.
2. **The project handoff lives in `HANDOFF.md` only** — never paste it into chat with Dylan.
3. **Every game is individually built** with its own look, feel, and mechanics. Reskins and remix packs don't count.
4. **No monsters in Bloxcraft.** Nights stay safe — no hostile mobs, ever.
5. **An account is required to play every game.** The portal itself stays open for browsing.
6. **The company is Meteor** (final). Arqade is branded "Arqade by Meteor". Retired names — Auric Interactive, Orbit, Rafter Studios — must not be used.
7. **Don't revive removed designs:** the portal arcade/neon theme, the redrawn portal covers, and the gold coin logo were all removed at Dylan's direction.
8. **Money stays off until a parent-held Stripe account is connected.** Never ask Dylan for passwords, tokens, or keys in chat — secrets go in the server's environment only.
9. **Push files one at a time** — pushing files in parallel races and fails.
10. **Dylan's iPad is the real test.** A desktop check passing doesn't prove a game works for him; verify changes live.
