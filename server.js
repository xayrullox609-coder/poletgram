// Poletgram: Telegram Mini App + bot + WebSocket shashka serveri
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const G = require('./game');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e && e.message));
process.on('uncaughtException', (e) => console.error('uncaughtException', e && e.stack));
let BOT_USERNAME = (process.env.BOT_USERNAME || 'Poletgram_bot').replace(/^@/, '');
const BASE_URL = (process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
// Brauzerda sinash uchun "dev" kirish. Tokensiz avtomatik yoqiladi; productionda ALLOW_DEV=0 qiling.
const ALLOW_DEV = process.env.ALLOW_DEV ? process.env.ALLOW_DEV === '1' : !BOT_TOKEN;
// Admin panel paroli (/admin). Sozlanmasa: faqat sinov rejimida 'admin', productionda panel o'chiq.
// Adminlarning Telegram ID'lari (vergul bilan): ADMIN_IDS=12345,67890. Botda /id yozsangiz ID'ingizni ko'rasiz.
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (ALLOW_DEV && !BOT_TOKEN ? 'admin' : '');

const STAKES = [3, 20, 100, 300, 1000];
const WIN_MULT = 2; // g'olib stavkaning 2 baravarini oladi (komissiya yo'q)
const TOTAL_MS = 6 * 60 * 1000;
const MOVE_MS = 60 * 1000;

/* ---------------- Ma'lumotlar bazasi (JSON fayl) ---------------- */
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
let db = { users: {}, ledger: [], pendingRef: {}, tasks: null, settings: {}, shop: null, shopVer: 0, orders: [] };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch { /* yangi baza */ }
db.settings = Object.assign({ welcomeCoins: 100, referralReward: 20 }, db.settings || {});
if (!Array.isArray(db.orders)) db.orders = [];
const SHOP_VER = 2; // narxlar tangada
if (!Array.isArray(db.shop) || db.shopVer !== SHOP_VER) {
  // price = bitta paket narxi (tanga), qty = bitta paketdagi miqdor. Admin paneldan o'zgartiriladi.
  db.shopVer = SHOP_VER;
  db.shop = [
    { id: 'ig_views', platform: 'instagram', kind: 'views', title: "Ko'rish", qty: 1000, price: 100, maxPacks: 20, active: true, soon: false },
    { id: 'ig_followers', platform: 'instagram', kind: 'followers', title: 'Obunachi', qty: 0, price: 0, maxPacks: 20, active: true, soon: true },
    { id: 'ig_likes', platform: 'instagram', kind: 'likes', title: 'Like', qty: 100, price: 100, maxPacks: 20, active: true, soon: false },
    { id: 'tg_views', platform: 'telegram', kind: 'views', title: "Ko'rish", qty: 1000, price: 200, maxPacks: 20, active: true, soon: false },
    { id: 'tg_reactions', platform: 'telegram', kind: 'reactions', title: 'Reaksiya', qty: 100, price: 100, maxPacks: 20, active: true, soon: false },
    { id: 'tg_followers', platform: 'telegram', kind: 'followers', title: 'Obunachi', qty: 10, price: 100, maxPacks: 50, active: true, soon: false },
  ];
}
if (!Array.isArray(db.tasks)) {
  db.tasks = [
    { id: 't_ad', type: 'ad', title: 'Reklama ko\'rish', reward: 1, url: '', wait: 10, limit: 20, once: false, active: false },
    { id: 't_site', type: 'link', title: 'Saytga o\'tish', reward: 0.5, url: BASE_URL || 'https://telegram.org', wait: 8, limit: 20, once: false, active: true },
  ];
}
let dirty = false;
const save = () => { dirty = true; };
function flush() {
  if (!dirty) return;
  dirty = false;
  try {
    if (db.ledger.length > 5000) db.ledger = db.ledger.slice(-5000);
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  } catch (e) { console.error('db save error', e.message); }
}
setInterval(flush, 3000);
process.on('SIGTERM', () => { flush(); process.exit(0); });

const round1 = (x) => Math.round(x * 10) / 10;
const dayKey = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);

// Balans faqat shu funksiya orqali o'zgaradi va jurnalga yoziladi (ledger)
function credit(u, amount, reason, ref) {
  u.coins = round1(u.coins + amount);
  db.ledger.push({ t: Date.now(), u: u.id, a: amount, r: reason, ref: ref || null, bal: u.coins });
  save();
}

function getUser(tgUser, startParam) {
  const id = String(tgUser.id);
  let u = db.users[id];
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || 'Mehmon';
  if (!u) {
    u = db.users[id] = {
      id, name, photo: tgUser.photo_url || '', coins: 0, wins: 0, losses: 0, draws: 0, games: 0,
      created: Date.now(), refBy: null, banned: false, tasks: { day: '', done: {}, started: {}, forever: {} },
    };
    credit(u, db.settings.welcomeCoins, 'welcome');
    let refId = '';
    if (startParam && startParam.startsWith('ref_')) refId = startParam.slice(4);
    if (!refId && db.pendingRef[id]) refId = db.pendingRef[id];
    delete db.pendingRef[id];
    if (refId && refId !== id && db.users[refId]) {
      u.refBy = refId;
      credit(db.users[refId], db.settings.referralReward, 'referral', id);
      notify(refId, `🎉 Do'stingiz ${name} qo'shildi: +${db.settings.referralReward} tanga!`);
    }
  } else {
    u.name = name;
    if (tgUser.photo_url) u.photo = tgUser.photo_url;
  }
  return u;
}

