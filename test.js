// Shashka mantig'i testlari: node test.js
const assert = require('assert');
const G = require('./game');
const E = () => Array.from({ length: 8 }, () => Array(8).fill(null));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('boshlang\'ich holat: 12 + 12 dona, oq 7 ta yurish', () => {
  const b = G.initial();
  assert.strictEqual(b.flat().filter((x) => x === 'w').length, 12);
  assert.strictEqual(b.flat().filter((x) => x === 'b').length, 12);
  assert.strictEqual(G.legal(b, 'w').length, 7);
});
t('oddiy dona orqaga yura olmaydi', () => {
  const b = E(); b[4][3] = 'w';
  const m = G.legal(b, 'w').map((x) => x.path[1].join());
  assert.deepStrictEqual(m.sort(), ['3,2', '3,4']);
});
t('urish majburiy', () => {
  const b = E(); b[4][3] = 'w'; b[3][4] = 'b'; b[6][1] = 'w';
  const m = G.legal(b, 'w');
  assert.ok(m.every((x) => x.captured.length));
  assert.strictEqual(m.length, 1);
});
t('dona orqaga ham ura oladi', () => {
  const b = E(); b[3][4] = 'w'; b[4][3] = 'b';
  const m = G.legal(b, 'w');
  assert.strictEqual(m.length, 1); assert.deepStrictEqual(m[0].path[1], [5, 2]);
});
t('ketma-ket urish (zanjir)', () => {
  const b = E(); b[6][1] = 'w'; b[5][2] = 'b'; b[3][4] = 'b';
  const m = G.legal(b, 'w');
  assert.strictEqual(m.length, 1); assert.strictEqual(m[0].path.length, 3); assert.strictEqual(m[0].captured.length, 2);
});
t('damka uzoqdan uradi va masofaga qo\'nadi', () => {
  const b = E(); b[7][0] = 'W'; b[4][3] = 'b';
  const m = G.legal(b, 'w');
  assert.ok(m.length >= 1 && m.every((x) => x.captured.length === 1));
  assert.ok(m.some((x) => x.path[1][0] === 2 && x.path[1][1] === 5));
});
t('damkaga aylanish', () => {
  const b = E(); b[1][2] = 'w'; b[7][0] = 'b';
  const mv = G.legal(b, 'w').find((x) => x.path[1][0] === 0);
  G.apply(b, mv);
  assert.strictEqual(b[0][mv.path[1][1]], 'W');
});
t('urish paytida damka bo\'lgan dona davom etadi', () => {
  const b = E(); b[2][3] = 'w'; b[1][4] = 'b'; b[1][6] = 'b'; b[3][6] = 'b';
  const m = G.legal(b, 'w');
  assert.ok(m.some((x) => x.captured.length >= 2));
});
t('bir donani ikki marta urib bo\'lmaydi', () => {
  const b = E(); b[4][3] = 'W'; b[3][2] = 'b'; b[3][4] = 'b'; b[1][4] = 'b';
  for (const m of G.legal(b, 'w')) {
    const k = m.captured.map(String); assert.strictEqual(new Set(k).size, k.length);
  }
});
t('bot to\'liq o\'yinni xatosiz o\'ynaydi', () => {
  let b = G.initial(), turn = 'w', plies = 0;
  while (plies < 400) {
    const m = G.aiMove(b, turn); if (!m) break;
    assert.ok(G.legal(b, turn).some((x) => JSON.stringify(x.path) === JSON.stringify(m.path)));
    G.apply(b, m); turn = turn === 'w' ? 'b' : 'w'; plies++;
  }
  console.log('   yurishlar:', plies);
});

const HU = require('./kataklar');
t('hudud: katak egallash va qo\'shimcha yurish', () => {
  const s = HU.initial();
  assert.strictEqual(HU.apply(s, 'w', ['h', 0, 0]), 0); assert.strictEqual(HU.apply(s, 'b', ['h', 1, 0]), 0);
  assert.strictEqual(HU.apply(s, 'w', ['v', 0, 0]), 0); assert.strictEqual(HU.apply(s, 'b', ['v', 0, 1]), 1);
  assert.strictEqual(s.own[0][0], 'b'); assert.deepStrictEqual(HU.score(s), { w: 0, b: 1 });
  assert.ok(!HU.valid(s, ['v', 0, 1]) && !HU.valid(s, ['h', 6, 0]) && !HU.valid(s, ['x', 0, 0]) && HU.valid(s, ['h', 5, 4]));
});
t('hudud: bir chiziq ikki katakni yopishi mumkin', () => {
  const s = HU.initial(); const L = [['h', 0, 0], ['v', 0, 0], ['v', 0, 1], ['h', 2, 0], ['v', 1, 0], ['v', 1, 1]];
  for (const l of L) HU.apply(s, 'w', l); assert.strictEqual(HU.apply(s, 'b', ['h', 1, 0]), 2); assert.strictEqual(HU.score(s).b, 2);
});
t('hudud: bot to\'liq o\'yinni o\'ynaydi, 25 katak taqsimlanadi', () => {
  const s = HU.initial(); let turn = 'w', moves = 0;
  while (HU.legal(s).length) { const m = HU.aiMove(s); assert.ok(HU.valid(s, m)); if (HU.apply(s, turn, m) === 0) turn = turn === 'w' ? 'b' : 'w'; moves++; }
  const sc = HU.score(s); assert.strictEqual(sc.w + sc.b, 25); assert.strictEqual(moves, 60);
});

