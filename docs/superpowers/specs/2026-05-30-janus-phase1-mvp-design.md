# Janus — Phase 1 MVP Design

วันที่: 2026-05-30 · สถานะ: implemented (1a engine + 1b UI บน local store)

แอปเว็บสำหรับนักลงทุนไทยที่เทรดหุ้นสหรัฐฯ ผ่าน Webull Thailand / Dime! —
บันทึกการเทรด คำนวณต้นทุน FIFO และกำไรที่เกิดขึ้นจริง (เตรียมต่อยอดภาษีใน Phase 2)

## ขอบเขต Phase 1
- **ใน scope:** scaffold, money/FIFO engine + tests (§3.5), บันทึก transaction (กรอกมือ),
  Holdings, Dashboard เบื้องต้น, UI dark + disclaimer
- **เลื่อนไปเฟสหลัง:** Tax engine + Remittances (Phase 2), Screenshot vision import (Phase 3),
  Charts + ราคาตลาด + เมตริก (Phase 4), Supabase Auth/DB/RLS (Phase 1b เมื่อมี credentials)

## การตัดสินใจหลัก
1. **Phase 1 ก่อน** (spec/แผนแยกต่อเฟส) — อนุมัติแล้ว
2. **ยังไม่มี cloud credentials** → ทำ core engine (pure TS + decimal.js) ก่อน,
   UI ใช้ **local store (localStorage)** เป็น stand-in โดยวาง interface ให้ swap เป็น Supabase ภายหลัง
3. **Approach A (source of truth = transactions):** `lots` + realized gain เป็นค่า *derived*
   จากการ replay transactions ผ่าน pure FIFO engine ทุกครั้งที่ add/edit/delete →
   ไม่มี drift, audit ได้, รองรับ edit/delete ปลอดภัย

## สถาปัตยกรรม
```
src/lib/money/decimal.ts      decimal.js config + D(), rounding (precision 40, ห้าม float)
src/lib/engine/normalize.ts   §4.3: buy/sell → {gross, feesNet, net, costPerShare}
src/lib/engine/fifo.ts        pure replay → {lots[], sales[] (realized gain ต่อการขาย)}
src/lib/engine/__tests__/     Vitest acceptance (§3.5) + edge cases
src/lib/store/                local-store (localStorage) = repository interface สำหรับ Supabase ภายหลัง
src/lib/portfolio/portfolio.ts group ตาม account+ticker → holdings + realized gain
src/app/(page,holdings,transactions,transactions/new)  UI (client, dark, shadcn-style primitives)
```

## กฎ Normalization (correctness core — §4.3)
- `gross` = stockValue ถ้ามี (Dime รายงานคลาดจาก qty×price เพราะเศษหุ้น) มิฉะนั้น qty×price
- `feesNet` = fees − couponsWaived
- buy: `net = gross + feesNet` (ต้นทุนรวม), `costPerShare = net / qty` (full precision, ห้าม round ก่อน)
- sell: `net = gross − feesNet` (เงินรับสุทธิ)
- FIFO: ขายกิน lot เก่าสุดในบัญชีเดียวกันก่อน; `realizedGain = net − Σ(costPerShare × qty consumed)`

## Acceptance tests (§3.5) — ผ่าน 8/8
- ASTS buy: cost/share ≈ 73.4787, total 2721.91
- ASTS sell 19 (FIFO): realized gain ≈ 1053.16 (±0.01)
- RDW buy: total 181.15 (ใช้ stockValue ของโบรก)
- EOSE sell: net 1426.91 (คูปอง waive คอม)
- edge: oldest-lot-first, ordering by time, ขายเกินถือ → error, เศษหุ้น

## Guardrails
decimal.js ทุกการคำนวณ · disclaimer ถาวร footer · zod validate · ยืนยันก่อนบันทึก (preview ใน Add Transaction)

## Out-of-scope หมายเหตุ
ราคาตลาด/unrealized, ภาษี, remittance, vision import, Supabase + RLS — อยู่ในเฟสถัดไป
