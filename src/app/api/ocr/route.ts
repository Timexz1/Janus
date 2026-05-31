import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseOcrResponse } from "@/lib/ocr/parser";
import {
  pricingFor,
  estimateCostUsd,
  usdToThb,
  DEFAULT_CLAUDE_MODEL,
} from "@/lib/ocr/pricing";

export const runtime = "nodejs";

/**
 * Server-side OCR endpoint (brief §4.1). API keys live ONLY on the server — a
 * server env key always takes precedence over a key sent from the browser, and
 * keys are never echoed back. Supports three providers; Claude gives the best
 * accuracy and reports exact token usage so the client can show the THB cost.
 */
const OCR_PROMPT = [
  "นี่คือภาพหน้ารายละเอียดคำสั่งซื้อขายหุ้นจากแอปโบรกเกอร์ (Webull / Dime / อื่นๆ).",
  "อ่านจากภาพอย่างระมัดระวัง แล้วตอบเป็น JSON object เท่านั้น ห้ามมี markdown/code fence/คำอธิบาย.",
  "รูปแบบ JSON: {",
  '"rawText": "ข้อความทั้งหมดที่ถอดได้ตามภาพ",',
  '"parsed": {',
  '"broker": "Webull|Dime|null", "accountId": "acc_webull|acc_dime|null",',
  '"side": "buy|sell|null", "ticker": "เช่น RDW หรือ null", "exchange": "NYSE|NASDAQ|OTHER|null",',
  '"qty": "จำนวนหุ้นเท่านั้น หรือ null", "price": "ราคาต่อหุ้นเท่านั้น หรือ null",',
  '"stockValue": "มูลค่าหุ้น/จำนวนเงินรวมของหุ้นเท่านั้น หรือ null",',
  '"fees": "ค่าธรรมเนียมรวมเป็น USD หรือ null", "couponsWaived": "คูปอง/ส่วนลดค่าธรรมเนียม หรือ null",',
  '"fxRate": "อัตราแลกเปลี่ยน THB ต่อ 1 USD ถ้าสลิปแสดง (เช่น 33.80) ไม่งั้น null",',
  '"thbTotal": "ยอดเงินรวมที่จ่ายเป็นบาท (THB) ถ้าจ่ายด้วยบาท ไม่งั้น null",',
  '"executedAt": "ISO 8601 ถ้าอ่านและแปลงได้ ไม่งั้น null", "executedTz": "timezone หรือ null"',
  "}}",
  "accountId ต้องเป็น acc_webull หรือ acc_dime เท่านั้น ห้ามใส่เลขบัญชี (เช่น CTH4675306) เด็ดขาด — ให้เลือกจากชื่อโบรกเกอร์.",
  "สกุลเงิน: price, stockValue, fees ต้องตอบเป็น USD เสมอ. ถ้าสลิปแสดงเป็นบาท ให้หารด้วย fxRate ก่อนตอบ.",
  "Dime! Fast (จ่ายด้วยบาท): 'ราคาที่ได้จริง' เป็น USD อยู่แล้ว ใส่ใน price ตรงๆ; 'มูลค่าหุ้น' และค่าธรรมเนียมเป็นบาท ให้หารด้วย fxRate เป็น USD; thbTotal อ่านจากยอดบาทรวมด้านบนสุด (เช่น 2,000.28 THB).",
  "กฎสำคัญ: qty คือจำนวนหุ้น ไม่ใช่ราคา. price คือราคาต่อหุ้น. stockValue คือมูลค่ารวมของหุ้น.",
  "ตรวจสอบก่อนตอบ: qty × price ต้องใกล้เคียง stockValue. ถ้าไม่ตรง ให้กลับไปอ่านช่องจำนวนหุ้นจากภาพใหม่ อย่าใช้ราคาแทนจำนวน.",
  "สำหรับ Dime ช่องจำนวนหุ้นมักเป็นเลขทศนิยมหลายตำแหน่งและมีคำว่า หุ้น/จำนวนหุ้น ส่วน price มักอยู่หลัง ราคาที่ได้จริง.",
  "ถ้า Dime แสดง 'ราคาที่ได้จริง' และ 'จำนวนหุ้น' เป็นสองคอลัมน์ ให้ price อ่านจากเลขฝั่งซ้ายใต้ราคาที่ได้จริง และ qty อ่านจากเลขฝั่งขวาใต้จำนวนหุ้น.",
  "สำหรับ Webull ให้ qty อ่านจาก 'จำนวนที่จับคู่แล้ว' ที่ไม่มี US$, price อ่านจาก 'ราคาเฉลี่ย', fee อ่านจาก 'ค่าธรรมเนียมการทำรายการ', และอย่าใช้ 'ราคาลิมิต' เป็น price ถ้ามีราคาเฉลี่ย.",
  "สำหรับ Webull ให้ executedAt อ่านจาก 'คำสั่งถูกจับคู่สำเร็จ' ไม่ใช่ 'วันและเวลาที่ส่งคำสั่ง'.",
  "ถ้ามองไม่เห็นจำนวนหุ้นจริง ห้ามเอาราคาไปใส่ qty และห้ามคำนวณ qty จาก stockValue/price ให้ใส่ null.",
  "รักษาตัวเลข จุดทศนิยม คอมมา เครื่องหมายลบ สกุลเงิน และวันเวลาใน rawText ให้ครบ.",
].join(" ");