const xpOf = (u) => u.games + u.wins * 2;
const levelOf = (u) => 1 + Math.floor(xpOf(u) / 10);
const titleOf = (lv) => (lv < 3 ? 'Yangi' : lv < 6 ? "O'yinchi" : lv < 10 ? 'Usta' : 'Grossmeyster');
function pubUser(u) {
  if (u === 'bot' || !u) return { name: 'Bot (sinov)', level: 1, photo: '' };
  return { name: u.name, level: levelOf(u), photo: u.photo };
}
function meView(u) {
  const lv = levelOf(u);
  return {
    id: u.id, name: u.name, photo: u.photo, coins: u.coins, wins: u.wins, losses: u.losses,
    games: u.games, level: lv, title: titleOf(lv),
    refLink: `https://t.me/${BOT_USERNAME}?start=ref_${u.id}`,
  };
}

/* ---------------- Telegram initData tekshiruvi ---------------- */
function verifyInit(initData) {
  if (!initData || typeof initData !== 'string') return null;
  if (ALLOW_DEV && initData.startsWith('dev:')) {
    const [, id, ref, ...n] = initData.split(':');
    const clean = String(id).replace(/\W/g, '').slice(0, 20);
    if (!clean) return null;
    return { user: { id: 'dev' + clean, first_name: (n.join(':') || 'Mehmon').slice(0, 24) }, start: ref ? 'ref_dev' + String(ref).replace(/\W/g, '') : '' };
  }
  if (!BOT_TOKEN) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const h = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  if (h.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
  let user;
  try { user = JSON.parse(p.get('user') || 'null'); } catch { return null; }
  if (!user || !user.id) return null;
  return { user, start: p.get('start_param') || '' };
}

/* ---------------- Kichik HTTP router (express kerak emas) ---------------- */
const routes = [];
const app = {
  get: (p, ...h) => routes.push(['GET', p, h]),
  post: (p, ...h) => routes.push(['POST', p, h]),
  delete: (p, ...h) => routes.push(['DELETE', p, h]),
};
let webhook = null; // {path, fn}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
function onHttp(req, res) {
  const url = new URL(req.url, 'http://x');
  req.query = Object.fromEntries(url.searchParams);
  req.get = (h) => req.headers[h.toLowerCase()];
  res.json = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  res.send = (t) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(t); };
  if (webhook && req.method === 'POST' && url.pathname === webhook.path) return webhook.fn(req, res);
  const r = routes.find((x) => x[0] === req.method && x[1] === url.pathname);
  if (r) {
    const run = (i) => { if (r[2][i]) r[2][i](req, res, () => run(i + 1)); };
    if (req.method === 'GET' || req.method === 'DELETE') { req.body = {}; return run(0); }
    let raw = '';
    req.on('data', (d) => { raw += d; if (raw.length > 200e3) req.destroy(); });
    req.on('end', () => { try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; } run(0); });
    return;
  }
  if (req.method !== 'GET') { res.writeHead(404); return res.end(); }
  const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.join(__dirname, 'public', path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

app.get('/health', (_, res) => res.send('ok'));

function auth(req, res, next) {
  const v = verifyInit(req.get('x-init-data'));
  if (!v) {
    if (Date.now() - (auth.lastLog || 0) > 30e3) { auth.lastLog = Date.now(); console.warn('auth rad etildi: tokenSet=' + !!BOT_TOKEN + ', initData uzunligi=' + String(req.get('x-init-data') || '').length); }
    res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"auth"}');
  }
  req.u = getUser(v.user, v.start);
  if (req.u.banned) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"error":"banned"}'); }
  next();
}
const conns = new Map(); // uid -> Set(ws)
const online = () => conns.size;

app.get('/api/me', auth, (req, res) => res.json({ user: meView(req.u), online: online() }));

app.get('/api/rating', auth, (req, res) => {
  const type = req.query.type;
  const val = type === 'coins' ? (u) => u.coins : type === 'level' ? (u) => xpOf(u) : (u) => u.wins;
  const all = Object.values(db.users).sort((a, b) => val(b) - val(a));
  const list = all.slice(0, 100).map((u, i) => ({
    rank: i + 1, name: u.name, photo: u.photo, value: type === 'level' ? levelOf(u) : val(u), me: u.id === req.u.id,
  }));
  res.json({ list, myRank: all.findIndex((u) => u.id === req.u.id) + 1 });
});

