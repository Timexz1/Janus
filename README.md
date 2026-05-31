<div align="center">

# 🪙 Janus

**โปรแกรมบันทึกการเทรดหุ้นสหรัฐฯ + คำนวณภาษีเงินได้บุคคลธรรมดาแบบเรียลไทม์สำหรับนักลงทุนไทย**

ออกแบบสำหรับผู้ลงทุนผ่าน Webull Thailand / Dime! — บันทึกการซื้อขายจากสกรีนช็อต, คำนวณภาษีตามกฎ
*"เงินได้จากต่างประเทศเสียภาษีเมื่อนำเข้าไทย"* (ป.161/162), และดูกราฟราคาจริงพร้อมสถานะพอร์ต

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-RLS-3ECF8E?logo=supabase&logoColor=white)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)

</div>

---

## ✨ สิ่งที่ Janus ทำได้

| ฟีเจอร์ | รายละเอียด |
|--------|-----------|
| 📒 **บันทึกการเทรด (FIFO)** | บันทึกซื้อ/ขาย คำนวณต้นทุนแบบ FIFO และกำไรที่เกิดขึ้นจริง (realized) อัตโนมัติจากการ replay รายการ |
| 🧾 **ภาษีเรียลไทม์ (ป.161/162)** | คำนวณภาษีเงินได้แบบขั้นบันได เก็บภาษีเฉพาะ**กำไรที่นำกลับเข้าไทย** เลือกวิธีจับคู่กำไรได้ (gain-first / pro-rata / principal-first) |
| 💸 **บันทึกการโอนเข้า/ออก** | แยกเงินต้น (โอนออกไปลงทุน) ออกจากกำไร (โอนกลับเข้าไทย) เพื่อคิดฐานภาษีให้ถูกต้อง |
| 📈 **กราฟราคาจริง** | แท่งเทียนรายวันจาก Yahoo Finance พร้อมจุดซื้อ/ขายของคุณและเส้นต้นทุนเฉลี่ย |
| 📊 **สถานะพอร์ต** | กำไร/ขาดทุนที่ยังไม่เกิด (unrealized), มูลค่าตลาด, เมตริกขั้นสูง (XIRR, win rate, สัดส่วนพอร์ต) |
| 🖼️ **OCR อ่านสกรีนช็อต** | อ่านใบคำสั่งซื้อขายจากรูปอัตโนมัติด้วย Claude / Gemini / Typhoon — แสดง token + ค่าใช้จ่ายเป็นบาทต่อรูป |
| ☁️ **Auth + Cloud Sync** | ล็อกอินอีเมล (Supabase) ข้อมูลซิงก์ขึ้นคลาวด์ต่อผู้ใช้ ป้องกันด้วย Row-Level Security |
| 🌗 **ธีม + ภาษา** | สลับ Light/Dark และไทย/อังกฤษ |

---

## 🏛️ สถาปัตยกรรม (Engine-First)

หัวใจของแอปคือ **calculation engine ที่เป็น pure function** แยกขาดจากชั้น UI และชั้นเก็บข้อมูล —
ทำให้ทุกสูตรคำนวณภาษี/ต้นทุนทดสอบได้ และความถูกต้องตรวจสอบได้

- **เงินทุกบาท/หุ้นทุกตัวใช้ [`decimal.js`](https://github.com/MikeMcl/decimal.js)** ไม่ใช้ floating-point — กันปัญหาปัดเศษในงานการเงิน
- **Transactions = source of truth** — สถานะ lot / กำไร realized คำนวณจากการ replay รายการ (Approach A)
- **localStorage = cache แบบ sync · Supabase = แหล่งข้อมูลจริง** (write-through mirror + hydrate ตอนล็อกอิน)
- **ภาษีแยกตามทิศทางการโอน** — เฉพาะขาเข้าไทยเท่านั้นที่เข้าฐานภาษี

```
src/lib/
├── engine/      # normalize trade, FIFO replay (pure)
├── tax/         # brackets, remittance gain-matching (pure)
├── portfolio/   # holdings, realized/unrealized (pure)
├── metrics/     # XIRR, win rate, allocation (pure)
├── ocr/         # provider routing + pricing
├── prices/      # Yahoo Finance candles
└── store/       # local cache + Supabase cloud sync
```

---

## 🚀 เริ่มต้นใช้งาน

### สิ่งที่ต้องมี
- Node.js 20+
- [Docker](https://www.docker.com/) (สำหรับ Supabase แบบ local) — หรือใช้ Supabase cloud ก็ได้

### ติดตั้งและรัน

```bash
# 1) ติดตั้ง dependencies
npm install

# 2) เปิด Supabase แบบ local (ครั้งแรกจะ pull image + รัน migration ให้)
npx supabase start

# 3) ตั้งค่า environment
cp .env.local.example .env.local
#   ใส่ค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY
#   จากผลลัพธ์ของ `npx supabase status`

# 4) รัน dev server
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) → สมัคร/ล็อกอินด้วยอีเมล แล้วเริ่มบันทึกรายการได้เลย

> 📄 รายละเอียดการตั้งค่า Supabase และการย้ายขึ้นคลาวด์เต็มตัว ดูที่ [`SUPABASE.md`](SUPABASE.md)

---

## 🔐 ความปลอดภัย

- **Row-Level Security ทุกตาราง** — ผู้ใช้เห็นและแก้ไขได้เฉพาะข้อมูลของตัวเอง (`auth.uid() = user_id`)
- **API key ของ OCR ไม่ขึ้นคลาวด์** — เก็บใน browser เครื่องนั้นเท่านั้น และยิงผ่าน server ของแอป (ไม่ยิงตรงจากหน้าเว็บ)
- **Key ฝั่ง server มาก่อนเสมอ** — ตั้ง `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `TYPHOON_OCR_API_KEY` ฝั่ง server สำหรับโปรดักชัน
- ไฟล์ `.env*` ถูก gitignore ไว้ — ไม่มี secret หลุดขึ้น repo

---

## 🧪 การทดสอบ

ทุกฟังก์ชันคำนวณหลัก (engine, ภาษี, FIFO, metrics, OCR parser, dedupe) ครอบคลุมด้วย unit test

```bash
npm test          # รันทั้งหมดครั้งเดียว
npm run test:watch
```

---

## 🛠️ Tech Stack

**Frontend** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
**คำนวณ** decimal.js · Zod · React Hook Form
**กราฟ** lightweight-charts · Recharts
**ข้อมูล** Supabase (Postgres + Auth + RLS) · localStorage
**OCR** Anthropic Claude · Google Gemini · Typhoon OCR
**ทดสอบ** Vitest · Playwright

---

## ⚠️ ข้อจำกัดความรับผิดชอบ

Janus เป็นเครื่องมือช่วยบันทึกและประมาณการเท่านั้น **ไม่ใช่คำแนะนำด้านภาษี การลงทุน หรือกฎหมาย**
ตัวเลขภาษีเป็นการประมาณการตามข้อมูลที่กรอก โปรดตรวจสอบกับผู้เชี่ยวชาญด้านภาษีก่อนยื่นจริงเสมอ
