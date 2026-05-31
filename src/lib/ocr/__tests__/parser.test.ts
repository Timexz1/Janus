import { describe, it, expect } from "vitest";
import { Decimal } from "@/lib/money/decimal";
import { parseOcrResponse, parseOcrText } from "@/lib/ocr/parser";

const eq = (actual: string | null, expected: string) => {
  expect(actual, `got ${actual}, expected ${expected}`).not.toBeNull();
  expect(new Decimal(actual as string).eq(expected)).toBe(true);
};

// Text approximating Typhoon-OCR Markdown output for each real screenshot (§3.5).
const WEBULL_ASTS_BUY = `
ASTS
Ast Spacemobile Inc
Filled
คำสั่ง ซื้อ
จำนวนเงินที่สมัคร US$2,719.00
จำนวนที่จับคู่แล้ว US$2,719.00
จำนวนที่จับคู่แล้ว 37.04352
ราคาเฉลี่ย US$73.400135
คำสั่งถูกจับคู่สำเร็จ 08/05/2026 14:33:52 EDT
ประเภทคำสั่ง มาร์เก็ต
วันและเวลาที่ส่งคำสั่ง 08/05/2026 14:33:52 EDT
บัญชี Webull Thailand(CTH4675306)
ค่าธรรมเนียมการทำรายการ US$2.91
`;

const WEBULL_ASTS_SELL = `
ASTS
Ast Spacemobile Inc
Filled
คำสั่ง ขาย
จำนวนทั้งหมด 19
จำนวนที่จับคู่แล้ว 19
ราคาเฉลี่ย US$129.0501
คำสั่งถูกจับคู่สำเร็จ 27/05/2026 14:16:56 EDT
ประเภทคำสั่ง มาร์เก็ต
วันและเวลาที่ส่งคำสั่ง 27/05/2026 14:16:56 EDT
บัญชี Webull Thailand(CTH4675306)
ค่าธรรมเนียมการทำรายการ US$2.69
`;

const WEBULL_RKLB_BUY_LIMIT = `
RKLB
Rocket Lab Usa Inc
Filled
คำสั่ง ซื้อ
จำนวนทั้งหมด 5
จำนวนที่จับคู่แล้ว 5
ราคาเฉลี่ย US$76.10
คำสั่งถูกจับคู่สำเร็จ 02/02/2026 12:15:27 EST
ประเภทคำสั่ง กำหนดราคา
ราคาลิมิต US$76.10
เวลาที่คำสั่งมีผล ภายในวันส่งคำสั่ง
ช่วงเวลาการเทรด เวลาทำการปกติ + ก่อน/หลัง 4 ชั่วโมง
วันและเวลาที่ส่งคำสั่ง 02/02/2026 12:15:04 EST
บัญชี Webull Thailand(CTH4675306)
ค่าธรรมเนียมการทำรายการ US$0.41
`;

const WEBULL_RKLB_BUY_LIMIT_AVG_DIFFERS = `
RKLB
Rocket Lab Usa Inc
Filled
คำสั่ง ซื้อ
จำนวนทั้งหมด 10
จำนวนที่จับคู่แล้ว 10
ราคาเฉลี่ย US$76.97
คำสั่งถูกจับคู่สำเร็จ 03/02/2026 09:54:56 EST
ประเภทคำสั่ง กำหนดราคา
ราคาลิมิต US$77.00
เวลาที่คำสั่งมีผล ภายในวันส่งคำสั่ง
ช่วงเวลาการเทรด เวลาทำการปกติ + ก่อน/หลัง 4 ชั่วโมง
วันและเวลาที่ส่งคำสั่ง 03/02/2026 09:54:36 EST
บัญชี Webull Thailand(CTH4675306)
ค่าธรรมเนียมการทำรายการ US$0.82
`;

const WEBULL_ASTS_SELL_LIMIT = `
ASTS
Ast Spacemobile Inc
Filled
คำสั่ง ขาย
จำนวนทั้งหมด 16.85569
จำนวนที่จับคู่แล้ว 16.85569
ราคาเฉลี่ย US$122.89
คำสั่งถูกจับคู่สำเร็จ 28/01/2026 15:14:20 EST
ประเภทคำสั่ง กำหนดราคา
ราคาลิมิต US$122.89
เวลาที่คำสั่งมีผล ภายในวันส่งคำสั่ง
ช่วงเวลาการเทรด เฉพาะเวลาทำการปกติ
วันและเวลาที่ส่งคำสั่ง 28/01/2026 15:13:53 EST
บัญชี Webull Thailand(CTH4675306)
ค่าธรรมเนียมการทำรายการ US$2.22
`;

