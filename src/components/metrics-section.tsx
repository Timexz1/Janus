"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Card, StatCard } from "@/components/ui";
import { TickerLink } from "@/components/ticker-link";

const DONUT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#a855f7", "#ef4444"];

export interface MetricsData {
  winRatePct: number;
  xirrText: string;
  maxDdPct: number;
  allocation: { key: string; value: number; pct: number }[];
  monthly: { month: string; gain: number }[];
}

export function MetricsSection({ data }: { data: MetricsData }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Win rate" value={`${data.winRatePct.toFixed(0)}%`} hint="สัดส่วนการขายที่กำไร" />
        <StatCard label="XIRR (ต่อปี)" value={data.xirrText} hint="ผลตอบแทนถ่วงเวลา" />
        <StatCard label="Max drawdown" value={`${data.maxDdPct.toFixed(1)}%`} hint="กำไรสะสม realized" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">สัดส่วนพอร์ต (ตามต้นทุน)</h3>
          {data.allocation.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">ยังไม่มีสถานะถือครอง</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data.allocation}
                  dataKey="value"
                  nameKey="key"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {data.allocation.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} stroke="#0b1220" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, color: "#e2e8f0" }}
                  formatter={(v, n) => [`$${Number(v).toLocaleString()}`, String(n)]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {data.allocation.map((a, i) => (
              <span key={a.key} className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                <TickerLink ticker={a.key} /> {a.pct.toFixed(0)}%
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-200">กำไร realized รายเดือน (USD)</h3>
          {data.monthly.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">ยังไม่มีการขาย</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.monthly}>
                <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#1e293b" }} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  cursor={{ fill: "rgba(148,163,184,0.08)" }}
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, color: "#e2e8f0" }}
                  formatter={(v) => [`$${Number(v).toLocaleString()}`, "กำไร"]}
                />
                <ReferenceLine y={0} stroke="#334155" />
                <Bar dataKey="gain" radius={[3, 3, 0, 0]}>
                  {data.monthly.map((m, i) => (
                    <Cell key={i} fill={m.gain >= 0 ? "#10b981" : "#f43f5e"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
