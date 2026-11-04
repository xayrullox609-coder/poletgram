// Kataklar: nuqtalar va kataklar (5x5 katak). Navbat bilan chiziq tortiladi; katakning 4-tomonini
// yopgan o'yinchi katakni egallaydi va yana yuradi. Ko'p katak egallagan g'olib (25 ta, durang yo'q).
const N = 5;
const initial = () => ({
  h: Array.from({ length: N + 1 }, () => Array(N).fill(0)), // gorizontal chiziqlar [qator 0..N][ustun 0..N-1]
  v: Array.from({ length: N }, () => Array(N + 1).fill(0)), // vertikal chiziqlar [qator 0..N-1][ustun 0..N]
  own: Array.from({ length: N }, () => Array(N).fill(null)), // katak egasi 'w' | 'b'
});
const sides = (s, r, c) => (s.h[r][c] ? 1 : 0) + (s.h[r + 1][c] ? 1 : 0) + (s.v[r][c] ? 1 : 0) + (s.v[r][c + 1] ? 1 : 0);
const boxesOf = (k, r, c) => (k === 'h' ? [[r - 1, c], [r, c]] : [[r, c - 1], [r, c]]).filter(([a, b]) => a >= 0 && a < N && b >= 0 && b < N);
const valid = (s, ln) => Array.isArray(ln) && ln.length === 3 && (ln[0] === 'h' || ln[0] === 'v') && Number.isInteger(ln[1]) && Number.isInteger(ln[2])
  && ln[1] >= 0 && ln[2] >= 0 && (ln[0] === 'h' ? ln[1] <= N && ln[2] < N : ln[1] < N && ln[2] <= N) && !s[ln[0]][ln[1]][ln[2]];
function legal(s) {
  const out = [];
  s.h.forEach((row, r) => row.forEach((x, c) => { if (!x) out.push(['h', r, c]); }));
  s.v.forEach((row, r) => row.forEach((x, c) => { if (!x) out.push(['v', r, c]); }));
  return out;
}
// chiziq tortadi; nechta katak egallanganini qaytaradi (>0 bo'lsa o'yinchi yana yuradi)
function apply(s, color, ln) {
  s[ln[0]][ln[1]][ln[2]] = color === 'w' ? 1 : 2;
  let n = 0;
  for (const [r, c] of boxesOf(ln[0], ln[1], ln[2])) if (!s.own[r][c] && sides(s, r, c) === 4) { s.own[r][c] = color; n++; }
  return n;
}
function score(s) {
  const o = { w: 0, b: 0 };
  s.own.forEach((row) => row.forEach((x) => { if (x) o[x]++; }));
  return o;
}
// Bot: egallash mumkin bo'lsa egallaydi; aks holda raqibga katak "sovg'a qilmaydigan" chiziqni tanlaydi
function aiMove(s) {
  const mv = legal(s); if (!mv.length) return null;
  const adj = (ln) => boxesOf(ln[0], ln[1], ln[2]).map(([r, c]) => sides(s, r, c));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const take = mv.filter((l) => adj(l).includes(3));
  if (take.length) return pick(take);
  const safe = mv.filter((l) => !adj(l).includes(2));
  if (safe.length) return pick(safe);
  let best = [], bs = 99;
  for (const l of mv) { const g = adj(l).filter((x) => x === 2).length; if (g < bs) { bs = g; best = [l]; } else if (g === bs) best.push(l); }
  return pick(best);
}
module.exports = { N, initial, legal, apply, valid, score, aiMove };