const DIME_RDW_BUY = `
ซื้อ RDW   NYSE
181.15 USD
ใช้ราคาตลาด (Market)
ราคาที่ได้จริง 10.89 USD
จำนวนหุ้น 16.5977167
มูลค่าหุ้น 180.86 USD
ค่าคอมมิชชัน 0.27 USD
ภาษีมูลค่าเพิ่ม 7% (VAT) 0.02 USD
ประเภทคำสั่ง ราคาตลาด (Market)
วันที่ส่งคำสั่ง 8 ต.ค. 68 - 01:38 น.
วันที่คำสั่งสำเร็จ 8 ต.ค. 68 - 01:38 น.
บัญชีชำระเงิน Dime! USD
`;

const DIME_RDW_SIDE_BY_SIDE = `
รายละเอียดคำสั่ง
สถานะ (ณ 8 ต.ค. 68 - 01:24 น.)
จับคู่แล้ว
ซื้อ RDW   NYSE
960.00 USD
ใช้ราคาตลาด (Market)
ราคาที่ได้จริง จำนวนหุ้น
10.94 USD 87.7504410
มูลค่าหุ้น 960.00 USD
ค่าคอมมิชชัน 1.44 USD
คูปองส่วนลด
แทนคำขอโทษ -1.44 USD
ภาษีมูลค่าเพิ่ม 7% (VAT) 0.00 USD
วันที่ส่งคำสั่ง 8 ต.ค. 68 - 01:24 น.
วันที่คำสั่งสำเร็จ 8 ต.ค. 68 - 01:24 น.
`;

const DIME_PLTR_SIDE_BY_SIDE = `
รายละเอียดคำสั่ง
สถานะ (ณ 30 ม.ค. 69 - 21:59 น.)
จับคู่แล้ว
ซื้อ PLTR   NASDAQ
400.00 USD
ใช้ราคาตลาด (Market)
ราคาที่ได้จริง จำนวนหุ้น
147.52 USD 2.7071583
มูลค่าหุ้น 399.36 USD
ค่าคอมมิชชัน 0.60 USD
ภาษีมูลค่าเพิ่ม 7% (VAT) 0.04 USD
ประเภทคำสั่ง ราคาตลาด (Market)
วันที่ส่งคำสั่ง 30 ม.ค. 69 - 21:59 น.
วันที่คำสั่งสำเร็จ 30 ม.ค. 69 - 21:59 น.
บัญชีชำระเงิน Dime! USD
`;

const DIME_IREN_SIDE_BY_SIDE = `
รายละเอียดคำสั่ง
สถานะ (ณ 30 ม.ค. 69 - 22:09 น.)
จับคู่แล้ว
ซื้อ IREN   NASDAQ
400.00 USD
ใช้ราคาตลาด (Market)
ราคาที่ได้จริง จำนวนหุ้น
55.73 USD 7.1649186
มูลค่าหุ้น 399.36 USD
ค่าคอมมิชชัน 0.60 USD
ภาษีมูลค่าเพิ่ม 7% (VAT) 0.04 USD
ประเภทคำสั่ง ราคาตลาด (Market)
วันที่ส่งคำสั่ง 30 ม.ค. 69 - 22:09 น.
วันที่คำสั่งสำเร็จ 30 ม.ค. 69 - 22:09 น.
บัญชีชำระเงิน Dime! USD
`;

const DIME_EOSE_SELL = `
ขาย EOSE   NASDAQ
75.1806439 หุ้น
ราคา ใช้ราคาตลาด (Market)
ราคาที่ได้จริง 18.98 USD
ยอดที่จะได้รับคืน 1,426.91 USD
มูลค่าหุ้น 1,426.93 USD
ค่าคอมมิชชัน -2.14 USD
คูปองส่วนลด
รายการฟรีของเดือน 2.14 USD
ภาษีมูลค่าเพิ่ม 7% (VAT) 0.00 USD
ค่าธรรมเนียมตลาดหลักทรัพย์ 0.00 USD
ค่าธรรมเนียมการขาย (TAF Fee) -0.02 USD
สถานะ 12 พ.ย. 68 - 18:19 น.
`;