function taskState(u) {
  let t = u.tasks;
  if (!t || !t.done) t = u.tasks = { day: '', done: {}, started: {}, forever: {} };
  if (t.day !== dayKey()) { t.day = dayKey(); t.done = {}; t.started = {}; save(); }
  return t;
}
const taskById = (id) => db.tasks.find((x) => x.id === id && x.active);
const chatOf = (url) => { const m = String(url).match(/(?:t\.me\/|^@)([A-Za-z0-9_]{4,})/); return m ? '@' + m[1] : ''; };
function taskView(task, t) {
  const done = t.done[task.id] || 0;
  return {
    id: task.id, type: task.type, title: task.title, reward: task.reward, wait: task.wait, limit: task.limit,
    once: !!task.once, done, completed: !!t.forever[task.id] || done >= task.limit,
  };
}
app.get('/api/tasks', auth, (req, res) => {
  const t = taskState(req.u);
  const refCount = Object.values(db.users).filter((x) => x.refBy === req.u.id).length;
  res.json({
    list: db.tasks.filter((x) => x.active).map((x) => taskView(x, t)),
    ref: { reward: db.settings.referralReward, count: refCount, link: meView(req.u).refLink },
  });
});
app.post('/api/tasks/start', auth, (req, res) => {
  const task = taskById(req.query.id);
  if (!task) return res.json({ error: 'notfound' });
  const t = taskState(req.u);
  if (taskView(task, t).completed) return res.json({ error: 'limit' });
  t.started[task.id] = Date.now(); save();
  res.json({ url: task.url, wait: task.wait });
});
app.post('/api/tasks/claim', auth, async (req, res) => {
  const task = taskById(req.query.id);
  if (!task) return res.json({ error: 'notfound' });
  const u = req.u, t = taskState(u);
  if (taskView(task, t).completed) return res.json({ error: 'limit' });
  const st = t.started[task.id], el = Date.now() - (st || 0);
  if (!st || el < task.wait * 1000 || el > 30 * 60e3) return res.json({ error: 'wait' });
  if (task.type === 'channel' && bot && !String(u.id).startsWith('dev')) {
    const chat = chatOf(task.url);
    try {
      const m = await bot.api.getChatMember(chat, Number(u.id));
      if (!['member', 'administrator', 'creator'].includes(m.status)) return res.json({ error: 'notmember' });
    } catch (e) { return res.json({ error: 'verify' }); }
  }
  delete t.started[task.id];
  t.done[task.id] = (t.done[task.id] || 0) + 1;
  if (task.once) t.forever[task.id] = true;
  credit(u, task.reward, 'task', task.id);
  res.json({ ok: true, coins: u.coins });
});

/* ---------------- Do'kon (tanga bilan) ---------------- */
const linkOk = (p, link) => (p.platform === 'instagram'
  ? /^https?:\/\/(www\.)?instagram\.com\/\S+$/i.test(link)
  : /^(https?:\/\/t\.me\/\S+|@[A-Za-z0-9_]{4,})$/i.test(link));
const shopView = (p) => ({ id: p.id, platform: p.platform, kind: p.kind, title: p.title, qty: p.qty, price: p.price, maxPacks: p.maxPacks, soon: !!p.soon });
const orderView = (o) => ({ id: o.id, title: o.title, qty: o.qty, price: o.price, status: o.status, created: o.created, platform: o.platform });
app.get('/api/shop', auth, (req, res) => {
  res.json({
    products: db.shop.filter((p) => p.active).map(shopView),
    orders: db.orders.filter((o) => o.uid === req.u.id).slice(-15).reverse().map(orderView),
  });
});
app.post('/api/shop/order', auth, (req, res) => {
  const b = req.body || {}, u = req.u;
  const p = db.shop.find((x) => x.id === b.id);
  if (!p || !p.active || p.soon || !p.price || !p.qty) return res.json({ error: 'Xizmat hozircha mavjud emas' });
  const want = Math.round(Number(b.qty));
  const minQ = p.qty, maxQ = p.qty * p.maxPacks;
  if (!(want >= minQ && want <= maxQ)) return res.json({ error: `Miqdor ${minQ} dan ${maxQ} gacha bo'lsin` });
  const packs = Math.ceil(want / p.qty); // narx paketlar bo'yicha; mijoz to'langan paketlarning to'liq miqdorini oladi
  const link = String(b.link || '').trim().slice(0, 200);
  if (!linkOk(p, link)) return res.json({ error: p.platform === 'instagram' ? 'Instagram havolasini kiriting (https://instagram.com/...)' : 'Telegram havolasini kiriting (https://t.me/... yoki @kanal)' });
  const price = p.price * packs;
  if (u.coins < price) return res.json({ error: 'Tanga yetarli emas' });
  const order = {
    id: 'o_' + crypto.randomBytes(5).toString('hex'), uid: u.id, uname: u.name, product: p.id, platform: p.platform,
    title: `${p.platform === 'instagram' ? 'Instagram' : 'Telegram'}: ${p.title}`, qty: p.qty * packs, packs, price,
    link, status: 'paid', created: Date.now(), paidAt: Date.now(),
  };
  credit(u, -price, 'shop', order.id); // balans faqat jurnal orqali o'zgaradi
  db.orders.push(order); save();
  sendBalance(u);
  for (const a of ADMIN_IDS) notify(a, `🛒 Yangi buyurtma: ${order.title} ×${order.qty}\n${price} tanga · ${order.uname}\n${order.link}`);
  res.json({ ok: true, coins: u.coins, order: order.id });
});

