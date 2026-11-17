# Strike Zone – Online Multiplayer

## 1. Play locally (one command)
```
cd strikezone/server
npm install
npm start
```
Open **http://localhost:3000/strikezone/index.html** → **ONLINE MULTIPLAYER** → *Create private room*.
Friends on the same Wi‑Fi open `http://<your-computer-ip>:3000/strikezone/index.html` and join with the 5‑letter code.
(The server also serves the game files, so nothing else is needed. The old `python server.py` still works for solo play.)

## 2. Play with friends over the internet
**Backend (Render, free):**
1. Put the whole project in a GitHub repo.
2. Render → *New → Web Service* → select the repo. Root directory: `server`, build: `npm install`, start: `node server.js`
   (or use `server/render.yaml` as a Blueprint).
3. Set env var `ALLOWED_ORIGIN` = your GitHub Pages address (e.g. `https://yourname.github.io`). Leave unset to allow any origin.
4. Check `https://<your-app>.onrender.com/health`. (Free instances sleep when idle – the first connection can take ~30 s.)

**Frontend (GitHub Pages):**
1. Edit `/strikezone/config.js` and set `server: 'https://<your-app>.onrender.com'`.
2. The game uses absolute links like `/strikezone/style.css`, so the site must be served from the domain root:
   create a repo named **`<your-username>.github.io`** and put the `strikezone` folder in it → the game is at
   `https://<your-username>.github.io/strikezone/index.html`.
   (A normal project repo is served from `/<repo>/…`, which would break the `/strikezone/…` links.)
3. In the lobby you can also type the server address under *Server settings (advanced)*.

## 3. How it works
* `server/rooms.js` – all game logic: rooms + codes, lobby, map voting, countdown, the 5 modes, respawns, leaderboard, results.
* The server is authoritative for **health, damage, kills, deaths, scores, flags, hill control, weapon ladder and the timer**.
  Clients send their position (speed-checked) and "I fired" / "I hit X" claims; a hit is accepted only if the shooter really fired
  (rate-limited per weapon), the target is alive/not a teammate/not dodging/not spawn-protected, the weapon is allowed in that mode and the
  distance fits the weapon. Damage is computed on the server from `weapons.js`.
* Modes: Free For All (3:00), Team Deathmatch (5:00), Capture The Flag (first to 3), King of the Hill (first to 200 or most at 5:00), Gun Game (10‑weapon ladder).
* `mp.js` / `mp.css` – lobby, HUD, leaderboard, results. `game.js` – remote players, objectives, hit feedback (`window.SZ` bridge).

## 4. Tests
`cd server && npm test` runs 70+ checks with simulated players through every mode.
