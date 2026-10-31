# Poletgram

Telegram Mini App + bot: rus shashkasi (real vaqt), vazifalar, reyting, do'st bilan o'yin, do'kon ("Tez orada").
Stack: Node.js, `ws` (WebSocket), `grammy` (bot). Ma'lumotlar `data/db.json` faylida.

## 1. Brauzerda sinash (bot kerak emas)
```
npm install
npm start
```
`http://localhost:3000` ni **ikkita tabda** oching (har bir tab alohida o'yinchi) → ikkalasida PLAY → bir xil stavka → o'yin boshlanadi.
Bitta o'zingiz sinash uchun: PLAY → "Bot bilan sinov".
Do'st havolasi: tabda "Do'st bilan" → havola nusxalanadi → boshqa tabda oching.

Testlar: `npm test` (shashka qoidalari), `node e2e.js` (server, ws kerak).

## 2. GitHub + Render
1. GitHub'da yangi repo oching, shu papkani push qiling.
2. render.com → New → **Blueprint** → repo'ni tanlang (`render.yaml` o'qiladi) yoki New → Web Service (Build: `npm install`, Start: `npm start`).
3. Environment:
   - `BOT_TOKEN` — @BotFather'dan
   - `BOT_USERNAME` — botning username'i (@siz)
   - `WEBAPP_URL` — Render manzili, masalan `https://poletgram.onrender.com`
   - `ALLOW_DEV=1` — brauzerdan sinash saytini yoqadi. **Ochiq ishga tushirishdan oldin `0` qiling.**
4. Deploy tugagach: sinov sayti = Render manzili. Bot webhook va menyu tugmasi avtomatik o'rnatiladi.

## 3. BotFather
- `/newbot` → token.
- `/newapp` (yoki `/mybots` → Bot Settings → Configure Mini App) → manzil: Render URL; short name masalan `play` bo'lsa havolalar `t.me/bot?startapp=...` ishlaydi. Short name berilmasa ham, menyu tugmasi orqali ochiladi.

## Eslatmalar
- Render **free** rejada disk doimiy emas: `db.json` har deployda o'chadi va servis uxlaydi. Jiddiy ishga tushirish uchun Render Disk (`DB_FILE=/var/data/db.json`) yoki PostgreSQL qo'shing.
- Balans o'zgarishlari jurnalga (`ledger`) yoziladi, yurishlar faqat serverda tekshiriladi, `initData` imzosi har so'rovda tekshiriladi.
- Hozircha tangalar faqat vazifa/referal/g'alaba bilan topiladi. Depozit, pul yechish va do'kon "Tez orada". Haqiqiy pulga tanga sotish va yutuqni yechish stavka (qimor) hisoblanadi, O'zbekistonda ruxsat etilmagan, shuning uchun kodga qo'shilmagan.
- Reklama vazifasi "Tez orada" (reklama tarmog'i ulanmagan).
