/* Browser-side stand-in for socket.io-client (test only; pairs with fake-socketio.js) */
(function () {
  window.io = function (url) {
    const ws = new WebSocket(url.replace(/^http/, 'ws'));
    const h = {}, acks = {}; let n = 1; const q = [];
    const s = { connected: false, id: null,
      on(e, f) { (h[e] = h[e] || []).push(f); return s; },
      emit(e, d, cb) { const m = { e: e, d: d }; if (typeof d === 'function') { cb = d; m.d = undefined; } if (cb) { m.a = n++; acks[m.a] = cb; } const str = JSON.stringify(m); ws.readyState === 1 ? ws.send(str) : q.push(str); },
      close() { ws.close(); }, disconnect() { ws.close(); } };
    ws.onopen = () => { s.connected = true; q.splice(0).forEach((x) => ws.send(x)); };
    ws.onclose = () => { s.connected = false; (h.disconnect || []).forEach((f) => f()); };
    ws.onerror = () => { (h.connect_error || []).forEach((f) => f()); };
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.e === '$id') { s.id = m.d; (h.connect || []).forEach((f) => f()); return; } if (m.a) { const cb = acks[m.a]; delete acks[m.a]; cb && cb(m.d); } else (h[m.e] || []).forEach((f) => f(m.d)); };
    return s;
  };
})();