/* ---------------- Admin panel API ---------------- */
const adminFails = new Map();
function admin(req, res, next) {
  const fail = (code, msg) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: msg })); };
  const tv = verifyInit(req.get('x-init-data')); // Telegram ichida: imzosi tekshirilgan admin ID
  if (tv && ADMIN_IDS.includes(String(tv.user.id))) return next();
  if (!ADMIN_PASSWORD) return fail(403, 'disabled');
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
  const f = adminFails.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - f.t > 10 * 60e3) { f.n = 0; f.t = Date.now(); }
  if (f.n >= 10) return fail(429, 'too_many');
  const given = Buffer.from(String(req.get('x-admin-pass') || ''));
  const real = Buffer.from(ADMIN_PASSWORD);
  if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) { f.n++; adminFails.set(ip, f); return fail(401, 'auth'); }
  next();
}
app.get('/api/admin/stats', admin, (req, res) => {
  const us = Object.values(db.users), today = dayKey();
  const real = us.filter((u) => !String(u.id).startsWith('dev'));
  res.json({
    users: us.length, newToday: us.filter((u) => new Date(u.created + 5 * 3600e3).toISOString().slice(0, 10) === today).length,
    online: online(), activeGames: games.size, queued: [...queues.values()].reduce((a, q) => a + q.length, 0),
    totalCoins: round1(us.reduce((a, u) => a + u.coins, 0)), gamesPlayed: Math.round(us.reduce((a, u) => a + u.games, 0) / 2),
    referrals: us.filter((u) => u.refBy).length, banned: us.filter((u) => u.banned).length, telegramUsers: real.length,
  });
});
const TYPES = ['link', 'ad', 'channel'];
app.get('/api/admin/tasks', admin, (req, res) => res.json({ list: db.tasks }));
app.post('/api/admin/tasks', admin, (req, res) => {
  const b = req.body || {};
  const num = (x, lo, hi, d) => { const n = Number(x); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const task = {
    id: b.id && db.tasks.some((x) => x.id === b.id) ? b.id : 't_' + crypto.randomBytes(4).toString('hex'),
    type: TYPES.includes(b.type) ? b.type : 'link',
    title: String(b.title || '').trim().slice(0, 60),
    reward: Math.round(num(b.reward, 0, 10000, 0) * 10) / 10,
    url: String(b.url || '').trim().slice(0, 300),
    wait: Math.round(num(b.wait, 0, 300, 8)),
    limit: Math.round(num(b.limit, 1, 1000, 1)),
    once: !!b.once, active: !!b.active,
  };
  if (!task.title) return res.json({ error: 'Nomi kerak' });
  if (task.active && task.type !== 'ad' && !/^(https?:\/\/|@)/.test(task.url)) return res.json({ error: "Havola http(s):// yoki @kanal bilan boshlansin" });
  if (task.active && task.type === 'ad' && task.url && !/^https?:\/\//.test(task.url)) return res.json({ error: 'Reklama havolasi http(s):// bilan boshlansin' });
  if (task.type === 'channel' && !chatOf(task.url)) return res.json({ error: "Kanal havolasi: https://t.me/kanal yoki @kanal" });
  const i = db.tasks.findIndex((x) => x.id === task.id);
  if (i >= 0) db.tasks[i] = task; else db.tasks.push(task);
  save(); res.json({ ok: true, task });
});
app.delete('/api/admin/tasks', admin, (req, res) => {
  db.tasks = db.tasks.filter((x) => x.id !== req.query.id); save(); res.json({ ok: true });
});
app.get('/api/admin/users', admin, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const list = Object.values(db.users).filter((u) => !q || u.id.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    .sort((a, b) => b.created - a.created).slice(0, 50)
    .map((u) => ({ id: u.id, name: u.name, coins: u.coins, games: u.games, wins: u.wins, losses: u.losses, banned: !!u.banned, created: u.created, refBy: u.refBy }));
  res.json({ list, total: Object.keys(db.users).length });
});
app.post('/api/admin/users/coins', admin, (req, res) => {
  const u = db.users[String(req.body.id)], amount = Math.round(Number(req.body.amount) * 10) / 10;
  if (!u || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e6) return res.json({ error: "Noto'g'ri qiymat" });
  if (u.coins + amount < 0) return res.json({ error: 'Balans manfiy bo\'lib qoladi' });
  credit(u, amount, 'admin', String(req.body.note || '').slice(0, 80));
  sendBalance(u); res.json({ ok: true, coins: u.coins });
});
app.post('/api/admin/users/ban', admin, (req, res) => {
  const u = db.users[String(req.body.id)]; if (!u) return res.json({ error: 'topilmadi' });
  u.banned = !!req.body.banned; save();
  if (u.banned) { const s = conns.get(u.id); if (s) for (const w of s) w.close(); }
  res.json({ ok: true, banned: u.banned });
});
app.get('/api/admin/settings', admin, (req, res) => res.json(db.settings));
app.post('/api/admin/settings', admin, (req, res) => {
  const n = (x, d) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 100000 ? Math.round(Number(x) * 10) / 10 : d);
  db.settings.welcomeCoins = n(req.body.welcomeCoins, db.settings.welcomeCoins);
  db.settings.referralReward = n(req.body.referralReward, db.settings.referralReward);
  save(); res.json(db.settings);
});
const bc = { running: false, total: 0, sent: 0, failed: 0 };
app.get('/api/admin/broadcast', admin, (req, res) => res.json(bc));
app.post('/api/admin/broadcast', admin, (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 3500);
  if (!bot) return res.json({ error: 'Bot ulanmagan (BOT_TOKEN yo\'q)' });
  if (!text) return res.json({ error: 'Matn bo\'sh' });
  if (bc.running) return res.json({ error: 'Oldingi yuborish tugamagan' });
  const ids = Object.values(db.users).filter((u) => !String(u.id).startsWith('dev') && !u.banned).map((u) => u.id);
  Object.assign(bc, { running: true, total: ids.length, sent: 0, failed: 0 });
  (async () => {
    for (const id of ids) {
      try { await bot.api.sendMessage(id, text); bc.sent++; } catch { bc.failed++; }
      await new Promise((r) => setTimeout(r, 40)); // ~25 xabar/soniya
    }
    bc.running = false;
  })();
  res.json({ ok: true, total: ids.length });
});
app.get('/api/admin/ledger', admin, (req, res) => {
  const u = String(req.query.u || '');
  res.json({ list: db.ledger.filter((x) => !u || x.u === u).slice(-100).reverse() });
});
// Diagnostika: sirlarni ko'rsatmaydi. https://<sayt>/diag
app.get('/diag', async (req, res) => {
  const d = {
    tokenSet: !!BOT_TOKEN, tokenFormatOk: /^\d{6,}:[\w-]{30,}$/.test(BOT_TOKEN), botState, botUsername: BOT_USERNAME,
    baseUrl: BASE_URL || null, allowDev: ALLOW_DEV, adminPasswordSet: !!process.env.ADMIN_PASSWORD, adminIds: ADMIN_IDS.length, users: Object.keys(db.users).length,
  };
  if (bot) {
    try {
      const w = await bot.api.getWebhookInfo();
      d.webhookSet = !!w.url; d.webhookMatches = w.url === BASE_URL + HOOK; d.pendingUpdates = w.pending_update_count;
      d.lastWebhookError = w.last_error_message || null;
      const me = await bot.api.getMe(); d.tokenBelongsTo = '@' + me.username;
    } catch (e) { d.telegramError = e.message; }
  }
  res.json(d);
});
app.get('/api/admin/orders', admin, (req, res) => {
  const st = String(req.query.status || '');
  const list = db.orders.filter((o) => !st || o.status === st).slice(-200).reverse();
  res.json({ list, spentTotal: db.orders.filter((o) => ['paid', 'done'].includes(o.status)).reduce((a, o) => a + o.price, 0) });
});
app.post('/api/admin/orders/status', admin, (req, res) => {
  const o = db.orders.find((x) => x.id === req.body.id);
  if (!o || o.status !== 'paid' || req.body.status !== 'done') return res.json({ error: "O'zgartirib bo'lmaydi" });
  o.status = 'done'; save();
  notify(o.uid, `✅ Buyurtmangiz bajarildi: ${o.title} (${o.qty} ta)`);
  res.json({ ok: true });
});
app.post('/api/admin/orders/refund', admin, (req, res) => {
  const o = db.orders.find((x) => x.id === req.body.id), u = o && db.users[o.uid];
  if (!o || !u || o.status !== 'paid') return res.json({ error: "Qaytarib bo'lmaydi (allaqachon bajarilgan yoki qaytarilgan)" });
  o.status = 'refunded';
  credit(u, o.price, 'shop_refund', o.id); sendBalance(u);
  notify(o.uid, `↩️ Buyurtma bekor qilindi, ${o.price} tanga qaytarildi: ${o.title}`);
  res.json({ ok: true });
});
app.get('/api/admin/shop', admin, (req, res) => res.json({ list: db.shop }));
app.post('/api/admin/shop', admin, (req, res) => {
  const p = db.shop.find((x) => x.id === req.body.id);
  if (!p) return res.json({ error: 'topilmadi' });
  const n = (x, lo, hi, d) => { const v = Math.round(Number(x)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  p.title = String(req.body.title || p.title).trim().slice(0, 30);
  p.qty = n(req.body.qty, 0, 1e7, p.qty); p.price = n(req.body.price, 0, 1e7, p.price); p.maxPacks = n(req.body.maxPacks, 1, 1000, p.maxPacks);
  p.active = !!req.body.active; p.soon = !!req.body.soon;
  save(); res.json({ ok: true });
});
app.get('/admin', (req, res) => {
  fs.readFile(path.join(__dirname, 'public', 'admin.html'), (e, d) => { res.writeHead(e ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' }); res.end(d); });
});

/* ---------------- Bot (grammY) ---------------- */
let bot = null;
let HOOK = '', botState = BOT_TOKEN ? 'starting' : 'BOT_TOKEN yoq';
function notify(uid, text) {
  if (!bot || String(uid).startsWith('dev')) return;
  bot.api.sendMessage(uid, text).catch(() => {});
}
if (BOT_TOKEN) {
  const { Bot, InlineKeyboard, InputFile, webhookCallback } = require('grammy');
  bot = new Bot(BOT_TOKEN);
  const openKb = (url) => new InlineKeyboard().webApp("🎮 O'ynash", url);
  // Premium (custom) emojilar: .env/Render'da CE_<NOM>=<custom_emoji_id> qo'ying. Berilmasa oddiy emoji ishlatiladi.
  // Eslatma: botlar custom emoji'ni faqat bot egasi Fragment'da qo'shimcha username sotib olgan bo'lsagina yubora oladi.
  const CE = { game: ['🎮', process.env.CE_GAME], coin: ['🪙', process.env.CE_COIN], shop: ['🏪', process.env.CE_SHOP],
    star: ['⭐️', process.env.CE_STAR], gem: ['💎', process.env.CE_GEM], fire: ['🔥', process.env.CE_FIRE], check: ['♟', process.env.CE_CHECK] };
  function rich(tpl) { // {game} kabi belgilarni emoji/custom_emoji'ga almashtiradi
    let text = '', entities = [];
    for (const part of tpl.split(/(\{\w+\})/)) {
      const m = part.match(/^\{(\w+)\}$/);
      if (m && CE[m[1]]) {
        const [fallback, id] = CE[m[1]];
        if (id) entities.push({ type: 'custom_emoji', offset: text.length, length: fallback.length, custom_emoji_id: id });
        text += fallback;
      } else text += part;
    }
    return { text, entities };
  }
  const WELCOME = (name) => rich(
    `{game} Shashka o'ynab tanga yuting, ${name}!\n\n` +
    `{coin} Tangalarni g'alabalar, vazifalar va do'stlarni taklif qilish orqali to'plang.\n\n` +
    `{shop} Do'konda tangalaringizni Instagram va Telegram xizmatlariga almashtirasiz.\nTez orada: {star} Stars | {game} PUBG UC | {gem} FreeFire olmos.\n\n` +
    `{fire} Pastdagi tugmani bosing va o'yinni boshlang!`);
  bot.command('start', async (ctx) => {
    const p = (ctx.match || '').trim();
    const id = String(ctx.from.id);
    let url = BASE_URL;
    if (p.startsWith('ref_') && !db.users[id]) { db.pendingRef[id] = p.slice(4); save(); }
    if (p.startsWith('g_')) url = `${BASE_URL}/?join=${encodeURIComponent(p.slice(2))}`;
    const { text, entities } = WELCOME(ctx.from.first_name);
    const opts = { caption: text, caption_entities: entities, reply_markup: openKb(url) };
    try {
      await ctx.replyWithPhoto(new InputFile(path.join(__dirname, 'public', 'coin.jpg')), opts);
    } catch (e) { // custom emoji yoki rasm xatosi bo'lsa oddiy matn
      console.error('start photo error', e.message);
      const plain = text.replace(/\s+$/, '');
      await ctx.reply(plain, { reply_markup: openKb(url) });
    }
  });
  bot.command('id', (ctx) => ctx.reply(`Sizning Telegram ID: ${ctx.from.id}`));
  bot.command('admin', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return ctx.reply("Bu buyruq faqat adminlar uchun.\nAdmin bo'lish uchun ID'ingizni (/id) egasiga yuboring.");
    await ctx.reply('🛠 Admin panel', { reply_markup: new InlineKeyboard().webApp('Admin panelni ochish', BASE_URL + '/admin') });
  });
  bot.catch((e) => console.error('bot error', e.message));
  const hook = HOOK = '/tg/' + crypto.createHash('sha256').update(BOT_TOKEN).digest('hex').slice(0, 24);
  if (BASE_URL) webhook = { path: hook, fn: webhookCallback(bot, 'http') };
  setTimeout(async () => {
    try {
      const me = await bot.api.getMe();
      if (!BOT_USERNAME) BOT_USERNAME = me.username;
      if (BASE_URL) {
        await bot.api.setWebhook(BASE_URL + hook);
        await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: "O'ynash", web_app: { url: BASE_URL } } });
      } else {
        bot.start();
      }
      await bot.api.setMyCommands([{ command: 'start', description: 'Boshlash' }, { command: 'id', description: 'Mening Telegram ID raqamim' }]);
      botState = 'ok'; console.log('Bot tayyor: @' + BOT_USERNAME);
    } catch (e) { botState = 'XATO: ' + e.message; console.error('bot init error', e.message); }
  }, 500);
}

/* ---------------- O'yin boshqaruvi ---------------- */
const server = http.createServer(onHttp);
const wss = new WebSocketServer({ server, path: '/ws' });
const games = new Map();
const userGame = new Map(); // uid -> game id
const queues = new Map(); // stake -> [uid]
const rooms = new Map(); // code -> {host, stake, t}
let gidSeq = 1;

function send(uid, msg) {
  const s = conns.get(uid);
  if (!s) return;
  const d = JSON.stringify(msg);
  for (const w of s) if (w.readyState === 1) w.send(d);
}
const sendBalance = (u) => send(u.id, { t: 'balance', coins: u.coins });

function stateFor(g, uid) {
  const you = g.players.w === uid ? 'w' : 'b';
  const el = Date.now() - g.turnStart;
  const clocks = { w: g.clock.w, b: g.clock.b };
  clocks[g.turn] = Math.max(0, clocks[g.turn] - el);
  const oppId = you === 'w' ? g.players.b : g.players.w;
  return {
    t: 'state', id: g.id, board: g.board, turn: g.turn, you,
    moves: g.turn === you && !g.over ? g.moves.map((m) => m.path) : [],
    me: pubUser(db.users[uid]), opp: pubUser(oppId === 'bot' ? 'bot' : db.users[oppId]),
    clocks, moveLeft: Math.max(0, MOVE_MS - el), stake: g.stake, win: Math.floor(g.stake * WIN_MULT),
    practice: g.practice, last: g.last || null,
  };
}
function broadcast(g) {
  for (const c of ['w', 'b']) if (g.players[c] !== 'bot') send(g.players[c], stateFor(g, g.players[c]));
}

function createGame(uw, ub, stake, practice) {
  const g = {
    id: gidSeq++, players: { w: uw, b: ub }, stake, practice, board: G.initial(), turn: 'w',
    clock: { w: TOTAL_MS, b: TOTAL_MS }, turnStart: Date.now(), quiet: 0, over: false, moves: [], last: null,
  };
  g.moves = G.legal(g.board, 'w');
  games.set(g.id, g);
  for (const c of ['w', 'b']) if (g.players[c] !== 'bot') userGame.set(g.players[c], g.id);
  broadcast(g);
  return g;
}

function finish(g, winner, reason) {
  if (g.over) return;
  g.over = true;
  const payout = Math.floor(g.stake * WIN_MULT);
  for (const c of ['w', 'b']) {
    const uid = g.players[c];
    if (uid === 'bot') continue;
    const u = db.users[uid];
    let result = 'draw', delta = 0;
    if (winner === null) {
      if (!g.practice) credit(u, g.stake, 'draw_refund', g.id);
      if (!g.practice) { u.games++; u.draws++; }
    } else if (winner === c) {
      result = 'win'; delta = g.practice ? 0 : payout - g.stake;
      if (!g.practice) { credit(u, payout, 'win', g.id); u.games++; u.wins++; }
    } else {
      result = 'lose'; delta = g.practice ? 0 : -g.stake;
      if (!g.practice) { u.games++; u.losses++; }
    }
    save();
    send(uid, stateFor(g, uid));
    send(uid, { t: 'over', result, reason, delta, coins: u.coins, stake: g.stake, practice: g.practice, level: levelOf(u) });
    userGame.delete(uid);
  }
  games.delete(g.id);
}

function advance(g, move) {
  const mover = g.turn;
  const el = Date.now() - g.turnStart;
  g.clock[mover] = Math.max(0, g.clock[mover] - el);
  const info = G.apply(g.board, move);
  g.last = { from: move.path[0], to: move.path[move.path.length - 1] };
  g.quiet = move.captured.length || info.wasMan ? 0 : g.quiet + 1;
  g.turn = mover === 'w' ? 'b' : 'w';
  g.turnStart = Date.now();
  g.moves = G.legal(g.board, g.turn);
  if (!g.moves.length) return finish(g, mover, 'nomoves');
  if (g.quiet >= 30) return finish(g, null, 'draw');
  broadcast(g);
  if (g.players[g.turn] === 'bot') {
    setTimeout(() => {
      if (g.over) return;
      const m = G.aiMove(g.board, g.turn);
      if (m) advance(g, m); else finish(g, mover, 'nomoves');
    }, 600 + Math.random() * 700);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const g of [...games.values()]) {
    if (g.over) continue;
    const el = now - g.turnStart;
    const other = g.turn === 'w' ? 'b' : 'w';
    if (g.players[g.turn] === 'bot') continue;
    if (el >= MOVE_MS) finish(g, other, 'movetimeout');
    else if (g.clock[g.turn] - el <= 0) finish(g, other, 'timeout');
  }
  for (const [code, r] of rooms) if (now - r.t > 10 * 60e3) cancelRoom(code);
}, 1000);

