/* ===================== STRIKE ZONE - server/server.js =====================
   Start locally with ONE command:   cd server && npm install && npm start
   Then open  http://localhost:3000/strikezone/index.html   (also from other
   computers on your network:  http://<your-ip>:3000/strikezone/index.html)

   Online (Render etc.): deploy the /server folder as a Node web service.
   Start command: node server.js   -- environment variables:
     PORT            (set by the host)
     ALLOWED_ORIGIN  e.g. https://yourname.github.io   (default: any origin)
*/
'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { attach, MODES, MAPS } = require('./server/rooms');

const app = express();
const server = http.createServer(app);
const origin = process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : '*';
const io = new Server(server, { cors: { origin: origin, methods: ['GET', 'POST'] }, pingInterval: 10000, pingTimeout: 15000 });

/* the whole game folder is served too, so one command runs everything locally */
const gameDir = path.join(__dirname, '..');
app.use('/strikezone', express.static(gameDir, { index: 'index.html', setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.get('/', (req, res) => res.redirect('/strikezone/index.html'));
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), modes: Object.keys(MODES), maps: MAPS.map((m) => m.name) }));

const game = attach(io);
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('Strike Zone server running on port ' + PORT);
  console.log('Play locally:  http://localhost:' + PORT + '/strikezone/index.html');
});
process.on('SIGTERM', () => { game.stop(); server.close(); });
