"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Check, ShieldCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { useStore } from "@/lib/store/hooks";
import { useT } from "@/lib/i18n/context";
import {
  saveTaxSettings,
  addAccount,
  deleteAccount,
  replaceAllTransactions,
} from "@/lib/store/local-store";
import type { OcrProvider } from "@/lib/store/types";
import { APPORTIONMENT_LABELS, type ApportionmentMethod } from "@/lib/tax/config";
import { CLAUDE_MODELS } from "@/lib/ocr/pricing";
import { Decimal } from "@/lib/money/decimal";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { SecretVaultCard } from "@/components/secret-vault-card";

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-800 px-3 py-2 text-left hover:bg-slate-800/40"
    >
      <span>
        <span className="block text-sm text-slate-200">{label}</span>
        {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-indigo-600" : "bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-4" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-indigo-600 text-white"
          : "border border-slate-700 text-slate-300 hover:bg-slate-800/60"
      }`}
    >
      {children}
    </button>
  );
}

function ThemeLanguageControls() {
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  const current = mounted ? theme : "dark";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-1.5 text-xs text-slate-400">{t("settings.theme")}</p>
        <div className="flex gap-2">
          <Seg active={current === "light"} onClick={() => setTheme("light")}>
            {t("settings.themeLight")}
          </Seg>
          <Seg active={current === "dark"} onClick={() => setTheme("dark")}>
            {t("settings.themeDark")}
          </Seg>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs text-slate-400">{t("settings.language")}</p>
        <div className="flex gap-2">
          <Seg active={lang === "th"} onClick={() => setLang("th")}>
            {t("settings.langTh")}
          </Seg>
          <Seg active={lang === "en"} onClick={() => setLang("en")}>
            {t("settings.langEn")}
          </Seg>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { accounts, taxSettings, hydrated } = useStore();
  const { t } = useT();
  const [broker, setBroker] = useState("");
  const [label, setLabel] = useState("");
  const ocrKeyRef = useRef<HTMLInputElement>(null);

  if (!hydrated || !taxSettings) return <Card className="h-64 animate-pulse" />;

  const ocrProvider = taxSettings.ocrProvider;
  const ocrProviderLabel =
    ocrProvider === "gemini" ? "Gemini" : ocrProvider === "claude" ? "Claude" : "Typhoon OCR";
  const ocrProviderEnv =
    ocrProvider === "gemini"
      ? "GEMINI_API_KEY"
      : ocrProvider === "claude"
        ? "ANTHROPIC_API_KEY"
        : "TYPHOON_OCR_API_KEY";
  const ocrKeyPlaceholder =
    ocrProvider === "gemini" ? "AIza..." : ocrProvider === "claude" ? "sk-ant-..." : "sk-...";
  const currentSavedOcrKey =
    ocrProvider === "gemini"
      ? taxSettings.geminiApiKey
      : ocrProvider === "claude"
        ? taxSettings.claudeApiKey
        : taxSettings.typhoonApiKey;
  const hasKey = Boolean(currentSavedOcrKey);

  function setOcrProvider(provider: OcrProvider) {
    saveTaxSettings({ ocrProvider: provider });
  }

  function saveCurrentOcrKey() {
    const key = ocrKeyRef.current?.value.trim() ?? "";
    if (ocrProvider === "gemini") saveTaxSettings({ geminiApiKey: key });
    else if (ocrProvider === "claude") saveTaxSettings({ claudeApiKey: key });
    else saveTaxSettings({ typhoonApiKey: key });
  }

  function clearCurrentOcrKey() {
    if (ocrProvider === "gemini") saveTaxSettings({ geminiApiKey: "" });
    else if (ocrProvider === "claude") saveTaxSettings({ claudeApiKey: "" });
    else saveTaxSettings({ typhoonApiKey: "" });
    if (ocrKeyRef.current) ocrKeyRef.current.value = "";
  }

  const allowanceValid = (() => {
    try { return new Decimal(taxSettings.personalAllowance).gte(0); } catch { return false; }
  })();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-slate-100">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("settings.subtitle")}</p>
      </header>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex h-full min-w-0 flex-col gap-4">
      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-200">ภาษี</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="วิธีจับคู่กำไร" htmlFor="s-method">
            <Select
              id="s-method"
              value={taxSettings.apportionmentMethod}
              onChange={(e) =>
                saveTaxSettings({ apportionmentMethod: e.target.value as ApportionmentMethod })
              }
            >
              {(Object.keys(APPORTIONMENT_LABELS) as ApportionmentMethod[]).map((m) => (
                <option key={m} value={m}>{APPORTIONMENT_LABELS[m]}</option>
              ))}
            </Select>
          </Field>
          <Field label="ปีภาษีเริ่มต้น (ค.ศ.)" htmlFor="s-year">
            <Input
              id="s-year"
              type="number"
              value={taxSettings.taxYear}
              onChange={(e) => saveTaxSettings({ taxYear: Number(e.target.value) })}
            />
          </Field>
          <Field
            label="ลดหย่อนส่วนตัว (THB)"
            htmlFor="s-allow"
            error={allowanceValid ? undefined : "ต้องเป็นตัวเลข ≥ 0"}
          >
            <Input
              id="s-allow"
              inputMode="decimal"
              value={taxSettings.personalAllowance}
              onChange={(e) => saveTaxSettings({ personalAllowance: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-1 flex-col space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">{t("settings.display")}</h2>
        <Toggle
          label="แสดงเมตริกขั้นสูงในแดชบอร์ด"
          hint="XIRR, win rate, สัดส่วนพอร์ต, กำไรรายเดือน"
          checked={taxSettings.showMetrics}
          onChange={(v) => saveTaxSettings({ showMetrics: v })}
        />
        <Toggle
          label="เปิดการอ่าน screenshot (OCR)"
          hint={`ใช้ ${ocrProviderLabel} ในหน้าเพิ่มรายการ`}
          checked={taxSettings.ocrEnabled}
          onChange={(v) => saveTaxSettings({ ocrEnabled: v })}
        />
        <ThemeLanguageControls />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">บัญชีโบรกเกอร์</h2>
        <ul className="divide-y divide-slate-800">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-slate-200">{a.broker}</p>
                <p className="text-xs text-slate-500">{a.accountLabel} · {a.currency}</p>
              </div>
              <button
                type="button"
                onClick={() => deleteAccount(a.id)}
                className="ml-auto rounded p-1.5 text-rose-400/80 hover:bg-rose-950/40 hover:text-rose-300"
                aria-label="ลบบัญชี"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="โบรกเกอร์" htmlFor="a-broker">
            <Input id="a-broker" placeholder="เช่น IBKR" value={broker} onChange={(e) => setBroker(e.target.value)} />
          </Field>
          <Field label="ชื่อบัญชี" htmlFor="a-label">
            <Input id="a-label" placeholder="ชื่อเรียก" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!broker.trim()}
              onClick={() => {
                addAccount({ broker: broker.trim(), accountLabel: label.trim() || broker.trim(), currency: "USD" });
                setBroker("");
                setLabel("");
              }}
            >
              <Plus className="h-4 w-4" aria-hidden /> เพิ่มบัญชี
            </Button>
          </div>
        </div>
      </Card>
        </div>

        <div className="flex h-full min-w-0 flex-col gap-4">
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">OCR Provider (อ่าน screenshot)</h2>
        <p className="text-xs text-slate-500">
          เลือกผู้ให้บริการ OCR และใส่ API key เพื่ออ่าน screenshot อัตโนมัติในหน้าเพิ่มรายการ
        </p>
        <div>
          <p className="mb-1.5 text-xs text-slate-400">Provider</p>
          <div className="flex flex-wrap gap-2">
            <Seg active={ocrProvider === "claude"} onClick={() => setOcrProvider("claude")}>
              Claude (แม่นสุด)
            </Seg>
            <Seg active={ocrProvider === "gemini"} onClick={() => setOcrProvider("gemini")}>
              Gemini
            </Seg>
            <Seg active={ocrProvider === "typhoon"} onClick={() => setOcrProvider("typhoon")}>
              Typhoon OCR
            </Seg>
          </div>
        </div>

        {ocrProvider === "claude" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="โมเดล Claude" htmlFor="claude-model" hint="ราคาต่อ 1M tokens (in/out)">
              <Select
                id="claude-model"
                value={taxSettings.claudeModel}
                onChange={(e) => saveTaxSettings({ claudeModel: e.target.value })}
              >
                {Object.entries(CLAUDE_MODELS).map(([id, m]) => (
                  <option key={id} value={id}>
                    {m.label} — ${m.pricing.inputPerM}/${m.pricing.outputPerM}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <p className="text-xs text-slate-500">
                ค่าใช้จ่ายต่อรูปจะแสดงเป็น token + บาท ในหน้าเพิ่มรายการหลัง OCR แต่ละรูป
              </p>
            </div>
          </div>
        ) : null}
        <p className="text-xs text-slate-500">
          {ocrProvider === "claude" ? (
            <>
              Claude แม่นยำสูงสุดกับ screenshot โบรกเกอร์ไทย คิดค่าใช้จ่ายตาม token —{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                ขอ key
              </a>
            </>
          ) : ocrProvider === "gemini" ? (
            <>
              Gemini ใช้ free tier ได้ผ่าน Google AI Studio (โมเดล <code>gemini-2.5-flash</code>){" "}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                ขอ key
              </a>
            </>
          ) : (
            <>
              Typhoon OCR ฟรี 20 req/min แต่ความแม่นยำต่ำกว่า Claude — ขอ key ที่{" "}
              <a href="https://docs.opentyphoon.ai" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                docs.opentyphoon.ai
              </a>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <Field label={`${ocrProviderLabel} API Key`} htmlFor="ocr-key">
              <Input
                key={`${ocrProvider}:${currentSavedOcrKey}`}
                ref={ocrKeyRef}
                id="ocr-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={ocrKeyPlaceholder}
                defaultValue={currentSavedOcrKey}
              />
            </Field>
          </div>
          <Button onClick={saveCurrentOcrKey}>
            <Check className="h-4 w-4" aria-hidden /> บันทึก key
          </Button>
          {hasKey ? (
            <Button variant="danger" onClick={clearCurrentOcrKey}>
              <Trash2 className="h-4 w-4" aria-hidden /> ลบ
            </Button>
          ) : null}
        </div>
        <p className={`text-xs ${hasKey ? "text-emerald-400" : "text-slate-500"}`}>
          {hasKey
            ? `● ตั้งค่า ${ocrProviderLabel} key แล้ว — เปิดใช้ OCR ได้`
            : `○ ยังไม่ได้ตั้งค่า ${ocrProviderLabel} key`}
        </p>
        <p className="flex items-start gap-2 rounded-md border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] px-3 py-2 text-xs leading-relaxed text-[color:var(--warning-text)]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--warning-strong)]" aria-hidden />
          <span>
            ความปลอดภัย: key เก็บใน <b>เบราว์เซอร์เครื่องนี้เท่านั้น</b> และถูกส่งผ่านเซิร์ฟเวอร์ของแอป
            (ไม่ยิงตรงไป provider จากหน้าเว็บ) สำหรับใช้งานหลายคน/โปรดักชัน แนะนำตั้ง{" "}
            <code>{ocrProviderEnv}</code> ฝั่ง server ซึ่งจะถูกใช้ก่อนเสมอ
          </span>
        </p>
      </Card>

      <SecretVaultCard />

      <Card className="flex flex-1 flex-col space-y-2 border-rose-900/40">
        <h2 className="text-sm font-semibold text-rose-300">ลบข้อมูล</h2>
        <p className="text-xs text-slate-500">ล้างรายการเทรดทั้งหมด (ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น)</p>
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm("ลบรายการเทรดทั้งหมด? ย้อนกลับไม่ได้")) replaceAllTransactions([]);
          }}
        >
          <Check className="h-4 w-4" aria-hidden /> ล้างรายการเทรด
        </Button>
      </Card>
        </div>
      </div>
    </div>
  );
}
