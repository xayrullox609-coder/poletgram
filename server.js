// Poletgram: Telegram Mini App + bot + WebSocket shashka serveri
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const G = require('./game');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '';
let BOT_USERNAME = process.env.BOT_USERNAME || '';
const BASE_URL = (process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
// Brauzerda sinash uchun "dev" kirish. Tokensiz avtomatik yoqiladi; productionda ALLOW_DEV=0 qiling.
const ALLOW_DEV = process.env.ALLOW_DEV ? process.env.ALLOW_DEV === '1' : !BOT_TOKEN;
const SITE_TASK_URL = process.env.SITE_TASK_URL || BASE_URL || 'https://telegram.org';

const START_COINS = 100;
const STAKES = [3, 20, 100, 300, 1000];
const WIN_MULT = 1.8;
const TOTAL_MS = 6 * 60 * 1000;
const MOVE_MS = 60 * 1000;
const DAILY_MAX = 20;

/* ---------------- Ma'lumotlar bazasi (JSON fayl) ---------------- */
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
let db = { users: {}, ledger: [], pendingRef: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch { /* yangi baza */ }
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
      created: Date.now(), refBy: null, tasks: { day: '', site: 0, ads: 0, siteStart: 0 },
    };
    credit(u, START_COINS, 'welcome');
    let refId = '';
    if (startParam && startParam.startsWith('ref_')) refId = startParam.slice(4);
    if (!refId && db.pendingRef[id]) refId = db.pendingRef[id];
    delete db.pendingRef[id];
    if (refId && refId !== id && db.users[refId]) {
      u.refBy = refId;
      credit(db.users[refId], 20, 'referral', id);
      notify(refId, `🎉 Do'stingiz ${name} qo'shildi: +20 tanga!`);
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
    refLink: BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?startapp=ref_${u.id}` : `${BASE_URL || ''}/?ref=${u.id}`,
  };
}

/* ---------------- Telegram initData tekshiruvi ---------------- */
function verifyInit(initData) {
  if (!initData || typeof initData !== 'string') return null;
  if (ALLOW_DEV && initData.startsWith('dev:')) {
    const [, id, ...n] = initData.split(':');
    const clean = String(id).replace(/\W/g, '').slice(0, 20);
    if (!clean) return null;
    return { user: { id: 'dev' + clean, first_name: (n.join(':') || 'Mehmon').slice(0, 24) }, start: '' };
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
    return run(0);
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
  if (!v) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"auth"}'); }
  req.u = getUser(v.user, v.start);
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
  const t = u.tasks;
  if (t.day !== dayKey()) { t.day = dayKey(); t.site = 0; t.ads = 0; t.siteStart = 0; save(); }
  return t;
}
app.get('/api/tasks', auth, (req, res) => {
  const t = taskState(req.u);
  const refCount = Object.values(db.users).filter((x) => x.refBy === req.u.id).length;
  res.json({
    ads: { reward: 1, done: t.ads, max: DAILY_MAX, soon: true },
    site: { reward: 0.5, done: t.site, max: DAILY_MAX },
    ref: { reward: 20, count: refCount, link: meView(req.u).refLink },
  });
});
app.post('/api/tasks/site/start', auth, (req, res) => {
  const t = taskState(req.u);
  if (t.site >= DAILY_MAX) return res.json({ error: 'limit' });
  t.siteStart = Date.now(); save();
  res.json({ url: SITE_TASK_URL, wait: 8 });
});
app.post('/api/tasks/site/claim', auth, (req, res) => {
  const t = taskState(req.u);
  const el = Date.now() - t.siteStart;
  if (!t.siteStart || el < 8000 || el > 10 * 60e3) return res.json({ error: 'wait' });
  if (t.site >= DAILY_MAX) return res.json({ error: 'limit' });
  t.site++; t.siteStart = 0;
  credit(req.u, 0.5, 'task_site');
  res.json({ ok: true, coins: req.u.coins, done: t.site });
});

/* ---------------- Bot (grammY) ---------------- */
let bot = null;
function notify(uid, text) {
  if (!bot || String(uid).startsWith('dev')) return;
  bot.api.sendMessage(uid, text).catch(() => {});
}
if (BOT_TOKEN) {
  const { Bot, InlineKeyboard, webhookCallback } = require('grammy');
  bot = new Bot(BOT_TOKEN);
  const openKb = (url) => new InlineKeyboard().webApp("🎮 O'ynash", url);
  bot.command('start', async (ctx) => {
    const p = (ctx.match || '').trim();
    const id = String(ctx.from.id);
    let url = BASE_URL;
    if (p.startsWith('ref_') && !db.users[id]) { db.pendingRef[id] = p.slice(4); save(); }
    if (p.startsWith('g_')) url = `${BASE_URL}/?join=${encodeURIComponent(p.slice(2))}`;
    await ctx.reply(
      `Poletgram'ga xush kelibsiz, ${ctx.from.first_name}! ♟\nRus shashkasida do'stlaringiz va tasodifiy raqiblar bilan bellashing.`,
      { reply_markup: openKb(url) },
    );
  });
  bot.catch((e) => console.error('bot error', e.message));
  const hook = '/tg/' + crypto.createHash('sha256').update(BOT_TOKEN).digest('hex').slice(0, 24);
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
      await bot.api.setMyCommands([{ command: 'start', description: 'Boshlash' }]);
      console.log('Bot tayyor: @' + BOT_USERNAME);
    } catch (e) { console.error('bot init error', e.message); }
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
      const link = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?startapp=g_${code}` : `${base}/?join=${code}`;
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
