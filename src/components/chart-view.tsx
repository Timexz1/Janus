"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  ColorType,
  LineStyle,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import type { Candle } from "@/lib/prices/types";

export interface TradeMarker {
  time: string; // YYYY-MM-DD
  side: "buy" | "sell";
  text: string;
}

export function ChartView({
  candles,
  markers,
  avgCost,
  height = 420,
}: {
  candles: Candle[];
  markers: TradeMarker[];
  avgCost: number | null;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)" },
        horzLines: { color: "rgba(148,163,184,0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.2)" },
      timeScale: { borderColor: "rgba(148,163,184,0.2)", timeVisible: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });
    series.setData(candles);

    if (markers.length) {
      const seriesMarkers: SeriesMarker<Time>[] = markers.map((m) => ({
        time: m.time,
        position: m.side === "buy" ? "belowBar" : "aboveBar",
        color: m.side === "buy" ? "#10b981" : "#f43f5e",
        shape: m.side === "buy" ? "arrowUp" : "arrowDown",
        text: m.text,
      }));
      createSeriesMarkers(series, seriesMarkers);
    }

    if (avgCost != null && Number.isFinite(avgCost)) {
      series.createPriceLine({
        price: avgCost,
        color: "#818cf8",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "ต้นทุนเฉลี่ย",
      });
    }

    chart.timeScale().fitContent();

    const onResize = () => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [candles, markers, avgCost, height]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
