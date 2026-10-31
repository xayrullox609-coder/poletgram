// Rus shashkasi (8x8) mantig'i. Barcha tekshiruvlar serverda bajariladi.
// Taxta: board[r][c], r=0 tepada. Qora kataklar: (r+c) toq.
// 'w','W' - oq (pastda, yuqoriga yuradi), 'b','B' - qora. Katta harf = damka.

const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const colorOf = (p) => (p ? p.toLowerCase() : null);
const isKing = (p) => p === 'W' || p === 'B';
const promoRow = (color) => (color === 'w' ? 0 : 7);

function initial() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) b[r][c] = 'b';
        else if (r > 4) b[r][c] = 'w';
      }
    }
  }
  return b;
}

const has = (list, r, c) => list.some((s) => s[0] === r && s[1] === c);

// (r,c) dan boshlab urib olish zanjirlarini qaytaradi. Yurayotgan shashka taxtadan olib qo'yilgan.
function captureFrom(b, r, c, king, color, captured) {
  const out = [];
  for (const [dr, dc] of DIRS) {
    let victim = null;
    const landings = [];
    if (!king) {
      const er = r + dr, ec = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
      if (inb(lr, lc) && b[er][ec] && colorOf(b[er][ec]) !== color && !has(captured, er, ec) && b[lr][lc] === null) {
        victim = [er, ec];
        landings.push([lr, lc]);
      }
    } else {
      let rr = r + dr, cc = c + dc;
      while (inb(rr, cc) && b[rr][cc] === null) { rr += dr; cc += dc; }
      if (!inb(rr, cc)) continue;
      if (colorOf(b[rr][cc]) === color || has(captured, rr, cc)) continue;
      victim = [rr, cc];
      let lr = rr + dr, lc = cc + dc;
      while (inb(lr, lc) && b[lr][lc] === null) { landings.push([lr, lc]); lr += dr; lc += dc; }
    }
    if (!victim || !landings.length) continue;
    const cap2 = captured.concat([victim]);
    const cont = [], term = [];
    for (const L of landings) {
      const nk = king || L[0] === promoRow(color);
      const subs = captureFrom(b, L[0], L[1], nk, color, cap2);
      if (subs.length) for (const s of subs) cont.push({ squares: [L, ...s.squares], captured: s.captured });
      else term.push({ squares: [L], captured: cap2 });
    }
    out.push(...(cont.length ? cont : term));
  }
  return out;
}

// Barcha qonuniy yurishlar: [{path:[[r,c],...], captured:[[r,c],...]}]
function legal(board, color) {
  const caps = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || colorOf(p) !== color) continue;
      board[r][c] = null;
      const conts = captureFrom(board, r, c, isKing(p), color, []);
      board[r][c] = p;
      for (const k of conts) caps.push({ path: [[r, c], ...k.squares], captured: k.captured });
    }
  }
  if (caps.length) return caps; // urish majburiy
  const moves = [];
  const fwd = color === 'w' ? -1 : 1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || colorOf(p) !== color) continue;
      if (!isKing(p)) {
        for (const dc of [-1, 1]) {
          const nr = r + fwd, nc = c + dc;
          if (inb(nr, nc) && board[nr][nc] === null) moves.push({ path: [[r, c], [nr, nc]], captured: [] });
        }
      } else {
        for (const [dr, dc] of DIRS) {
          let nr = r + dr, nc = c + dc;
          while (inb(nr, nc) && board[nr][nc] === null) {
            moves.push({ path: [[r, c], [nr, nc]], captured: [] });
            nr += dr; nc += dc;
          }
        }
      }
    }
  }
  return moves;
}

function apply(board, move) {
  const [fr, fc] = move.path[0];
  const [tr, tc] = move.path[move.path.length - 1];
  const p = board[fr][fc];
  const color = colorOf(p);
  const wasMan = !isKing(p);
  for (const [r, c] of move.captured) board[r][c] = null;
  board[fr][fc] = null;
  const promoted = wasMan && move.path.slice(1).some((s) => s[0] === promoRow(color));
  board[tr][tc] = promoted ? p.toUpperCase() : p;
  return { wasMan };
}

const clone = (b) => b.map((r) => r.slice());

function evaluate(board, color) {
  let s = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const sign = colorOf(p) === color ? 1 : -1;
      let v = isKing(p) ? 3.2 : 1;
      if (!isKing(p)) {
        const adv = colorOf(p) === 'w' ? 7 - r : r;
        v += adv * 0.04;
      }
      s += sign * v;
    }
  }
  return s;
}

// Oddiy 2 qatlamli bot (sinov rejimi uchun)
function aiMove(board, color) {
  const moves = legal(board, color);
  if (!moves.length) return null;
  const opp = color === 'w' ? 'b' : 'w';
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const b1 = clone(board);
    apply(b1, m);
    const replies = legal(b1, opp);
    let worst = Infinity;
    if (!replies.length) worst = 100;
    else {
      for (const rep of replies) {
        const b2 = clone(b1);
        apply(b2, rep);
        worst = Math.min(worst, evaluate(b2, color));
      }
    }
    const score = worst + Math.random() * 0.15;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

module.exports = { initial, legal, apply, aiMove, clone, colorOf, isKing };
