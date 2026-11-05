// Hudud (real vaqt, paper.io uslubida): o'z hududingizdan chiqib, iz qoldirib, yana hududingizga qaytsangiz
// o'rab olingan joy sizniki bo'ladi. Boshqa o'yinchining izini kesib o'tsangiz u yo'qoladi, o'z izingizga tegsangiz o'zingiz.
// Hamma hisob-kitob serverda.
const W = 64, H = 64, CX = 32, CY = 32, R = 31; // aylana maydon
const SPEED = 5.2, TURN = 7.5; // katak/soniya, radian/soniya
const ROUND_MS = Number(process.env.HUDUD_ROUND_MS) || 180000, RESPAWN_S = 2.5, MIN_PLAYERS = 5;
const NAMES = ['Aziz', 'Bobur', 'Dilnoza', 'Jasur', 'Malika', 'Sardor', 'Nodira', 'Otabek', 'Zafar', 'Lola', 'Rustam', 'Madina', 'Sherzod', 'Kamola', 'Anvar', 'Gulnora'];
const idx = (x, y) => y * W + x;
const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

class Room {
  constructor(opts = {}) {
    this.elim = !!opts.elim; this.stake = opts.stake || 0; this.cd = 0; // elim: tikilgan xona, o'lgan qayta tug'ilmaydi, botsiz
    this.mask = new Uint8Array(W * H); this.playable = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - CX, y + 0.5 - CY) <= R) { this.mask[idx(x, y)] = 1; this.playable++; }
    this.players = new Map(); this.changes = []; this.reset();
  }
  reset() {
    this.own = new Uint8Array(W * H); this.trail = new Uint8Array(W * H);
    this.changes = []; this.timeLeft = ROUND_MS; this.ended = false;
    for (const p of this.players.values()) { p.kills = 0; p.trail = []; this.spawn(p); }
  }
  humans() { return [...this.players.values()].filter((p) => !p.bot); }
  bots() { return [...this.players.values()].filter((p) => p.bot); }
  add(name, uid, bot) {
    let id = 1; while (this.players.has(id)) id++;
    const p = { id, uid, name, bot: !!bot, color: (id - 1) % 12, x: 0, y: 0, ang: 0, want: 0, alive: false, trail: [], dead: 0, kills: 0, plan: [], think: 0 };
    this.players.set(id, p); this.spawn(p); return p;
  }
  remove(id) {
    const p = this.players.get(id); if (!p) return;
    this.wipe(p); this.players.delete(id);
  }
  // botlar sonini sozlaydi: jami o'yinchi kamida MIN_PLAYERS
  fill() {
    let changed = false;
    const want = Math.max(0, MIN_PLAYERS - this.humans().length);
    while (this.bots().length > want) { this.remove(this.bots().pop().id); changed = true; }
    while (this.bots().length < want) {
      const used = new Set([...this.players.values()].map((p) => p.name));
      const nm = NAMES.find((n) => !used.has(n)) || 'Bot' + this.players.size;
      this.add(nm, null, true); changed = true;
    }
    return changed;
  }
  setOwn(i, id) { if (this.own[i] !== id) { this.own[i] = id; this.changes.push(i, id); } }
  free5(x, y) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const i = idx(x + dx, y + dy); if (!this.mask[i] || this.own[i] || this.trail[i]) return false;
    }
    return true;
  }
  spawn(p) {
    let sx = CX, sy = CY, ok = false;
    for (let t = 0; t < 80 && !ok; t++) {
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * (R - 8);
      sx = Math.round(CX + Math.cos(a) * d); sy = Math.round(CY + Math.sin(a) * d); ok = this.free5(sx, sy);
    }
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.setOwn(idx(sx + dx, sy + dy), p.id);
    p.x = sx + 0.5; p.y = sy + 0.5; p.ang = p.want = Math.random() * 6.283 - Math.PI; p.alive = true; p.trail = []; p.plan = []; p.dead = 0;
  }
  wipe(p) {
    for (const i of p.trail) if (this.trail[i] === p.id) this.trail[i] = 0;
    p.trail = [];
    for (let i = 0; i < this.own.length; i++) if (this.own[i] === p.id) { this.own[i] = 0; this.changes.push(i, 0); }
  }
  kill(p, by) {
    if (!p.alive) return;
    p.alive = false; p.dead = RESPAWN_S; this.wipe(p);
    if (by && by !== p) by.kills++;
  }
  counts() {
    const c = new Map(); for (const id of this.players.keys()) c.set(id, 0);
    for (let i = 0; i < this.own.length; i++) { const o = this.own[i]; if (o && c.has(o)) c.set(o, c.get(o) + 1); }
    return c;
  }
  ranking() {
    const c = this.counts();
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, bot: p.bot, color: p.color, alive: p.alive, cells: c.get(p.id), pct: +(c.get(p.id) * 100 / this.playable).toFixed(1), kills: p.kills }))
      .sort((a, b) => b.cells - a.cells);
  }
  step(dt) {
    if (this.ended) return;
    if (this.cd > 0) { this.cd -= dt; return; } // boshlanishidan oldingi sanash
    this.timeLeft -= dt * 1000;
    for (const p of this.players.values()) {
      if (!p.alive) { if (!this.elim) { p.dead -= dt; if (p.dead <= 0) this.spawn(p); } continue; }
      if (p.bot) this.think(p, dt);
      this.move(p, dt);
    }
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.ended = true; }
    if (this.elim && [...this.players.values()].filter((p) => p.alive).length <= 1) this.ended = true; // 1 kishi qolsa tugaydi
  }
  move(p, dt) {
    const da = norm(p.want - p.ang), mx = TURN * dt;
    p.ang = norm(p.ang + Math.max(-mx, Math.min(mx, da)));
    const nx = p.x + Math.cos(p.ang) * SPEED * dt, ny = p.y + Math.sin(p.ang) * SPEED * dt;
    const ox = Math.floor(p.x), oy = Math.floor(p.y), cx = Math.floor(nx), cy = Math.floor(ny);
    if (!this.inside(cx, cy)) return; // devor: joyida turadi
    p.x = nx; p.y = ny;
    if (cx === ox && cy === oy) return;
    if (cx !== ox && cy !== oy) { // diagonal sakrashda iz uzilmasligi uchun oraliq katak
      if (this.inside(cx, oy)) { this.enter(p, idx(cx, oy)); if (!p.alive) return; }
    }
    this.enter(p, idx(cx, cy));
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < W && y < H && this.mask[idx(x, y)] === 1; }
  enter(p, c) {
    const t = this.trail[c];
    if (t && t !== p.id) { const v = this.players.get(t); if (v) this.kill(v, p); }
    else if (t === p.id) {
      const k = p.trail.lastIndexOf(c);
      if (k >= 0 && k < p.trail.length - 3) { this.kill(p, p); return; }
    }
    if (this.own[c] === p.id) { if (p.trail.length) this.close(p); }
    else if (!this.trail[c]) { this.trail[c] = p.id; p.trail.push(c); }
  }
  close(p) {
    for (const c of p.trail) { this.trail[c] = 0; this.setOwn(c, p.id); }
    p.trail = [];
    // tashqaridan to'lqin: o'z hududim to'siq; yetib bo'lmagan joylar o'rab olingan
    const seen = new Uint8Array(W * H), q = [];
    const push = (i) => { if (!seen[i] && this.own[i] !== p.id) { seen[i] = 1; q.push(i); } };
    for (let x = 0; x < W; x++) { push(idx(x, 0)); push(idx(x, H - 1)); }
    for (let y = 0; y < H; y++) { push(idx(0, y)); push(idx(W - 1, y)); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W);
    }
    for (let i = 0; i < seen.length; i++) if (this.mask[i] && !seen[i] && this.own[i] !== p.id) this.setOwn(i, p.id);
  }
  /* --- bot aqli --- */
  think(p, dt) {
    p.think -= dt; if (p.think > 0) return; p.think = 0.12;
    const hx = Math.floor(p.x), hy = Math.floor(p.y);
    const ahead = (ang, d) => { const x = Math.floor(p.x + Math.cos(ang) * d), y = Math.floor(p.y + Math.sin(ang) * d); return this.inside(x, y) ? idx(x, y) : -1; };
    const danger = (ang) => { for (const d of [1.5, 3, 4.5]) { const c = ahead(ang, d); if (c < 0) return true; if (this.trail[c] === p.id) return true; } return false; };
    let want = p.want;
    // 1) xavf: devor yoki o'z izi
    if (danger(p.ang)) {
      for (const off of [0.8, -0.8, 1.6, -1.6, 2.4]) { if (!danger(p.ang + off)) { want = p.ang + off; p.plan = []; break; } }
      p.want = want; return;
    }
    // 2) raqib izini kesish (o'zi izda uzun bo'lmasa)
    if (p.trail.length < 14) {
      let best = null, bd = 99;
      for (const o of this.players.values()) if (o !== p && o.alive) for (let k = 0; k < o.trail.length; k += 2) {
        const c = o.trail[k], dx = (c % W) + 0.5 - p.x, dy = ((c / W) | 0) + 0.5 - p.y, d = Math.hypot(dx, dy);
        if (d < bd && d < 7 && Math.abs(norm(Math.atan2(dy, dx) - p.ang)) < 1.3) { bd = d; best = Math.atan2(dy, dx); }
      }
      if (best !== null) { p.want = best; return; }
    }
    // 3) uzun iz yoki reja tugadi: uyga qayt
    const inHome = this.own[idx(hx, hy)] === p.id;
    if (inHome && !p.trail.length) {
      // yangi sayohat: chiqish -> burilish -> burilish -> qaytish
      const a = Math.random() * 6.283 - Math.PI, s = Math.random() < 0.5 ? 1 : -1, L1 = 4 + Math.random() * 7, L2 = 4 + Math.random() * 7;
      p.plan = [{ a, l: L1 }, { a: a + s * Math.PI / 2, l: L2 }, { a: a + s * Math.PI, l: L1 + 3 }];
      p.leg = 0; p.legStart = { x: p.x, y: p.y };
    }
    if (p.plan.length && p.leg < p.plan.length) {
      const L = p.plan[p.leg];
      p.want = L.a;
      if (Math.hypot(p.x - p.legStart.x, p.y - p.legStart.y) >= L.l) { p.leg++; p.legStart = { x: p.x, y: p.y }; }
      if (p.trail.length > 30) p.leg = p.plan.length;
    } else if (p.trail.length) { // reja tugagan, izda: eng yaqin o'z katagiga
      let bd = 1e9, bx = 0, by = 0;
      for (let i = 0; i < this.own.length; i += 3) if (this.own[i] === p.id) { const d = (i % W - p.x) ** 2 + (((i / W) | 0) - p.y) ** 2; if (d < bd) { bd = d; bx = i % W; by = (i / W) | 0; } }
      p.want = Math.atan2(by + 0.5 - p.y, bx + 0.5 - p.x);
    }
  }
}
// Tikilgan Hudud: stavka 3 tanga, 6 kishi (5 tada ham boshlanadi). O'yinchi soni -> [3+ tirik, 2 tirik, 1 tirik] mukofotlari. Yig'indi = bank.
const PAYOUT = { 6: { 3: [10, 5, 3], 2: [11, 7], 1: [18] }, 5: { 3: [8, 4, 3], 2: [9, 6], 1: [15] } };
module.exports = { PAYOUT, Room, W, H, R, CX, CY, SPEED, ROUND_MS, MIN_PLAYERS, idx };
