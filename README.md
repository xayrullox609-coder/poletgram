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
Admin panel: `http://localhost:3000/admin` (sinov rejimida parol: `admin`).
Do'st havolasi: tabda "Do'st bilan" → havola nusxalanadi → boshqa tabda oching.

Testlar: `npm test` (shashka qoidalari), `node e2e.js` (server, ws kerak).

## 2. GitHub + Render
1. GitHub'da yangi repo oching, shu papkani push qiling.
2. render.com → New → **Blueprint** → repo'ni tanlang (`render.yaml` o'qiladi) yoki New → Web Service (Build: `npm install`, Start: `npm start`).
3. Environment:
   - `BOT_TOKEN` — @BotFather'dan
   - `BOT_USERNAME` — `Poletgram_bot` (berilmasa shu ishlatiladi)
   - `ADMIN_PASSWORD` — admin panel paroli (**uzun va noyob qiling**). Qo'yilmasa `/admin` productionda o'chiq turadi
   - `WEBAPP_URL` — Render manzili, masalan `https://poletgram.onrender.com`
   - `ALLOW_DEV=1` — brauzerdan sinash saytini yoqadi. **Ochiq ishga tushirishdan oldin `0` qiling.**
   - Premium emojilar (ixtiyoriy): `CE_GAME`, `CE_COIN`, `CE_SHOP`, `CE_STAR`, `CE_GEM`, `CE_FIRE` — har biriga custom emoji ID'sini yozing (ID'ni @idstickerbot yoki emoji'ni @getidsbot'ga yuborib olasiz). Bo'sh qoldirsangiz oddiy emoji chiqadi. Telegram botlarga custom emoji'ni faqat bot egasi Fragment'da qo'shimcha username sotib olgan bo'lsagina ruxsat beradi.
4. Deploy tugagach: sinov sayti = Render manzili. Bot webhook va menyu tugmasi avtomatik o'rnatiladi.

## 3. BotFather
- `/newbot` → token (bot: @Poletgram_bot).
- Referal va do'st havolalari `t.me/Poletgram_bot?start=...` ko'rinishida, shuning uchun Mini App short name shart emas: bot `/start`da "O'ynash" tugmasini yuboradi.
- Ixtiyoriy: `/mybots` → Bot Settings → Menu Button ham avtomatik o'rnatiladi.

## Eslatmalar
- Render **free** rejada disk doimiy emas: `db.json` har deployda o'chadi va servis uxlaydi. Jiddiy ishga tushirish uchun Render Disk (`DB_FILE=/var/data/db.json`) yoki PostgreSQL qo'shing.
- Balans o'zgarishlari jurnalga (`ledger`) yoziladi, yurishlar faqat serverda tekshiriladi, `initData` imzosi har so'rovda tekshiriladi.
- Hozircha tangalar faqat vazifa/referal/g'alaba bilan topiladi. Depozit, pul yechish va do'kon "Tez orada". Haqiqiy pulga tanga sotish va yutuqni yechish stavka (qimor) hisoblanadi, O'zbekistonda ruxsat etilmagan, shuning uchun kodga qo'shilmagan.
- Reklama vazifasi "Tez orada" (reklama tarmog'i ulanmagan).

## Admin panel (`/admin`)
**Telegram ichida:** botga `/id` yozing → raqamni oling → Render'da `ADMIN_IDS=sizning_id` (bir nechta bo'lsa vergul bilan) → botga `/admin` yozing → "Admin panelni ochish" tugmasi parolsiz ochadi (Telegram imzosi bilan tekshiriladi). Brauzerda esa `ADMIN_PASSWORD` bilan kiriladi.

- **Vazifalar:** reklama, sayt yoki Telegram kanal vazifasi qo'shish/tahrirlash/o'chirish; mukofot, kutish vaqti, kunlik limit, "bir marta" va faol/o'chiq. Kanal vazifasida botni kanalga admin qiling, a'zolik avtomatik tekshiriladi.
- **Foydalanuvchilar:** qidirish, tanga qo'shish/ayirish (jurnalga yoziladi), bloklash.
- **Xabar yuborish:** botdan hammaga xabar.
- **Sozlamalar:** ro'yxatdan o'tish sovg'asi va taklif mukofoti.
- **Statistika:** foydalanuvchilar, onlayn, o'yinlar, takliflar.

G'olib stavkaning 2 baravarini oladi (×2), durangda stavka qaytariladi.

## Bot ishlamasa
`https://<render-manzil>/diag` ni oching (sirlar ko'rsatilmaydi):
- `tokenSet: false` → Render → Environment'da `BOT_TOKEN` yo'q. Qo'shing va Save (qayta deploy bo'ladi).
- `tokenBelongsTo` `@Poletgram_bot` bo'lishi kerak. Boshqa bot bo'lsa, token noto'g'ri.
- `webhookMatches: false` yoki `lastWebhookError` bor → `WEBAPP_URL` ni to'g'ri `https://...onrender.com` qilib qo'ying.
- `botState` "XATO: ..." bo'lsa, matn sababini aytadi (Render → Logs'da ham chiqadi).
- Mini App'da ism/balans bo'sh bo'lsa, odatda token bu botniki emas.

## Do'kon (Telegram Stars)
Instagram va Telegram xizmatlari Stars'ga sotiladi: foydalanuvchi paket sonini va havolani kiritadi, to'lov Telegram ichida (`XTR`, provider token kerak emas). To'lovdan keyin buyurtma admin panel → **Buyurtmalar** bo'limiga tushadi va adminlarga (ADMIN_IDS) bot xabar yuboradi.
- Buyurtmani **o'zingiz** (yoki xizmat ko'rsatuvchi panel orqali) bajarasiz, so'ng "Bajarildi" bosasiz — mijozga xabar ketadi.
- Bajarib bo'lmasa "Bekor + qaytarish" Stars'ni mijozga qaytaradi (`refundStarPayment`).
- Narxlar, paket o'lchami, "Tez orada" holati: admin panel → **Do'kon narxlari**.
- Standart narxlar: IG ko'rish 1000 = 1⭐, IG like 25 = 1⭐, IG obunachi (tez orada); TG ko'rish 1000 = 2⭐, reaksiya 20 = 1⭐, obunachi 10 = 1⭐.
- Eslatma: Instagram va Telegram sun'iy ko'rish/like/obunachi xizmatlarini o'z qoidalari bilan cheklaydi; xizmat ko'rsatuvchi tanlashda buni hisobga oling.
