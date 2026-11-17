/* Test-only stand-in for socket.io (server + client) built on the `ws` package.
   Implements just the subset the game uses, so the game logic can be exercised
   where the npm registry is unreachable. Production uses the real socket.io. */
'use strict';
const WS = require('/opt/npm-tools/node_modules/ws');
let nextId = 1;
class FakeIO {
  constructor(httpServer) {
    this.rooms = {}; this.sockets = {}; this.handlers = {};
    this.wss = new WS.Server({ server: httpServer });
    this.wss.on('connection', (ws) => {
      const s = new FakeSocket(this, ws); this.sockets[s.id] = s; s._send('$id', s.id);
      (this.handlers.connection || []).forEach((h) => h(s));
    });
  }
  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }
  to(room) { const io = this; return { emit(ev, data) { (io.rooms[room] || new Set()).forEach((id) => io.sockets[id] && io.sockets[id]._send(ev, data)); } }; }
}
class FakeSocket {
  constructor(io, ws) { this.io = io; this.ws = ws; this.id = 's' + (nextId++); this.h = {}; this.handshake = { query: {} }; this.myRooms = new Set();
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } const fn = this.h[m.e]; if (!fn) return;
      const cb = m.a ? (d) => ws.send(JSON.stringify({ a: m.a, d: d })) : undefined; fn(m.d, cb); });
    ws.on('close', () => { (this.h.disconnect || (() => {}))(); this.myRooms.forEach((r) => this.io.rooms[r] && this.io.rooms[r].delete(this.id)); delete io.sockets[this.id]; });
  }
  on(ev, fn) { this.h[ev] = fn; }
  emit(ev, d) { this._send(ev, d); }
  _send(ev, d) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ e: ev, d: d })); }
  join(r) { (this.io.rooms[r] = this.io.rooms[r] || new Set()).add(this.id); this.myRooms.add(r); }
  leave(r) { this.io.rooms[r] && this.io.rooms[r].delete(this.id); this.myRooms.delete(r); }
  to(room) { const me = this; return { emit(ev, d) { (me.io.rooms[room] || new Set()).forEach((id) => id !== me.id && me.io.sockets[id] && me.io.sockets[id]._send(ev, d)); } }; }
}
/* client with the same call style as socket.io-client:  const s = io(url);  s.on / s.emit(ev, data, cb) */
function ioClient(url) {
  const ws = new WS(url.replace(/^http/, 'ws'));
  const h = {}, acks = {}; let ackN = 1; const queue = [];
  const sock = {
    connected: false,
    on(ev, fn) { (h[ev] = h[ev] || []).push(fn); return sock; },
    emit(ev, d, cb) { const m = { e: ev, d: d }; if (typeof d === 'function') { cb = d; m.d = undefined; } if (cb) { m.a = ackN++; acks[m.a] = cb; } const str = JSON.stringify(m); if (ws.readyState === 1) ws.send(str); else queue.push(str); },
    close() { ws.close(); }, disconnect() { ws.close(); }
  };
  sock.id = null;
  ws.on('open', () => { sock.connected = true; queue.splice(0).forEach((q) => ws.send(q)); (h.connect || []).forEach((f) => f()); });
  ws.on('close', () => { sock.connected = false; (h.disconnect || []).forEach((f) => f()); });
  ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.e === '$id') { sock.id = m.d; return; } if (m.a) { const cb = acks[m.a]; delete acks[m.a]; cb && cb(m.d); } else (h[m.e] || []).forEach((f) => f(m.d)); });
  return sock;
}
module.exports = { FakeIO, ioClient };
