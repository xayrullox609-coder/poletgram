// Promokod rasmi (PNG): fon + promokod + necha tanga berishi. @napi-rs/canvas kerak.
const path = require('path');
let C = null;
function lib() {
  if (C) return C;
  C = require('@napi-rs/canvas');
  C.GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Inter-ExtraBold.otf'), 'PGBold');
  C.GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Inter-SemiBold.otf'), 'PGSemi');
  return C;
}
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

async function promoImage(code, coins) {
  const { createCanvas, loadImage } = lib();
  const W = 1080, H = 1080, cv = createCanvas(W, H), g = cv.getContext('2d');
  const bg = await loadImage(path.join(__dirname, 'public', 'bg.jpg'));
  const s = Math.max(W / bg.width, H / bg.height); // cover
  g.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) * 0.35, bg.width * s, bg.height * s);
  g.fillStyle = 'rgba(10,6,40,.55)'; g.fillRect(0, 0, W, H);
  // shisha karta
  rr(g, 90, 190, 900, 700, 56); g.fillStyle = 'rgba(20,12,70,.72)'; g.fill();
  g.lineWidth = 5; const bd = g.createLinearGradient(90, 190, 990, 890); bd.addColorStop(0, '#f6d77a'); bd.addColorStop(.5, '#8f7dff'); bd.addColorStop(1, '#2fd0ff'); g.strokeStyle = bd; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#f0cf7a'; g.font = '700 46px PGBold'; g.fillText('P R O M O K O D', W / 2, 295);
  // kod
  let fs = 150; g.font = `${fs}px PGBold`;
  while (g.measureText(code).width > 780 && fs > 50) { fs -= 6; g.font = `${fs}px PGBold`; }
  g.shadowColor = '#7a5cff'; g.shadowBlur = 40; g.fillStyle = '#ffffff'; g.fillText(code, W / 2, 490); g.shadowBlur = 0;
  // chiziq
  g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(240, 545, 600, 3);
  // tanga soni + tanga belgisi
  const txt = '+' + coins.toLocaleString('en-US').replace(/,/g, ' ');
  g.font = '130px PGBold'; const tw = g.measureText(txt).width, cr = 62, gap = 30, total = tw + gap + cr * 2, x0 = (W - total) / 2;
  g.textAlign = 'left'; g.fillStyle = '#f6d77a'; g.shadowColor = '#c9993a'; g.shadowBlur = 30; g.fillText(txt, x0, 735); g.shadowBlur = 0;
  const cx = x0 + tw + gap + cr, cy = 735 - 46;
  const cg = g.createRadialGradient(cx - 18, cy - 20, 8, cx, cy, cr); cg.addColorStop(0, '#fff2b0'); cg.addColorStop(.6, '#f0b93a'); cg.addColorStop(1, '#a8741a');
  g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.fillStyle = cg; g.fill(); g.lineWidth = 6; g.strokeStyle = '#7a4f10'; g.stroke();
  g.beginPath(); g.arc(cx, cy, cr - 14, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = 'rgba(122,79,16,.7)'; g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#7a4f10'; g.font = '56px PGBold'; g.fillText('P', cx, cy + 20);
  g.textAlign = 'center'; g.fillStyle = '#e4e0ff'; g.font = '48px PGSemi'; g.fillText('tanga beradi', W / 2, 825);
  g.fillStyle = '#ffffffcc'; g.font = '40px PGSemi'; g.fillText('Poletgram botida  ·  Promokod bo\'limi', W / 2, 975);
  return cv.toBuffer('image/png');
}
module.exports = { promoImage };