describe("parseOcrText — Webull profile", () => {
  it("ASTS buy", () => {
    const p = parseOcrText(WEBULL_ASTS_BUY);
    expect(p.broker).toBe("Webull");
    expect(p.accountId).toBe("acc_webull");
    expect(p.side).toBe("buy");
    expect(p.ticker).toBe("ASTS");
    eq(p.qty, "37.04352");
    eq(p.price, "73.400135");
    eq(p.stockValue, "2719.00");
    eq(p.fees, "2.91");
    expect(p.couponsWaived).toBeNull();
    expect(p.executedAt).toMatch(/^2026-05-08T18:33:52/);
  });

  it("ASTS sell", () => {
    const p = parseOcrText(WEBULL_ASTS_SELL);
    expect(p.broker).toBe("Webull");
    expect(p.side).toBe("sell");
    expect(p.ticker).toBe("ASTS");
    eq(p.qty, "19");
    eq(p.price, "129.0501");
    eq(p.fees, "2.69");
    expect(p.executedAt).toMatch(/^2026-05-27T18:16:56/);
  });

  it("RKLB buy limit order uses average price, not limit price", () => {
    const p = parseOcrText(WEBULL_RKLB_BUY_LIMIT_AVG_DIFFERS);
    expect(p.broker).toBe("Webull");
    expect(p.side).toBe("buy");
    expect(p.ticker).toBe("RKLB");
    eq(p.qty, "10");
    eq(p.price, "76.97");
    eq(p.fees, "0.82");
    expect(p.stockValue).toBeNull();
    expect(p.executedAt).toMatch(/^2026-02-03T14:54:56/);
  });

  it("RKLB buy limit order", () => {
    const p = parseOcrText(WEBULL_RKLB_BUY_LIMIT);
    expect(p.broker).toBe("Webull");
    expect(p.side).toBe("buy");
    expect(p.ticker).toBe("RKLB");
    eq(p.qty, "5");
    eq(p.price, "76.10");
    eq(p.fees, "0.41");
    expect(p.stockValue).toBeNull();
    expect(p.executedAt).toMatch(/^2026-02-02T17:15:27/);
  });

  it("ASTS sell limit order with fractional shares", () => {
    const p = parseOcrText(WEBULL_ASTS_SELL_LIMIT);
    expect(p.broker).toBe("Webull");
    expect(p.side).toBe("sell");
    expect(p.ticker).toBe("ASTS");
    eq(p.qty, "16.85569");
    eq(p.price, "122.89");
    eq(p.fees, "2.22");
    expect(p.executedAt).toMatch(/^2026-01-28T20:14:20/);
  });
});

describe("parseOcrText — Dime profile", () => {
  it("RDW buy (fees = commission + VAT)", () => {
    const p = parseOcrText(DIME_RDW_BUY);
    expect(p.broker).toBe("Dime");
    expect(p.accountId).toBe("acc_dime");
    expect(p.side).toBe("buy");
    expect(p.ticker).toBe("RDW");
    expect(p.exchange).toBe("NYSE");
    eq(p.qty, "16.5977167");
    eq(p.price, "10.89");
    eq(p.stockValue, "180.86");
    eq(p.fees, "0.29"); // 0.27 + 0.02
    expect(p.couponsWaived).toBeNull();
    expect(p.executedAt).toMatch(/^2025-10-07/);
  });

  it("RDW buy with side-by-side price and quantity columns", () => {
    const p = parseOcrText(DIME_RDW_SIDE_BY_SIDE);
    expect(p.broker).toBe("Dime");
    expect(p.side).toBe("buy");
    expect(p.ticker).toBe("RDW");
    expect(p.exchange).toBe("NYSE");
    eq(p.qty, "87.7504410");
    eq(p.price, "10.94");
    eq(p.stockValue, "960.00");
    eq(p.fees, "1.44");
    eq(p.couponsWaived, "1.44");
    expect(p.executedAt).toMatch(/^2025-10-07/);
  });

  it("PLTR buy with side-by-side price and quantity columns", () => {
    const p = parseOcrText(DIME_PLTR_SIDE_BY_SIDE);
    expect(p.broker).toBe("Dime");
    expect(p.side).toBe("buy");
    expect(p.ticker).toBe("PLTR");
    expect(p.exchange).toBe("NASDAQ");
    eq(p.qty, "2.7071583");
    eq(p.price, "147.52");
    eq(p.stockValue, "399.36");
    eq(p.fees, "0.64");
    expect(p.couponsWaived).toBeNull();
    expect(p.executedAt).toMatch(/^2026-01-30/);
  });

  it("IREN buy with side-by-side price and quantity columns", () => {
    const p = parseOcrText(DIME_IREN_SIDE_BY_SIDE);
    expect(p.broker).toBe("Dime");
    expect(p.side).toBe("buy");
    expect(p.ticker).toBe("IREN");
    expect(p.exchange).toBe("NASDAQ");
    eq(p.qty, "7.1649186");
    eq(p.price, "55.73");
    eq(p.stockValue, "399.36");
    eq(p.fees, "0.64");
    expect(p.couponsWaived).toBeNull();
    expect(p.executedAt).toMatch(/^2026-01-30/);
  });

  it("EOSE sell (fees abs = commission + VAT + TAF; coupon waives)", () => {
    const p = parseOcrText(DIME_EOSE_SELL);
    expect(p.broker).toBe("Dime");
    expect(p.side).toBe("sell");
    expect(p.ticker).toBe("EOSE");
    expect(p.exchange).toBe("NASDAQ");
    eq(p.qty, "75.1806439");
    eq(p.price, "18.98");
    eq(p.stockValue, "1426.93");
    eq(p.fees, "2.16"); // |−2.14| + 0.00 + |−0.02|
    eq(p.couponsWaived, "2.14");
    expect(p.executedAt).toMatch(/^2025-11-12/);
  });
});

