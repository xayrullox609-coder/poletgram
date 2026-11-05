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
   - Premium emojilar (ixtiyoriy): `CE_GAME`, `CE_COIN`, `CE_SHOP`, `CE_STAR`, `CE_GEM`, `CE_FIRE`, `CE_GIFT`, `CE_GREEN`, `CE_RED`, `CE_INF`, `CE_USERS` — har biriga custom emoji ID'sini yozing (ID'ni @idstickerbot yoki emoji'ni @getidsbot'ga yuborib olasiz). Bo'sh qoldirsangiz oddiy emoji chiqadi. Telegram botlarga custom emoji'ni faqat bot egasi Fragment'da qo'shimcha username sotib olgan bo'lsagina ruxsat beradi.
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

## Xotira (ma'lumotlar saqlanishi) — MUHIM

Render bepul tarifida disk har safar qayta ishga tushganda (deploy) tozalanadi. Foydalanuvchilar, tangalar, buyurtmalar yo'qolmasligi uchun PostgreSQL ulang:

1. https://neon.tech (yoki supabase.com) da bepul loyiha oching va **connection string** ni nusxalang (`postgresql://...`).
2. Render → servis → **Environment** → `DATABASE_URL` = o'sha satr → Save.
3. Qayta deploy bo'lgach `https://SAYT/diag` oching: `"storage": "postgres"` va `"storageError": null` bo'lishi kerak.

Eslatmalar:
- Birinchi ishga tushganda eski JSON fayldagi ma'lumotlar avtomatik ko'chiriladi.
- Baza bilan ulanib bo'lmasa, server ataylab to'xtaydi (bo'sh baza bilan ishlab, ma'lumotni ustidan yozib yubormaslik uchun).
- SSL kerak bo'lmasa: `DATABASE_SSL=0`.
- Render'ning o'z bepul Postgres'i 30 kundan keyin o'chadi — Neon/Supabase tavsiya etiladi.

## Boshqa xizmatga ulash (SMM panel)

Telegram botlari bir-biriga xabar yubora olmaydi, shuning uchun buyurtmalar boshqa xizmatning **API**'siga yuboriladi (SMM panellarda "API" bo'limi bor).

1. Panelingizdan API manzili (masalan `https://panel.uz/api/v2`) va API kalitni oling.
2. Render → Environment: `SMM_API_URL` va `SMM_API_KEY` ni qo'ying.
3. `/admin` → Do'kon narxlari → har bir xizmat uchun **Panel ID** (paneldagi service ID) kiriting → Saqlash.

Endi mijoz buyurtma bersa, u avtomatik panelga yuboriladi; har daqiqada holat tekshiriladi: bajarilsa mijozga xabar, bekor bo'lsa tanga qaytariladi. Yuborilmasa adminga xabar keladi va Buyurtmalarda "Panelga qayta yuborish" tugmasi chiqadi. Panel ID kiritilmagan xizmatlar avvalgidek qo'lda bajariladi.

## Promokodlar va kanal

`/admin` → Promokodlar: kod, tanga, limit kiriting. "Kanalga rasm bilan yuborish" belgilangan bo'lsa, promokod yozilgan rasm (kod + necha tanga) `PROMO_CHANNEL` (standart `@poletgram`) kanaliga chiqadi. **Muhim:** botni o'sha kanalga ADMIN qiling (post yuborish huquqi bilan). Rasm uchun `@napi-rs/canvas` ishlatiladi, `npm install` uni o'zi o'rnatadi. Eski kodni qayta yuborish uchun jadvaldagi "Kanalga yuborish" tugmasi bor.

## O'yinlar

Menyuda PLAY tugmasi tepasida o'yin tanlanadi:
- **Shashka** va **Kataklar** (nuqtalar va kataklar, 5x5): 1v1, tasodifiy raqib / do'st havolasi / bot bilan sinov, tikish ×2.
- **Hudud** (real vaqt, ko'p o'yinchi): joystik bilan yuring, o'z hududingizdan chiqib iz qoldiring va qaytib kelib o'rab oling. Boshqa o'yinchining izini kessangiz u yo'qoladi, o'z izingizga tegsangiz o'zingiz.
  - **Tikilgan o'yin (3 / 20 / 100 / 300 / 1000 tanga, Shashkadagi kabi tanlanadi):** 6 kishi to'lsa (yoki kamida 5 kishi 45 soniya kutsa) boshlanadi, botlarsiz. O'lgan yoki uzilgan qayta tug'ilmaydi, stavkasi qaytmaydi. Raund 3:00; 1 kishi qolsa darrov tugaydi.
  - **Mukofot (3 tanga uchun, 6 kishi, bank 18; boshqa stavkada shu nisbatda, qoldiq 1-o'ringa):** 3+ tirik qolsa hudud bo'yicha 1-o'rin 10, 2-o'rin 5, 3-o'rin 3; 2 kishi qolsa 11 / 7; 1 kishi qolsa 18. Qolganlari 0. 5 kishilik o'yinda bank 15: 8/4/3, 9/6, 15. Mukofotlar yig'indisi doim bankka teng.
  - **Bot bilan sinov:** tikilmaydi, botlar bor, o'lgan qayta tug'iladi.
  - Qoidalar va jadval `territory.js` da (`PAYOUT`).

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

## Do'kon (tanga bilan)
Instagram va Telegram xizmatlari tangaga almashtiriladi: foydalanuvchi platformani → xizmatni tanlaydi, nechta kerakligini raqam bilan kiritadi (narx pastda ko'rinadi) va havolani yozadi. Tanga balansdan darhol yechiladi (jurnalga yoziladi), buyurtma admin panel → **Buyurtmalar** bo'limiga tushadi va ADMIN_IDS dagilarga bot xabar yuboradi.
- Buyurtmani **o'zingiz** (yoki xizmat ko'rsatuvchi panel orqali) bajarasiz, so'ng "Bajarildi" bosasiz, mijozga xabar ketadi.
- Bajarib bo'lmasa "Bekor + tangani qaytarish" tangani mijozga qaytaradi.
- Narxlar, paket o'lchami, "Tez orada" holati: admin panel → **Do'kon narxlari**.
- Standart narxlar: IG ko'rish 1000 = 100, IG like 100 = 100, IG obunachi (tez orada); TG ko'rish 1000 = 200, reaksiya 100 = 100, obunachi 10 = 100 tanga.
- Tanga faqat o'yinda g'alaba, vazifa, referal va ro'yxatdan o'tish sovg'asi orqali topiladi. Depozit (pulga tanga sotib olish) va pul yechish yo'q.
- Eslatma: Instagram va Telegram sun'iy ko'rish/like/obunachi xizmatlarini o'z qoidalari bilan cheklaydi; xizmat ko'rsatuvchi tanlashda buni hisobga oling.

Narx paketlar bo'yicha hisoblanadi: masalan like 100 ta = 100 tanga; 130 ta kiritilsa 2 paket = 200 tanga to'lanadi va 200 ta buyurtma qilinadi (to'langan paketlarning to'liq miqdori).