/* --- navbat / xonalar --- */
function hold(u, stake) { credit(u, -stake, 'stake_hold'); sendBalance(u); }
function refund(u, stake) { credit(u, stake, 'stake_refund'); sendBalance(u); }
function busy(uid) {
  if (userGame.has(uid)) return true;
  for (const q of queues.values()) if (q.includes(uid)) return true;
  for (const r of rooms.values()) if (r.host === uid) return true;
  return false;
}
function leaveQueue(uid) {
  for (const [stake, q] of queues) {
    const i = q.indexOf(uid);
    if (i >= 0) { q.splice(i, 1); refund(db.users[uid], stake); return true; }
  }
  return false;
}
function cancelRoom(code) {
  const r = rooms.get(code);
  if (!r) return;
  rooms.delete(code);
  refund(db.users[r.host], r.stake);
  send(r.host, { t: 'invite_cancelled' });
}
function cancelRoomOf(uid) {
  for (const [code, r] of rooms) if (r.host === uid) { cancelRoom(code); return true; }
  return false;
}
function randomColors(a, b) { return Math.random() < 0.5 ? [a, b] : [b, a]; }

function handle(ws, m) {
  if (m.t === 'auth') {
    const v = verifyInit(m.initData);
    if (!v) return ws.send(JSON.stringify({ t: 'auth_fail' }));
    const u = getUser(v.user, v.start);
    if (u.banned) return ws.send(JSON.stringify({ t: 'auth_fail' }));
    ws.uid = u.id;
    if (!conns.has(u.id)) conns.set(u.id, new Set());
    conns.get(u.id).add(ws);
    ws.send(JSON.stringify({ t: 'auth_ok', user: meView(u), online: online() }));
    const gid = userGame.get(u.id);
    if (gid && games.has(gid)) ws.send(JSON.stringify(stateFor(games.get(gid), u.id)));
    return;
  }
  if (!ws.uid) return;
  const uid = ws.uid;
  const u = db.users[uid];
  const err = (msg) => ws.send(JSON.stringify({ t: 'err', msg }));

  switch (m.t) {
    case 'queue': {
      const stake = Number(m.stake);
      if (!STAKES.includes(stake)) return err("Noto'g'ri stavka");
      if (busy(uid)) return err("Siz allaqachon o'yindasiz");
      if (u.coins < stake) return err('Tanga yetarli emas');
      hold(u, stake);
      const q = queues.get(stake) || [];
      queues.set(stake, q);
      const opp = q.shift();
      if (opp && opp !== uid) {
        const [w, b] = randomColors(opp, uid);
        createGame(w, b, stake, false);
      } else {
        q.push(uid);
        ws.send(JSON.stringify({ t: 'queued' }));
      }
      break;
    }
    case 'cancel':
      leaveQueue(uid) || cancelRoomOf(uid);
      ws.send(JSON.stringify({ t: 'cancelled' }));
      break;
    case 'practice': {
      if (busy(uid)) return err("Siz allaqachon o'yindasiz");
      const [w, b] = randomColors(uid, 'bot');
      const g = createGame(w, b, 0, true);
      if (g.players[g.turn] === 'bot') {
        setTimeout(() => { if (!g.over) { const mv = G.aiMove(g.board, g.turn); if (mv) advance(g, mv); } }, 800);
      }
      break;
    }
    case 'invite': {
      const stake = Number(m.stake);
      if (!STAKES.includes(stake)) return err("Noto'g'ri stavka");
      if (busy(uid)) return err("Siz allaqachon o'yindasiz yoki taklif yuborgansiz");
      if (u.coins < stake) return err('Tanga yetarli emas');
      hold(u, stake);
      const code = crypto.randomBytes(4).toString('hex');
      rooms.set(code, { host: uid, stake, t: Date.now() });
      const base = BASE_URL || ws.origin || '';
      const link = BOT_USERNAME && BOT_TOKEN ? `https://t.me/${BOT_USERNAME}?start=g_${code}` : `${base}/?join=${code}`;
      ws.send(JSON.stringify({ t: 'invite', code, stake, link }));
      break;
    }
    case 'join': {
      const r = rooms.get(String(m.code));
      if (!r) return err("Havola eskirgan yoki bekor qilingan");
      if (r.host === uid) return err("O'z havolangizga kira olmaysiz");
      if (busy(uid)) return err("Siz allaqachon o'yindasiz");
      if (u.coins < r.stake) return err(`Bu o'yin uchun ${r.stake} tanga kerak`);
      rooms.delete(String(m.code));
      hold(u, r.stake);
      const [w, b] = randomColors(r.host, uid);
      createGame(w, b, r.stake, false);
      if (!conns.has(r.host)) notify(r.host, "♟ Do'stingiz o'yinga qo'shildi! Poletgram'ni oching.");
      break;
    }
    case 'move': {
      const g = games.get(userGame.get(uid));
      if (!g || g.over) return err("O'yin topilmadi");
      const color = g.players.w === uid ? 'w' : 'b';
      if (g.turn !== color) return err('Sizning navbatingiz emas');
      const key = JSON.stringify(m.path);
      const mv = g.moves.find((x) => JSON.stringify(x.path) === key);
      if (!mv) { ws.send(JSON.stringify(stateFor(g, uid))); return err("Noto'g'ri yurish"); }
      advance(g, mv);
      break;
    }
    case 'resign': {
      const g = games.get(userGame.get(uid));
      if (!g) return;
      const color = g.players.w === uid ? 'w' : 'b';
      finish(g, color === 'w' ? 'b' : 'w', 'resign');
      break;
    }
    case 'emoji': {
      const g = games.get(userGame.get(uid));
      if (!g) return;
      const color = g.players.w === uid ? 'w' : 'b';
      const oppId = g.players[color === 'w' ? 'b' : 'w'];
      if (oppId !== 'bot') send(oppId, { t: 'emoji', e: String(m.e).slice(0, 4) });
      break;
    }
    default:
  }
}

wss.on('connection', (ws, req) => {
  ws.origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    try { handle(ws, m); } catch (e) { console.error('ws error', e); }
  });
  ws.on('close', () => {
    const uid = ws.uid;
    if (!uid) return;
    const s = conns.get(uid);
    if (s) { s.delete(ws); if (!s.size) { conns.delete(uid); leaveQueue(uid); } }
  });
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000);

server.listen(PORT, () => console.log(`Poletgram http://localhost:${PORT}  (dev kirish: ${ALLOW_DEV ? 'yoqilgan' : "o'chiq"})`));
