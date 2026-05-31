# เปิดใช้งาน Supabase (Auth + Cloud + RLS)

ตอนนี้ Janus ทำงานแบบ **เก็บข้อมูลในเบราว์เซอร์ (localStorage)** ได้เต็มรูปแบบโดยไม่ต้องมี backend
ส่วนนี้คือขั้นตอนเปิด Supabase เพื่อให้มี login อีเมล + เก็บข้อมูลบนคลาวด์แบบแยกผู้ใช้ด้วย RLS (brief Phase 1b)

## 1) สร้างโปรเจกต์ + ใส่ env
สร้างโปรเจกต์ฟรีที่ supabase.com แล้วใส่ใน `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server เท่านั้น ห้าม import ฝั่ง client
```

## 2) รัน migration
ใช้ SQL ใน [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — สร้างตาราง
`accounts, transactions, lots, remittances, income_inputs, tax_settings` พร้อม **RLS owner-only ทุกตาราง**

```bash
supabase db push          # หรือวาง SQL ใน SQL editor ของ Supabase
```

## 3) สิ่งที่พร้อมแล้วในโค้ด
- `src/lib/supabase/client.ts` — browser client (`isSupabaseConfigured()` ตรวจ env)
- `src/lib/supabase/server.ts` — server client (cookies/SSR)
- `src/app/login/page.tsx` — หน้า Auth อีเมล (login / signup / ลืมรหัสผ่าน) จะ active เมื่อมี env

## 4) สิ่งที่เหลือเมื่อจะ "ย้ายข้อมูลขึ้นคลาวด์เต็มตัว"
ชั้นข้อมูลถูกแยกผ่าน `src/lib/store/local-store.ts` (interface เดียว) — เพิ่ม implementation ที่อ่าน/เขียน
ผ่าน Supabase แล้วสลับใน hook `useStore` โดยดู `isSupabaseConfigured()` engine คำนวณ (FIFO/ภาษี/metrics)
ไม่ต้องแก้เลยเพราะเป็น pure function ที่แยกจากชั้นเก็บข้อมูลอยู่แล้ว

> ความปลอดภัย: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, และ `TYPHOON_OCR_API_KEY` ใช้ฝั่ง server เท่านั้น
> ทุกตารางมี RLS ผู้ใช้เห็นเฉพาะข้อมูลของตัวเอง