const TR = require('./territory');
const drive = (r, p, steps) => { for (const [a, secs] of steps) { p.want = a; for (let i = 0; i < Math.round(secs / 0.05); i++) { r.step(0.05); if (!p.alive) return false; } } return true; };
t('hudud: iz bilan o\'rab olingan joy egallanadi', () => {
  const r = new TR.Room(), me = r.add('A', 1, false); me.ang = me.want = 0;
  const b = r.counts().get(me.id); assert.strictEqual(b, 25);
  assert.ok(drive(r, me, [[0, 1.1], [Math.PI / 2, 0.7], [Math.PI, 1.2], [-Math.PI / 2, 1.0]]));
  assert.ok(r.counts().get(me.id) > 60, 'hudud kengaydi');
});
t('hudud: raqib izini kesgan uni yo\'q qiladi', () => {
  const r = new TR.Room(), a = r.add('A', 1, false), c = r.add('B', 2, false);
  const k = TR.idx(10, 10); r.trail[k] = a.id; a.trail.push(k); r.own[TR.idx(40, 40)] = a.id;
  r.enter(c, k); assert.ok(!a.alive && c.kills === 1); assert.notStrictEqual(r.trail[k], a.id);
  assert.ok(![...r.own].includes(a.id), 'o\'lgan o\'yinchi hududi o\'chadi');
});
t('hudud: o\'z iziga tegish o\'ldiradi, yaqin iz kataklari kechiriladi', () => {
  const r = new TR.Room(), a = r.add('A', 1, false);
  const cells = [TR.idx(5, 5), TR.idx(6, 5), TR.idx(7, 5), TR.idx(8, 5), TR.idx(9, 5)]; cells.forEach((c) => { r.trail[c] = a.id; a.trail.push(c); });
  r.enter(a, cells[4]); assert.ok(a.alive); r.enter(a, cells[0]); assert.ok(!a.alive);
});
t('hudud: botlar to\'liq raundni xatosiz o\'ynaydi, hududlar to\'g\'ri sanaladi', () => {
  const r = new TR.Room(); r.add('Inson', 1, false); r.fill(); assert.strictEqual(r.players.size, 5);
  let ticks = 0; while (!r.ended && ticks < 5000) { r.step(0.066); ticks++; for (const p of r.players.values()) if (p.alive) assert.ok(r.inside(Math.floor(p.x), Math.floor(p.y))); }
  assert.ok(r.ended); const rk = r.ranking(); assert.ok(rk[0].cells >= rk[rk.length - 1].cells);
  assert.ok(rk.reduce((x, y) => x + y.cells, 0) <= r.playable);
  console.log('   raund:', ticks, 'tik; g\'olib', rk[0].name, rk[0].pct + '%');
  r.add('Ikkinchi', 2, false); r.add('3', 3, false); r.fill(); assert.strictEqual(r.bots().length, 2);
});
t('hudud: stavkaga qarab mukofotlar bankka teng', () => {
  for (const st of [3, 20, 100, 300, 1000]) for (const N of [5, 6]) for (const k of [1, 2, 3, 4]) { const p = TR.payouts(N, k, st); assert.strictEqual(p.reduce((a, b) => a + b, 0), N * st); assert.ok(p.every((x) => x >= 0)); }
  assert.deepStrictEqual(TR.payouts(6, 3, 3), [10, 5, 3]); assert.deepStrictEqual(TR.payouts(6, 2, 20), [74, 46]); assert.deepStrictEqual(TR.payouts(6, 1, 100), [600]);
});
t('hudud (tikilgan): o\'lgan qayta tug\'ilmaydi, 1 kishi qolsa tugaydi, mukofotlar bankka teng', () => {
  const r = new TR.Room({ elim: true, stake: 3 }); const ps = [1, 2, 3, 4, 5, 6].map((i) => r.add('P' + i, i, false)); r.cd = 0;
  r.kill(ps[0], null); for (let i = 0; i < 100; i++) r.step(0.05); assert.ok(!ps[0].alive, 'qayta tug\'ilmadi'); assert.ok(!r.ended);
  [1, 2, 3, 4].forEach((i) => r.kill(ps[i], null)); r.step(0.05); assert.ok(r.ended, '1 kishi qolsa tugaydi');
  for (const n of [5, 6]) for (const k of [1, 2, 3]) assert.strictEqual(TR.PAYOUT[n][k].reduce((a, b) => a + b, 0), 3 * n);
  assert.deepStrictEqual(TR.PAYOUT[6], { 3: [10, 5, 3], 2: [11, 7], 1: [18] });
});
console.log(n + ' test o\'tdi');