interface ProviderResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  return m ? { mediaType: m[1], base64: m[2] } : null;
}

async function runTyphoon(dataUrl: string, apiKey: string): Promise<ProviderResult> {
  const res = await fetch("https://api.opentyphoon.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "typhoon-ocr",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`Typhoon ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

async function runGemini(dataUrl: string, apiKey: string): Promise<ProviderResult> {
  const img = parseDataUrl(dataUrl);
  if (!img) throw new Error("รูปไม่ถูกต้อง");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: img.mediaType, data: img.base64 } },
              { text: OCR_PROMPT },
            ],
          },
        ],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  return {
    text,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function runClaude(
  dataUrl: string,
  apiKey: string,
  model: string,
): Promise<ProviderResult> {
  const img = parseDataUrl(dataUrl);
  if (!img) throw new Error("รูปไม่ถูกต้อง");
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
              data: img.base64,
            },
          },
          { type: "text", text: OCR_PROMPT },
        ],
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    text,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
  };
}

const ENV_KEY: Record<string, () => string | undefined> = {
  typhoon: () => process.env.TYPHOON_OCR_API_KEY ?? process.env.TYPHOON_API_KEY,
  gemini: () => process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
  claude: () => process.env.ANTHROPIC_API_KEY,
};
const ENV_NAME: Record<string, string> = {
  typhoon: "TYPHOON_OCR_API_KEY",
  gemini: "GEMINI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
};

export async function POST(req: Request) {
  let body: {
    dataUrl?: string;
    provider?: string;
    typhoonApiKey?: string;
    geminiApiKey?: string;
    claudeApiKey?: string;
    claudeModel?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "request body ไม่ถูกต้อง" }, { status: 400 });
  }

  const dataUrl = body.dataUrl;
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "ต้องส่ง dataUrl ของรูปภาพ" }, { status: 400 });
  }
  if (dataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "รูปใหญ่เกินไป (จำกัด ~9MB)" }, { status: 413 });
  }

  const provider = (["typhoon", "gemini", "claude"].includes(body.provider ?? "")
    ? body.provider
    : "claude") as "typhoon" | "gemini" | "claude";
  const model = body.claudeModel || DEFAULT_CLAUDE_MODEL;

  // Security: a server env key always wins over a browser-supplied key.
  const bodyKey =
    provider === "claude"
      ? body.claudeApiKey
      : provider === "gemini"
        ? body.geminiApiKey
        : body.typhoonApiKey;
  const apiKey = ENV_KEY[provider]() ?? bodyKey?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: `ยังไม่ได้ตั้งค่า API key ของ ${provider} — ใส่ key ในหน้าตั้งค่า หรือ ${ENV_NAME[provider]} ฝั่ง server`,
      },
      { status: 503 },
    );
  }

  let result: ProviderResult;
  try {
    if (provider === "claude") result = await runClaude(dataUrl, apiKey, model);
    else if (provider === "gemini") result = await runGemini(dataUrl, apiKey);
    else result = await runTyphoon(dataUrl, apiKey);
  } catch (e) {
    return NextResponse.json(
      { error: `OCR (${provider}) ล้มเหลว`, detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const pricing = pricingFor(provider, model);
  const costUsd = estimateCostUsd(result.inputTokens, result.outputTokens, pricing);
  const parsed = parseOcrResponse(result.text);

  return NextResponse.json({
    parsed,
    text: result.text,
    usage: {
      provider,
      model: provider === "claude" ? model : provider,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      costThb: usdToThb(costUsd),
    },
  });
}
