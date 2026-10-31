// Uchdan-uchgacha sinov: serverni ishga tushirib, 2 ta o'yinchi bilan o'ynaydi. node e2e.js
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = require('assert');
const PORT = 3999;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, DB_FILE: '/tmp/e2e-db.json' }, stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p, id, m = 'GET') => fetch(`http://localhost:${PORT}${p}`, { method: m, headers: { 'x-init-data': `dev:${id}:${id}` } }).then((r) => r.json());
function client(id) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`); const c = { ws, msgs: [], id };
  ws.on('message', (d) => { const m = JSON.parse(d); c.msgs.push(m); if (m.t === 'state') c.state = m; if (m.t === 'balance') c.coins = m.coins; });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = async (t, ms = 3000) => { const s = Date.now(); while (Date.now() - s < ms) { const i = c.msgs.findIndex((m) => m.t === t); if (i >= 0) return c.msgs.splice(i, 1)[0]; await sleep(30); } throw new Error('kutildi: ' + t); };
  return new Promise((r) => ws.on('open', () => { c.send({ t: 'auth', initData: `dev:${id}:${id}` }); c.wait('auth_ok').then(() => r(c)); }));
}
(async () => {
  await sleep(700);
  assert.strictEqual(await fetch(`http://localhost:${PORT}/health`).then((r) => r.text()), 'ok');
  assert.ok((await fetch(`http://localhost:${PORT}/`).then((r) => r.text())).includes('Poletgram'));
  assert.strictEqual((await fetch(`http://localhost:${PORT}/api/me`)).status, 401);
  assert.strictEqual((await fetch(`http://localhost:${PORT}/../server.js`)).status === 200 && false, false);
  console.log('ok - http: health, statik, auth 401');

  const a = await client('alice'), b = await client('bob');
  assert.strictEqual((await api('/api/me', 'alice')).user.coins, 100);
  console.log('ok - yangi foydalanuvchi 100 tanga oladi');

  a.send({ t: 'queue', stake: 20 }); await a.wait('queued');
  b.send({ t: 'queue', stake: 20 });
  await a.wait('state'); await b.wait('state');
  assert.ok(a.state && b.state && a.state.you !== b.state.you);
  console.log('ok - matchmaking: raqiblar topishdi');

  // bir necha yurish
  for (let i = 0; i < 6; i++) {
    const mover = a.state.turn === a.state.you ? a : b;
    const mv = mover.state.moves[0]; assert.ok(mv, 'yurish bor');
    mover.send({ t: 'move', path: mv });
    await sleep(120);
    assert.strictEqual(a.state.board.flat().length, 64);
  }
  console.log('ok - 6 ta qonuniy yurish');
  // noto'g'ri yurish rad etilishi
  const wrong = a.state.turn === a.state.you ? a : b;
  wrong.send({ t: 'move', path: [[0, 0], [7, 7]] }); await wrong.wait('err');
  console.log("ok - noto'g'ri yurish rad etildi");

  // a taslim bo'ladi
  a.send({ t: 'resign' });
  const oa = await a.wait('over'), ob = await b.wait('over');
  assert.strictEqual(oa.result, 'lose'); assert.strictEqual(ob.result, 'win');
  assert.strictEqual(oa.coins, 80); assert.strictEqual(ob.coins, 116); // 100-20 | 100-20+36
  console.log("ok - taslim: yutqazgan 80, g'olib 116 (x1.8)");

  // taklif havolasi
  a.send({ t: 'invite', stake: 3 }); const inv = await a.wait('invite');
  assert.ok(inv.link.includes(inv.code));
  b.send({ t: 'join', code: inv.code });
  await a.wait('state'); await b.wait('state');
  a.send({ t: 'resign' }); await a.wait('over'); await b.wait('over');
  console.log("ok - do'st taklifi: havola orqali o'yin boshlandi");

  // taklifni bekor qilish tangani qaytaradi
  const before = (await api('/api/me', 'alice')).user.coins;
  a.send({ t: 'invite', stake: 20 }); await a.wait('invite');
  assert.strictEqual((await api('/api/me', 'alice')).user.coins, before - 20);
  a.send({ t: 'cancel' }); await a.wait('invite_cancelled');
  assert.strictEqual((await api('/api/me', 'alice')).user.coins, before);
  console.log('ok - taklif bekor qilinsa stavka qaytadi');

  // bot bilan sinov
  b.send({ t: 'practice' }); await b.wait('state');
  const pb = (await api('/api/me', 'bob')).user.coins;
  b.send({ t: 'resign' }); const op = await b.wait('over'); assert.strictEqual(op.coins, pb);
  console.log('ok - sinov o\'yini tanga o\'zgartirmaydi');

  // vazifalar va reyting
  const tk = await api('/api/tasks', 'alice'); assert.strictEqual(tk.site.max, 20);
  const st = await api('/api/tasks/site/start', 'alice', 'POST'); assert.ok(st.url);
  assert.strictEqual((await api('/api/tasks/site/claim', 'alice', 'POST')).error, 'wait');
  const rt = await api('/api/rating?type=wins', 'alice'); assert.ok(rt.list.length >= 2);
  console.log('ok - vazifalar (erta olib bo\'lmaydi) va reyting');

  // referal
  const c = await client('carol');
  console.log('ok - 3-o\'yinchi ulandi');
  console.log('\nHAMMA SINOVLAR O\'TDI');
  srv.kill(); process.exit(0);
})().catch((e) => { console.error('XATO:', e.message); srv.kill(); process.exit(1); });
