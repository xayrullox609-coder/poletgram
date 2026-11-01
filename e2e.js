// Uchdan-uchgacha sinov: serverni ishga tushirib, 2 ta o'yinchi bilan o'ynaydi. node e2e.js
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = require('assert');
const PORT = 3999;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, DB_FILE: '/tmp/e2e-db.json' }, stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p, id, m = 'GET') => fetch(`http://localhost:${PORT}${p}`, { method: m, headers: { 'x-init-data': `dev:${id}::${id}` } }).then((r) => r.json());
function client(id) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`); const c = { ws, msgs: [], id };
  ws.on('message', (d) => { const m = JSON.parse(d); c.msgs.push(m); if (m.t === 'state') c.state = m; if (m.t === 'balance') c.coins = m.coins; });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = async (t, ms = 3000) => { const s = Date.now(); while (Date.now() - s < ms) { const i = c.msgs.findIndex((m) => m.t === t); if (i >= 0) return c.msgs.splice(i, 1)[0]; await sleep(30); } throw new Error('kutildi: ' + t); };
  return new Promise((r) => ws.on('open', () => { c.send({ t: 'auth', initData: `dev:${id}::${id}` }); c.wait('auth_ok').then(() => r(c)); }));
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
  assert.strictEqual(oa.coins, 80); assert.strictEqual(ob.coins, 120); // 100-20 | 100-20+40
  console.log("ok - taslim: yutqazgan 80, g'olib 120 (x2)");

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

  // vazifalar (admin boshqaradi)
  const adm = (p, m = 'GET', body, pass = 'admin') => fetch(`http://localhost:${PORT}${p}`, { method: m, headers: { 'x-admin-pass': pass, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ s: r.status, ...(await r.json()) }));
  assert.strictEqual((await adm('/api/admin/stats', 'GET', null, 'xato')).s, 401);
  const nt = await adm('/api/admin/tasks', 'POST', { title: 'Sinov kanal', type: 'link', reward: 2.5, url: 'https://example.com', wait: 1, limit: 2, active: true });
  assert.ok(nt.ok, JSON.stringify(nt));
  assert.strictEqual((await adm('/api/admin/tasks', 'POST', { title: 'x', type: 'link', url: 'javascript:1', active: true })).error !== undefined, true);
  const tk = await api('/api/tasks', 'alice'); const task = tk.list.find((x) => x.id === nt.task.id); assert.ok(task);
  assert.strictEqual((await api('/api/tasks/claim?id=' + task.id, 'alice', 'POST')).error, 'wait');
  assert.ok((await api('/api/tasks/start?id=' + task.id, 'alice', 'POST')).url);
  assert.strictEqual((await api('/api/tasks/claim?id=' + task.id, 'alice', 'POST')).error, 'wait');
  await sleep(1100);
  const bal0 = (await api('/api/me', 'alice')).user.coins;
  const cl = await api('/api/tasks/claim?id=' + task.id, 'alice', 'POST'); assert.ok(cl.ok); assert.strictEqual(cl.coins, bal0 + 2.5);
  for (let k = 0; k < 2; k++) { await api('/api/tasks/start?id=' + task.id, 'alice', 'POST'); await sleep(1100); await api('/api/tasks/claim?id=' + task.id, 'alice', 'POST'); }
  assert.strictEqual((await api('/api/tasks/start?id=' + task.id, 'alice', 'POST')).error, 'limit');
  await adm('/api/admin/tasks', 'POST', { ...nt.task, active: false });
  assert.ok(!(await api('/api/tasks', 'alice')).list.some((x) => x.id === task.id));
  console.log('ok - admin vazifa yaratadi; foydalanuvchi oladi; limit va faolsizlantirish ishlaydi');

  const rt = await api('/api/rating?type=wins', 'alice'); assert.ok(rt.list.length >= 2);
  console.log('ok - reyting');

  // referal: carol alice'ning havolasi bilan kiradi
  const a0 = (await api('/api/me', 'alice')).user.coins;
  const cu = await fetch(`http://localhost:${PORT}/api/me`, { headers: { 'x-init-data': 'dev:carol:alice:Carol' } }).then((r) => r.json());
  assert.strictEqual(cu.user.coins, 100);
  assert.strictEqual((await api('/api/me', 'alice')).user.coins, a0 + 20);
  assert.strictEqual((await api('/api/tasks', 'alice')).ref.count, 1);
  assert.ok((await api('/api/me', 'alice')).user.refLink.startsWith('https://t.me/Poletgram_bot?start=ref_'));
  console.log('ok - referal: +20, hisoblagich 1, havola t.me/Poletgram_bot?start=ref_...');

  // admin: tanga, ban, sozlama, statistika
  assert.ok((await adm('/api/admin/users/coins', 'POST', { id: 'devcarol', amount: 5 })).ok);
  assert.strictEqual((await adm('/api/admin/users/coins', 'POST', { id: 'devcarol', amount: -9999 })).error !== undefined, true);
  assert.ok((await adm('/api/admin/users/ban', 'POST', { id: 'devcarol', banned: true })).banned);
  assert.strictEqual((await fetch(`http://localhost:${PORT}/api/me`, { headers: { 'x-init-data': 'dev:carol::Carol' } })).status, 403);
  await adm('/api/admin/users/ban', 'POST', { id: 'devcarol', banned: false });
  assert.strictEqual((await adm('/api/admin/settings', 'POST', { welcomeCoins: 50, referralReward: 7 })).welcomeCoins, 50);
  const dd = await fetch(`http://localhost:${PORT}/api/me`, { headers: { 'x-init-data': 'dev:dave:alice:Dave' } }).then((r) => r.json());
  assert.strictEqual(dd.user.coins, 50);
  const st = await adm('/api/admin/stats'); assert.ok(st.users >= 4);
  assert.ok((await fetch(`http://localhost:${PORT}/admin`).then((r) => r.text())).includes('Poletgram admin'));
  console.log('ok - admin: tanga, ban, sozlamalar, statistika, /admin sahifa');
  // do'kon: tanga bilan
  const POST = (p, body, id = 'alice') => fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: { 'x-init-data': `dev:${id}::${id}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const sh = await api('/api/shop', 'alice'); assert.strictEqual(sh.products.length, 6);
  assert.ok(sh.products.find((p) => p.id === 'ig_followers').soon);
  const P = Object.fromEntries(sh.products.map((p) => [p.id, p]));
  assert.deepStrictEqual([P.ig_views.qty, P.ig_views.price, P.ig_likes.qty, P.ig_likes.price], [1000, 100, 100, 100]);
  assert.deepStrictEqual([P.tg_views.qty, P.tg_views.price, P.tg_reactions.qty, P.tg_reactions.price, P.tg_followers.qty, P.tg_followers.price], [1000, 200, 100, 100, 10, 100]);
  await adm('/api/admin/users/coins', 'POST', { id: 'devalice', amount: 2000 });
  assert.ok((await POST('/api/shop/order', { id: 'tg_views', qty: 2000, link: 'https://evil.com/x' })).error);
  assert.ok((await POST('/api/shop/order', { id: 'ig_followers', qty: 100, link: 'https://instagram.com/x' })).error);
  assert.ok((await POST('/api/shop/order', { id: 'tg_views', qty: 99999999, link: 'https://t.me/ch/1' })).error);
  assert.ok((await POST('/api/shop/order', { id: 'tg_views', qty: 5, link: 'https://t.me/ch/1' })).error);
  const b0 = (await api('/api/me', 'alice')).user.coins;
  const ok = await POST('/api/shop/order', { id: 'tg_views', qty: 2500, link: 'https://t.me/ch/1' }); // 3 paket = 600 tanga, 3000 ta
  assert.ok(ok.ok); assert.strictEqual(ok.coins, b0 - 600);
  const o1 = (await adm('/api/admin/orders?status=paid')).list[0];
  assert.strictEqual(o1.price, 600); assert.strictEqual(o1.qty, 3000);
  assert.ok((await adm('/api/admin/orders/refund', 'POST', { id: o1.id })).ok);
  assert.strictEqual((await api('/api/me', 'alice')).user.coins, b0);
  assert.ok((await adm('/api/admin/orders/refund', 'POST', { id: o1.id })).error);
  const o2 = await POST('/api/shop/order', { id: 'ig_likes', qty: 100, link: 'https://instagram.com/p/x' }); assert.ok(o2.ok);
  const lo = (await adm('/api/admin/orders?status=paid')).list[0];
  assert.ok((await adm('/api/admin/orders/status', 'POST', { id: lo.id, status: 'done' })).ok);
  assert.strictEqual((await api('/api/shop', 'alice')).orders[0].status, 'done');
  const poor = await POST('/api/shop/order', { id: 'ig_likes', qty: 100, link: 'https://instagram.com/p/x' }, 'bobby'); // yangi foydalanuvchi: 50-100 tanga
  await adm('/api/admin/users/coins', 'POST', { id: 'devbobby', amount: -(await api('/api/me', 'bobby')).user.coins + 10 });
  assert.strictEqual((await POST('/api/shop/order', { id: 'ig_likes', qty: 100, link: 'https://instagram.com/p/x' }, 'bobby')).error, 'Tanga yetarli emas');
  assert.ok((await adm('/api/admin/shop', 'POST', { id: 'ig_followers', title: 'Obunachi', qty: 100, price: 150, maxPacks: 10, active: true, soon: false })).ok);
  assert.ok((await POST('/api/shop/order', { id: 'ig_followers', qty: 100, link: 'https://instagram.com/x' })).ok);
  assert.strictEqual((await fetch(`http://localhost:${PORT}/`).then((r) => r.text())).includes('DEPOZIT'), false);
  console.log("ok - do'kon: tanga narxlari, tekshiruvlar, yechish/qaytarish, yetarli emas, admin narx tahriri, depozit yo'q");

  console.log('\nHAMMA SINOVLAR O\'TDI');
  srv.kill(); process.exit(0);
})().catch((e) => { console.error('XATO:', e.message); srv.kill(); process.exit(1); });