describe("parseOcrResponse — structured model output", () => {
  it("uses JSON fields over fallback text when available", () => {
    const p = parseOcrResponse(JSON.stringify({
      rawText: DIME_RDW_BUY,
      parsed: {
        broker: "Dime",
        accountId: "acc_dime",
        side: "buy",
        ticker: "RDW",
        exchange: "NYSE",
        qty: "87.7513711",
        price: "10.94",
        stockValue: "960.00",
        fees: "1.44",
        couponsWaived: "0",
        executedAt: null,
        executedTz: null,
      },
    }));

    expect(p.broker).toBe("Dime");
    expect(p.side).toBe("buy");
    expect(p.ticker).toBe("RDW");
    eq(p.qty, "87.7513711");
    eq(p.price, "10.94");
    eq(p.stockValue, "960.00");
    eq(p.fees, "1.44");
    expect(p.executedAt).toMatch(/^2025-10-07/);
  });

  it("never trusts a broker account NUMBER as accountId (FK-safety)", () => {
    // The model sometimes returns the Webull account number ("CTH4675306") in the
    // accountId field; that would break the transactions→accounts foreign key.
    const p = parseOcrResponse(JSON.stringify({
      rawText: "",
      parsed: {
        broker: "Webull",
        accountId: "CTH4675306",
        side: "buy",
        ticker: "ASTS",
        exchange: "NASDAQ",
        qty: "16.85569",
        price: "64.0733",
        stockValue: "1080.00",
      },
    }));
    expect(p.accountId).toBe("acc_webull");
  });

  it("derives accountId from the broker when the model omits it", () => {
    const p = parseOcrResponse(JSON.stringify({
      rawText: "",
      parsed: { broker: "Dime", side: "buy", ticker: "RDW", qty: "10", price: "5" },
    }));
    expect(p.accountId).toBe("acc_dime");
  });

  it("keeps a valid acc_* accountId as-is", () => {
    const p = parseOcrResponse(JSON.stringify({
      rawText: "",
      parsed: { broker: "Webull", accountId: "acc_webull", side: "buy", ticker: "ASTS", qty: "1", price: "1" },
    }));
    expect(p.accountId).toBe("acc_webull");
  });

  it("captures THB funding and derives USD fee deterministically (Dime! Fast)", () => {
    // The QQQ slip: ฿2,000.28 paid @ 33.80, price 523.93 USD, 0.1127809 shares.
    const p = parseOcrResponse(JSON.stringify({
      rawText: "",
      parsed: {
        broker: "Dime", accountId: "acc_dime", side: "buy", ticker: "QQQ", exchange: "NASDAQ",
        qty: "0.1127809", price: "523.93", stockValue: null,
        fees: "3.04", fxRate: "33.80", thbTotal: "2000.28",
      },
    }));
    eq(p.fxRate, "33.80");
    eq(p.thbCost, "2000.28");
    // fees(USD) = 2000.28/33.80 − 0.1127809×523.93 ≈ 0.09 (NOT the raw ฿3.04)
    expect(p.fees).not.toBeNull();
    const feesUsd = Number(p.fees);
    expect(feesUsd).toBeGreaterThan(0.05);
    expect(feesUsd).toBeLessThan(0.15);
  });

  it("leaves fxRate/thbCost null for USD-funded trades", () => {
    const p = parseOcrResponse(JSON.stringify({
      rawText: "",
      parsed: { broker: "Webull", accountId: "acc_webull", side: "buy", ticker: "ASTS", qty: "1", price: "100", fees: "2" },
    }));
    expect(p.fxRate).toBeNull();
    expect(p.thbCost).toBeNull();
    eq(p.fees, "2");
  });

  it("parses a THB-funded Dime slip from text (rate after '=', THB→USD)", () => {
    const DIME_QQQ_THB = `
ซื้อ QQQ
NASDAQ
2,000.28 THB
ราคาที่ได้จริง 523.93 USD
จำนวนหุ้น 0.1127809
มูลค่าหุ้น 1,997.24 THB
ค่าคอมมิชชัน 2.84 THB
ภาษีมูลค่าเพิ่ม 7% (VAT) 0.20 THB
อัตราแลกเปลี่ยน 1 USD = 33.80 THB
จำนวนเงิน (USD) 59.18 USD
5 ก.พ. 68 - 00:11 น.
`;
    const p = parseOcrText(DIME_QQQ_THB);
    expect(p.broker).toBe("Dime");
    expect(p.side).toBe("buy");
    expect(p.ticker).toBe("QQQ");
    eq(p.fxRate, "33.80"); // not the leading "1" of "1 USD = 33.80"
    eq(p.price, "523.93");
    eq(p.thbCost, "2000.28"); // 1,997.24 + (2.84 + 0.20)
    expect(Number(p.stockValue)).toBeGreaterThan(58.5); // 1997.24/33.80 ≈ 59.09
    expect(Number(p.stockValue)).toBeLessThan(59.5);
    expect(Number(p.fees)).toBeGreaterThan(0.05); // 3.04/33.80 ≈ 0.09
    expect(Number(p.fees)).toBeLessThan(0.15);
  });

  it("does not fill an explicit null quantity from fallback text", () => {
    const p = parseOcrResponse(JSON.stringify({
      rawText: DIME_RDW_BUY,
      parsed: {
        broker: "Dime",
        side: "buy",
        ticker: "RDW",
        exchange: "NYSE",
        qty: null,
        price: "10.94",
        stockValue: "960.00",
      },
    }));

    expect(p.qty).toBeNull();
    eq(p.price, "10.94");
    eq(p.stockValue, "960.00");
  });

  it("clears a quantity that was copied from price when totals do not match", () => {
    const p = parseOcrResponse(JSON.stringify({
      rawText: "",
      parsed: {
        broker: "Dime",
        side: "buy",
        ticker: "RDW",
        exchange: "NYSE",
        qty: "10.94",
        price: "10.94",
        stockValue: "960.00",
      },
    }));

    expect(p.qty).toBeNull();
    eq(p.price, "10.94");
    eq(p.stockValue, "960.00");
  });

  it("uses raw visible Dime quantity over a calculated structured quantity", () => {
    const p = parseOcrResponse(JSON.stringify({
      rawText: DIME_RDW_SIDE_BY_SIDE,
      parsed: {
        broker: "Dime",
        side: "buy",
        ticker: "RDW",
        exchange: "NYSE",
        qty: "87.7513711",
        price: "10.94",
        stockValue: "960.00",
        fees: "1.44",
        couponsWaived: "1.44",
      },
    }));

    eq(p.qty, "87.7504410");
    eq(p.price, "10.94");
    eq(p.stockValue, "960.00");
  });

  it("prefers Webull average price from raw text over structured limit price", () => {
    const p = parseOcrResponse(JSON.stringify({
      rawText: WEBULL_RKLB_BUY_LIMIT_AVG_DIFFERS,
      parsed: {
        broker: "Webull",
        accountId: "acc_webull",
        side: "buy",
        ticker: "RKLB",
        qty: "10",
        price: "77.00",
        stockValue: null,
        fees: "0.82",
        executedAt: "2026-02-03T14:54:36.000Z",
      },
    }));

    eq(p.qty, "10");
    eq(p.price, "76.97");
    eq(p.fees, "0.82");
    expect(p.executedAt).toMatch(/^2026-02-03T14:54:56/);
  });
});
