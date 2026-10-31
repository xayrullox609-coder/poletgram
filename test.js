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
console.log(n + ' test o\'tdi');
