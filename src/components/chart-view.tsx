"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Eraser,
  GripVertical,
  Minus,
  MousePointer2,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type ISeriesApi,
  type Logical,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { cn } from "@/components/ui";
import type { Candle } from "@/lib/prices/types";
import type {
  ChartDrawing,
  ChartIndicators,
  ChartLineStyle,
  ChartTrendlineMode,
  ChartVisibleRange,
} from "@/lib/store/types";

export interface TradeMarker {
  time: string;
  side: "buy" | "sell";
  text: string;
}

type DrawTool = "cursor" | "trendline" | "horizontal" | "vertical" | "fibonacci";
type TwoPointTool = Extract<DrawTool, "trendline" | "fibonacci">;
type TwoAnchorDrawing = Extract<ChartDrawing, { type: "trendline" | "fibonacci" }>;
type DragTarget =
  | { id: string; kind: "move"; start: EventPoint | null; drawing: ChartDrawing }
  | { id: string; kind: "from"; drawing: TwoAnchorDrawing }
  | { id: string; kind: "to"; drawing: TwoAnchorDrawing };

type DraftPoint = Point & { logical?: number };

interface Point {
  time: string;
  price: number;
}

interface EventPoint extends Point {
  index: number;
  logical: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const DRAWING_COLOR = "#38bdf8";
const SELECTED_COLOR = "#f59e0b";
const DEFAULT_LINE_WIDTH = 2;
const DEFAULT_LINE_STYLE: ChartLineStyle = "solid";
const DEFAULT_DRAWING_COLOR = "#f59e0b";
const LINE_WIDTHS = [1, 2, 3, 4, 5] as const;
const LINE_STYLES: Array<{ value: ChartLineStyle; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dash" },
  { value: "dotted", label: "Dot" },
];
const TRENDLINE_MODES: Array<{ value: ChartTrendlineMode; label: string }> = [
  { value: "segment", label: "Segment" },
  { value: "ray", label: "Ray" },
  { value: "extended", label: "Extend" },
];
const COLOR_SWATCHES = ["#f59e0b", "#38bdf8", "#22c55e", "#f43f5e", "#a855f7"];
const MA_LINES: Array<{ key: keyof ChartIndicators; period: number; color: string; title: string }> = [
  { key: "ma20", period: 20, color: "#38bdf8", title: "MA20" },
  { key: "ma50", period: 50, color: "#a855f7", title: "MA50" },
  { key: "ma200", period: 200, color: "#f59e0b", title: "MA200" },
];
const FIBONACCI_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

function nextDrawingId() {
  return globalThis.crypto?.randomUUID?.() ?? `drawing-${Date.now()}-${Math.random()}`;
}

function isTwoPointTool(tool: DrawTool): tool is TwoPointTool {
  return tool === "trendline" || tool === "fibonacci";
}

function createTwoPointDrawing(
  tool: TwoPointTool,
  from: DraftPoint,
  to: DraftPoint,
  width: number,
  color: string,
  style: ChartLineStyle,
): ChartDrawing {
  if (tool === "fibonacci") {
    return {
      id: nextDrawingId(),
      type: "fibonacci",
      from,
      to,
      width,
      color,
      style,
    };
  }
  return {
    id: nextDrawingId(),
    type: "trendline",
    from,
    to,
    mode: "segment",
    width,
    color,
    style,
  };
}

function isTimeString(time: Time | null): time is string {
  return typeof time === "string";
}

function cloneDrawing(drawing: ChartDrawing): ChartDrawing {
  return JSON.parse(JSON.stringify(drawing)) as ChartDrawing;
}

function nearestTimeIndex(time: string, candleTimes: string[]) {
  if (candleTimes.length === 0) return 0;
  const exact = candleTimes.indexOf(time);
  if (exact >= 0) return exact;
  const target = new Date(`${time}T00:00:00Z`).getTime();
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  candleTimes.forEach((candidate, index) => {
    const distance = Math.abs(new Date(`${candidate}T00:00:00Z`).getTime() - target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function clampIndex(index: number, candleTimes: string[]) {
  return Math.max(0, Math.min(candleTimes.length - 1, index));
}

function timeAtLogical(logical: number, candleTimes: string[]) {
  if (candleTimes.length === 0) return "";
  return candleTimes[clampIndex(Math.round(logical), candleTimes)] ?? candleTimes[0];
}

function formatDrawingDate(time: string) {
  const date = new Date(`${time}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return time;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date);
}

function shiftDrawing(drawing: ChartDrawing, dxLogical: number, dy: number, candleTimes: string[]): ChartDrawing {
  const shiftAnchor = (anchor: Point & { logical?: number }) => {
    if (candleTimes.length === 0) {
      return { time: anchor.time, price: anchor.price + dy, logical: anchor.logical };
    }
    const logical = (anchor.logical ?? nearestTimeIndex(anchor.time, candleTimes)) + dxLogical;
    return {
      time: timeAtLogical(logical, candleTimes) || anchor.time,
      price: anchor.price + dy,
      logical,
    };
  };
  const copy = cloneDrawing(drawing);
  if (copy.type === "horizontal") {
    if (candleTimes.length === 0) return { ...copy, price: copy.price + dy };
    const fallbackLogical = copy.time == null
      ? Math.floor(candleTimes.length / 2)
      : nearestTimeIndex(copy.time, candleTimes);
    const logical = (copy.logical ?? fallbackLogical) + dxLogical;
    return {
      ...copy,
      price: copy.price + dy,
      time: timeAtLogical(logical, candleTimes) || copy.time,
      logical,
    };
  }
  if (copy.type === "vertical") {
    const logical = (copy.logical ?? nearestTimeIndex(copy.time, candleTimes)) + dxLogical;
    return { ...copy, time: timeAtLogical(logical, candleTimes) || copy.time, logical };
  }
  return {
    ...copy,
    from: shiftAnchor(copy.from),
    to: shiftAnchor(copy.to),
  };
}

function lineDash(style: ChartLineStyle | undefined) {
  if (style === "dotted") return "2 5";
  if (style === "dashed") return "8 6";
  return undefined;
}

function extendTrendlineToViewport(
  from: ScreenPoint,
  to: ScreenPoint,
  width: number,
  height: number,
  mode: ChartTrendlineMode | undefined,
) {
  const trendMode = mode ?? "segment";
  if (trendMode === "segment") return { from, to };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { from, to };

  const candidates: Array<{ t: number; point: ScreenPoint }> = [];
  const push = (t: number, point: ScreenPoint) => {
    if (
      Number.isFinite(t) &&
      point.x >= -1 &&
      point.x <= width + 1 &&
      point.y >= -1 &&
      point.y <= height + 1
    ) {
      candidates.push({
        t,
        point: {
          x: Math.max(0, Math.min(width, point.x)),
          y: Math.max(0, Math.min(height, point.y)),
        },
      });
    }
  };

  if (Math.abs(dx) > 0.001) {
    const leftT = (0 - from.x) / dx;
    push(leftT, { x: 0, y: from.y + leftT * dy });
    const rightT = (width - from.x) / dx;
    push(rightT, { x: width, y: from.y + rightT * dy });
  }
  if (Math.abs(dy) > 0.001) {
    const topT = (0 - from.y) / dy;
    push(topT, { x: from.x + topT * dx, y: 0 });
    const bottomT = (height - from.y) / dy;
    push(bottomT, { x: from.x + bottomT * dx, y: height });
  }

  const unique = candidates
    .filter((candidate, index, all) =>
      all.findIndex((other) =>
        Math.abs(other.point.x - candidate.point.x) < 0.5 &&
        Math.abs(other.point.y - candidate.point.y) < 0.5
      ) === index,
    )
    .sort((a, b) => a.t - b.t);
  if (unique.length === 0) return { from, to };

  if (trendMode === "ray") {
    const forward = unique.filter((candidate) => candidate.t >= 0);
    const end = forward[forward.length - 1]?.point ?? to;
    return { from, to: end };
  }

  return {
    from: unique[0].point,
    to: unique[unique.length - 1].point,
  };
}

function movingAverageData(candles: Candle[], period: number) {
  const data: Array<{ time: string; value: number }> = [];
  let sum = 0;
  candles.forEach((candle, index) => {
    sum += candle.close;
    if (index >= period) sum -= candles[index - period].close;
    if (index >= period - 1) {
      data.push({
        time: candle.time,
        value: sum / period,
      });
    }
  });
  return data;
}

function formatCompactVolume(volume: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(volume);
}

export function ChartView({
  candles,
  markers,
  avgCost,
  drawings,
  indicators,
  visibleRange,
  onDrawingsChange,
  onVisibleRangeChange,
  height = 420,
  drawingKey,
}: {
  candles: Candle[];
  markers: TradeMarker[];
  avgCost: number | null;
  drawings: ChartDrawing[];
  indicators: ChartIndicators;
  visibleRange: ChartVisibleRange | null;
  onDrawingsChange: (drawings: ChartDrawing[]) => void;
  onVisibleRangeChange: (range: ChartVisibleRange | null) => void;
  height?: number;
  drawingKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const toolRef = useRef<DrawTool>("cursor");
  const draftRef = useRef<DraftPoint | null>(null);
  const drawDragRef = useRef<{ start: EventPoint; moved: boolean; tool: TwoPointTool } | null>(null);
  const dragRef = useRef<DragTarget | null>(null);
  const drawingsRef = useRef<ChartDrawing[]>(drawings);
  const visibleRangeRef = useRef<ChartVisibleRange | null>(visibleRange);
  const onVisibleRangeChangeRef = useRef(onVisibleRangeChange);
  const lastVisibleRangeKeyRef = useRef("");
  const pendingDragRef = useRef<{ id: string; drawing: ChartDrawing } | null>(null);
  const liveDragRef = useRef<{ id: string; drawing: ChartDrawing } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const drawingDragLockedRef = useRef(false);

  const [tool, setTool] = useState<DrawTool>("cursor");
  const [draft, setDraft] = useState<DraftPoint | null>(null);
  const [draftTo, setDraftTo] = useState<DraftPoint | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [defaultLineWidth, setDefaultLineWidth] = useState(DEFAULT_LINE_WIDTH);
  const [defaultLineStyle, setDefaultLineStyle] = useState<ChartLineStyle>(DEFAULT_LINE_STYLE);
  const [defaultDrawingColor, setDefaultDrawingColor] = useState(DEFAULT_DRAWING_COLOR);
  const [liveDrag, setLiveDrag] = useState<{ id: string; drawing: ChartDrawing } | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [, rerenderOverlay] = useState(0);

  const candleTimes = useMemo(() => candles.map((c) => c.time), [candles]);
  const displayCandle = hoveredCandle ?? candles[candles.length - 1] ?? null;

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  useEffect(() => {
    visibleRangeRef.current = visibleRange;
  }, [visibleRange]);

  useEffect(() => {
    onVisibleRangeChangeRef.current = onVisibleRangeChange;
  }, [onVisibleRangeChange]);

  useEffect(() => {
    queueMicrotask(() => {
      drawDragRef.current = null;
      dragRef.current = null;
      pendingDragRef.current = null;
      liveDragRef.current = null;
      setTool("cursor");
      setDraft(null);
      setDraftTo(null);
      setLiveDrag(null);
      setSelectedId(null);
    });
  }, [drawingKey]);

  const setDrawingList = useCallback((next: ChartDrawing[]) => {
    drawingsRef.current = next;
    onDrawingsChange(next);
  }, [onDrawingsChange]);

  const setChartInteraction = useCallback((enabled: boolean) => {
    chartRef.current?.applyOptions({
      handleScroll: enabled,
      handleScale: enabled,
    });
  }, []);

  const updateDrawing = useCallback((id: string, next: ChartDrawing) => {
    setDrawingList(drawingsRef.current.map((drawing) => (drawing.id === id ? next : drawing)));
  }, [setDrawingList]);

  const flushPendingDrag = useCallback(() => {
    const pending = pendingDragRef.current ?? liveDragRef.current;
    pendingDragRef.current = null;
    liveDragRef.current = null;
    if (dragFrameRef.current != null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    setLiveDrag(null);
    if (pending) updateDrawing(pending.id, pending.drawing);
  }, [updateDrawing]);

  const scheduleDragUpdate = useCallback((id: string, drawing: ChartDrawing) => {
    pendingDragRef.current = { id, drawing };
    if (dragFrameRef.current != null) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const pending = pendingDragRef.current;
      pendingDragRef.current = null;
      if (pending) {
        liveDragRef.current = pending;
        setLiveDrag(pending);
      }
    });
  }, []);

  const eventToPoint = useCallback((event: { clientX: number; clientY: number }): EventPoint | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const el = ref.current;
    if (!chart || !series || !el) return null;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const scale = chart.timeScale();
    const time = scale.coordinateToTime(x);
    const logical = scale.coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    const fallbackIndex =
      logical == null || candleTimes.length === 0
        ? null
        : clampIndex(Math.round(logical), candleTimes);
    const resolvedTime = isTimeString(time)
      ? time
      : fallbackIndex == null
        ? null
        : candleTimes[fallbackIndex];
    if (!resolvedTime || price == null) return null;
    return {
      time: resolvedTime,
      price: Number(price),
      index: fallbackIndex ?? nearestTimeIndex(resolvedTime, candleTimes),
      logical: logical ?? fallbackIndex ?? nearestTimeIndex(resolvedTime, candleTimes),
    };
  }, [candleTimes]);

  const handleDrawPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const activeTool = toolRef.current;
    if (activeTool === "cursor") return;
    event.preventDefault();
    event.stopPropagation();
    const point = eventToPoint(event);
    if (!point) return;

    if (activeTool === "horizontal") {
      const drawing: ChartDrawing = {
        id: nextDrawingId(),
        type: "horizontal",
        price: point.price,
        time: point.time,
        logical: point.logical,
        width: defaultLineWidth,
        color: defaultDrawingColor,
        style: defaultLineStyle,
      };
      setDrawingList([...drawingsRef.current, drawing]);
      setSelectedId(drawing.id);
      setTool("cursor");
      return;
    }

    if (activeTool === "vertical") {
      const drawing: ChartDrawing = {
        id: nextDrawingId(),
        type: "vertical",
        time: point.time,
        logical: point.logical,
        width: defaultLineWidth,
        color: defaultDrawingColor,
        style: defaultLineStyle,
      };
      setDrawingList([...drawingsRef.current, drawing]);
      setSelectedId(drawing.id);
      setTool("cursor");
      return;
    }

    if (!isTwoPointTool(activeTool)) return;

    const currentDraft = draftRef.current;
    if (!currentDraft) {
      setDraft({ time: point.time, price: point.price, logical: point.logical });
      setDraftTo({ time: point.time, price: point.price, logical: point.logical });
      drawDragRef.current = { start: point, moved: false, tool: activeTool };
      setSelectedId(null);
      return;
    }

    const drawing = createTwoPointDrawing(
      activeTool,
      currentDraft,
      { time: point.time, price: point.price, logical: point.logical },
      defaultLineWidth,
      defaultDrawingColor,
      defaultLineStyle,
    );
    setDrawingList([...drawingsRef.current, drawing]);
    setSelectedId(drawing.id);
    setDraft(null);
    setDraftTo(null);
    setTool("cursor");
  }, [defaultDrawingColor, defaultLineStyle, defaultLineWidth, eventToPoint, setDrawingList]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setDrawingList(drawingsRef.current.filter((drawing) => drawing.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, setDrawingList]);

  const selectedDrawing = useMemo(
    () => {
      if (liveDrag && liveDrag.id === selectedId) return liveDrag.drawing;
      return drawings.find((drawing) => drawing.id === selectedId) ?? null;
    },
    [drawings, liveDrag, selectedId],
  );

  const displayDrawings = useMemo(() => {
    if (!liveDrag) return drawings;
    return drawings.map((drawing) => (drawing.id === liveDrag.id ? liveDrag.drawing : drawing));
  }, [drawings, liveDrag]);

  const activeWidth = selectedDrawing?.width ?? defaultLineWidth;
  const activeStyle = selectedDrawing?.style ?? defaultLineStyle;
  const activeColor = selectedDrawing?.color ?? defaultDrawingColor;
  const selectedWidth = activeWidth;
  const selectedStyle = activeStyle;
  const selectedColor = activeColor;
  const selectedTrendlineMode =
    selectedDrawing?.type === "trendline" ? (selectedDrawing.mode ?? "segment") : "segment";

  const updateActiveWidth = useCallback((width: number) => {
    setDefaultLineWidth(width);
    if (!selectedId) return;
    setDrawingList(drawingsRef.current.map((drawing) => (
      drawing.id === selectedId ? { ...drawing, width } : drawing
    )));
  }, [selectedId, setDrawingList]);

  const updateActiveStyle = useCallback((style: ChartLineStyle) => {
    setDefaultLineStyle(style);
    if (!selectedId) return;
    setDrawingList(drawingsRef.current.map((drawing) => (
      drawing.id === selectedId ? { ...drawing, style } : drawing
    )));
  }, [selectedId, setDrawingList]);

  const updateActiveColor = useCallback((color: string) => {
    setDefaultDrawingColor(color);
    if (!selectedId) return;
    setDrawingList(drawingsRef.current.map((drawing) => (
      drawing.id === selectedId ? { ...drawing, color } : drawing
    )));
  }, [selectedId, setDrawingList]);
  const updateSelectedWidth = updateActiveWidth;
  const updateSelectedStyle = updateActiveStyle;
  const updateSelectedColor = updateActiveColor;

  const updateSelectedTrendlineMode = useCallback((mode: ChartTrendlineMode) => {
    if (!selectedId) return;
    setDrawingList(drawingsRef.current.map((drawing) => (
      drawing.id === selectedId && drawing.type === "trendline"
        ? { ...drawing, mode }
        : drawing
    )));
  }, [selectedId, setDrawingList]);

  const clearDrawings = useCallback(() => {
    setDrawingList([]);
    drawDragRef.current = null;
    dragRef.current = null;
    pendingDragRef.current = null;
    liveDragRef.current = null;
    setDraft(null);
    setDraftTo(null);
    setLiveDrag(null);
    setSelectedId(null);
    setTool("cursor");
  }, [setDrawingList]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(null);
        setDraftTo(null);
        drawDragRef.current = null;
        dragRef.current = null;
        pendingDragRef.current = null;
        liveDragRef.current = null;
        setLiveDrag(null);
        drawingDragLockedRef.current = false;
        setChartInteraction(true);
        setTool("cursor");
        return;
      }
      if (!selectedId) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      deleteSelected();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, selectedId, setChartInteraction]);

  useEffect(() => {
    const finishTwoPointDrag = (point: EventPoint | null) => {
      const drag = drawDragRef.current;
      drawDragRef.current = null;
      if (!drag) return;
      if (!drag.moved || !point) {
        setDraftTo(null);
        return;
      }
      const drawing = createTwoPointDrawing(
        drag.tool,
        {
          time: drag.start.time,
          price: drag.start.price,
          logical: drag.start.logical,
        },
        { time: point.time, price: point.price, logical: point.logical },
        defaultLineWidth,
        defaultDrawingColor,
        defaultLineStyle,
      );
      setDrawingList([...drawingsRef.current, drawing]);
      setSelectedId(drawing.id);
      setDraft(null);
      setDraftTo(null);
      setTool("cursor");
    };

    const onDrawPointerMove = (event: PointerEvent) => {
      const drag = drawDragRef.current;
      if (!drag || toolRef.current !== drag.tool) return;
      event.preventDefault();
      const point = eventToPoint(event);
      if (!point) return;
      const priceDistance = Math.abs(point.price - drag.start.price);
      const logicalDistance = Math.abs(point.logical - drag.start.logical);
      if (logicalDistance > 0.2 || priceDistance > 0.01) drag.moved = true;
      setDraftTo({ time: point.time, price: point.price, logical: point.logical });
    };

    const onDrawPointerEnd = (event: PointerEvent) => {
      const drag = drawDragRef.current;
      if (!drag) return;
      event.preventDefault();
      finishTwoPointDrag(eventToPoint(event));
    };

    window.addEventListener("pointermove", onDrawPointerMove);
    window.addEventListener("pointerup", onDrawPointerEnd);
    window.addEventListener("pointercancel", onDrawPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onDrawPointerMove);
      window.removeEventListener("pointerup", onDrawPointerEnd);
      window.removeEventListener("pointercancel", onDrawPointerEnd);
    };
  }, [defaultDrawingColor, defaultLineStyle, defaultLineWidth, eventToPoint, setDrawingList]);

  useEffect(() => {
    if (drawingDragLockedRef.current) return;
    setChartInteraction(tool === "cursor");
  }, [setChartInteraction, tool]);

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
      timeScale: {
        borderColor: "rgba(148,163,184,0.2)",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });
    seriesRef.current = series;
    series.setData(candles);
    const hasVolume = indicators.volume && candles.some((candle) => candle.volume != null);
    series.priceScale().applyOptions({
      scaleMargins: { top: 0.06, bottom: hasVolume ? 0.24 : 0.08 },
    });

    for (const ma of MA_LINES) {
      if (!indicators[ma.key]) continue;
      const maData = movingAverageData(candles, ma.period);
      if (maData.length === 0) continue;
      const maSeries = chart.addSeries(LineSeries, {
        color: ma.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: ma.title,
      });
      maSeries.setData(maData);
    }

    if (hasVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.78, bottom: 0 },
        borderVisible: false,
      });
      volumeSeries.setData(candles.map((candle) => ({
        time: candle.time,
        value: candle.volume ?? 0,
        color: candle.close >= candle.open
          ? "rgba(16, 185, 129, 0.28)"
          : "rgba(244, 63, 94, 0.28)",
      })));
    }

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

    const savedRange = visibleRangeRef.current;
    if (
      savedRange &&
      Number.isFinite(savedRange.from) &&
      Number.isFinite(savedRange.to) &&
      savedRange.to > savedRange.from
    ) {
      const minFrom = -100;
      const maxTo = candles.length + 100;
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(minFrom, Math.min(savedRange.from, maxTo)),
        to: Math.max(minFrom, Math.min(savedRange.to, maxTo)),
      });
    } else {
      chart.timeScale().fitContent();
    }

    let frame = 0;
    const redrawOverlay = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        rerenderOverlay((value) => value + 1);
      });
    };
    const crosshairHandler = (param: { time?: Time }) => {
      redrawOverlay();
      if (isTimeString(param.time ?? null)) {
        setHoveredCandle(candles.find((candle) => candle.time === param.time) ?? null);
      } else {
        setHoveredCandle(null);
      }
    };
    const visibleLogicalRangeHandler = (range: { from: number; to: number } | null) => {
      redrawOverlay();
      if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) {
        lastVisibleRangeKeyRef.current = "";
        onVisibleRangeChangeRef.current(null);
        return;
      }
      const next = {
        from: Number(range.from.toFixed(3)),
        to: Number(range.to.toFixed(3)),
      };
      const key = `${next.from}:${next.to}`;
      if (key === lastVisibleRangeKeyRef.current) return;
      lastVisibleRangeKeyRef.current = key;
      onVisibleRangeChangeRef.current(next);
    };

    chart.subscribeCrosshairMove(crosshairHandler);
    chart.timeScale().subscribeVisibleLogicalRangeChange(visibleLogicalRangeHandler);
    queueMicrotask(() => {
      setChartWidth(chart.timeScale().width());
      rerenderOverlay((value) => value + 1);
    });

    const onResize = () => {
      if (!ref.current) return;
      chart.applyOptions({ width: ref.current.clientWidth });
      setChartWidth(chart.timeScale().width());
      redrawOverlay();
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(visibleLogicalRangeHandler);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [avgCost, candles, height, indicators, markers]);

  const anchorToPoint = useCallback((anchor: Point & { logical?: number }): ScreenPoint | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;
    const x = typeof anchor.logical === "number"
      ? chart.timeScale().logicalToCoordinate(anchor.logical as unknown as Logical)
      : chart.timeScale().timeToCoordinate(anchor.time);
    const y = series.priceToCoordinate(anchor.price);
    if (x == null || y == null) return null;
    return { x: Number(x), y: Number(y) };
  }, []);

  const priceToY = useCallback((price: number): number | null => {
    const series = seriesRef.current;
    if (!series) return null;
    const y = series.priceToCoordinate(price);
    return y == null ? null : Number(y);
  }, []);

  const timeToX = useCallback((time: string, logical?: number): number | null => {
    const chart = chartRef.current;
    if (!chart) return null;
    const x = typeof logical === "number"
      ? chart.timeScale().logicalToCoordinate(logical as unknown as Logical)
      : chart.timeScale().timeToCoordinate(time);
    return x == null ? null : Number(x);
  }, []);

  const onHandlePointerDown = useCallback((
    event: React.PointerEvent<SVGElement>,
    target: DragTarget,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some SVG elements cannot capture in older browser engines; window listeners still handle the drag.
    }
    const point = eventToPoint(event);
    const midpoint = clampIndex(Math.floor(candleTimes.length / 2), candleTimes);
    const fallbackStart: EventPoint | null =
      target.kind !== "move"
        ? null
        : target.drawing.type === "trendline" || target.drawing.type === "fibonacci"
          ? {
            ...target.drawing.from,
            index: nearestTimeIndex(target.drawing.from.time, candleTimes),
            logical: target.drawing.from.logical ?? nearestTimeIndex(target.drawing.from.time, candleTimes),
          }
          : target.drawing.type === "vertical"
            ? {
              time: target.drawing.time,
              price: 0,
              index: nearestTimeIndex(target.drawing.time, candleTimes),
              logical: target.drawing.logical ?? nearestTimeIndex(target.drawing.time, candleTimes),
            }
            : candleTimes.length
              ? { time: candleTimes[midpoint], price: target.drawing.price, index: midpoint, logical: midpoint }
              : null;
    const start = target.kind === "move" ? point ?? fallbackStart : null;
    dragRef.current = target.kind === "move" ? { ...target, start } : target;
    drawingDragLockedRef.current = true;
    setChartInteraction(false);
    setSelectedId(target.id);
    setTool("cursor");
  }, [candleTimes, eventToPoint, setChartInteraction]);

  useEffect(() => {
    const onDragPointerMove = (event: PointerEvent) => {
      const target = dragRef.current;
      if (!target) return;
      event.preventDefault();
      const point = eventToPoint(event);
      if (!point) return;

      if (target.kind === "from") {
        scheduleDragUpdate(target.id, {
          ...target.drawing,
          from: { time: point.time, price: point.price, logical: point.logical },
        });
      } else if (target.kind === "to") {
        scheduleDragUpdate(target.id, {
          ...target.drawing,
          to: { time: point.time, price: point.price, logical: point.logical },
        });
      } else if (target.start) {
        const dx = point.logical - target.start.logical;
        const dy = point.price - target.start.price;
        scheduleDragUpdate(target.id, shiftDrawing(target.drawing, dx, dy, candleTimes));
      }
    };

    const onDragEnd = () => {
      flushPendingDrag();
      dragRef.current = null;
      drawingDragLockedRef.current = false;
      setChartInteraction(toolRef.current === "cursor");
    };

    window.addEventListener("pointermove", onDragPointerMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
    return () => {
      window.removeEventListener("pointermove", onDragPointerMove);
      window.removeEventListener("pointerup", onDragEnd);
      window.removeEventListener("pointercancel", onDragEnd);
      if (dragFrameRef.current != null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      pendingDragRef.current = null;
      liveDragRef.current = null;
    };
  }, [candleTimes, eventToPoint, flushPendingDrag, scheduleDragUpdate, setChartInteraction]);

  return (
    <div className="relative" style={{ width: "100%", height }}>
      <div className="absolute right-2 top-2 z-30 flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/80 p-1 shadow-sm backdrop-blur">
        <ToolButton active={tool === "cursor"} title="เลือก/เลื่อนกราฟ" onClick={() => {
          drawDragRef.current = null;
          setTool("cursor");
          setDraft(null);
          setDraftTo(null);
        }}>
          <MousePointer2 className="h-4 w-4" aria-hidden />
        </ToolButton>
        <ToolButton active={tool === "trendline"} title="Trendline" onClick={() => {
          drawDragRef.current = null;
          setTool("trendline");
          setDraft(null);
          setDraftTo(null);
        }}>
          <TrendingUp className="h-4 w-4" aria-hidden />
        </ToolButton>
        <ToolButton active={tool === "fibonacci"} title="Fibonacci Retracement" onClick={() => {
          drawDragRef.current = null;
          setTool("fibonacci");
          setDraft(null);
          setDraftTo(null);
        }}>
          <span className="text-[10px] font-bold leading-none">Fib</span>
        </ToolButton>
        <ToolButton active={tool === "horizontal"} title="Horizontal line" onClick={() => {
          drawDragRef.current = null;
          setTool("horizontal");
          setDraft(null);
          setDraftTo(null);
        }}>
          <Minus className="h-4 w-4" aria-hidden />
        </ToolButton>
        <ToolButton active={tool === "vertical"} title="Vertical line" onClick={() => {
          drawDragRef.current = null;
          setTool("vertical");
          setDraft(null);
          setDraftTo(null);
        }}>
          <GripVertical className="h-4 w-4" aria-hidden />
        </ToolButton>
        {selectedDrawing || tool !== "cursor" ? (
          <>
            <div className="flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-900/80 px-1">
              {COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={`สี ${color}`}
                  aria-label={`สี ${color}`}
                  onClick={() => updateSelectedColor(color)}
                  className={cn(
                    "h-5 w-5 rounded-sm border",
                    selectedColor === color ? "border-white" : "border-slate-700",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <select
              title="รูปแบบเส้น"
              aria-label="รูปแบบเส้น"
              value={selectedStyle}
              onChange={(event) => updateSelectedStyle(event.target.value as ChartLineStyle)}
              className="h-8 rounded-md border border-slate-800 bg-slate-900 px-2 text-xs font-medium text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              {LINE_STYLES.map((style) => (
                <option key={style.value} value={style.value}>{style.label}</option>
              ))}
            </select>
            {selectedDrawing?.type === "trendline" ? (
              <select
                title="โหมดเส้น"
                aria-label="โหมดเส้น"
                value={selectedTrendlineMode}
                onChange={(event) => updateSelectedTrendlineMode(event.target.value as ChartTrendlineMode)}
                className="h-8 rounded-md border border-slate-800 bg-slate-900 px-2 text-xs font-medium text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                {TRENDLINE_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
            ) : null}
            <select
              title="ขนาดเส้น"
              aria-label="ขนาดเส้น"
              value={selectedWidth}
              onChange={(event) => updateSelectedWidth(Number(event.target.value))}
              className="h-8 rounded-md border border-slate-800 bg-slate-900 px-2 text-xs font-medium text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              {LINE_WIDTHS.map((width) => (
                <option key={width} value={width}>{width}px</option>
              ))}
            </select>
          </>
        ) : null}
        <div className="mx-1 h-5 w-px bg-slate-800" />
        <ToolButton title="ลบเส้นที่เลือก" disabled={!selectedId} onClick={deleteSelected}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </ToolButton>
        <ToolButton title="ล้างเส้นทั้งหมด" disabled={displayDrawings.length === 0 && !draft} onClick={clearDrawings}>
          <Eraser className="h-4 w-4" aria-hidden />
        </ToolButton>
      </div>

      <div
        ref={ref}
        className={cn(tool !== "cursor" && "cursor-crosshair")}
        style={{ width: "100%", height }}
      />
      {displayCandle ? (
        <div className="pointer-events-none absolute left-2 top-2 z-20 rounded-md bg-slate-950/70 px-2 py-1 text-xs font-medium tabular-nums text-slate-300 backdrop-blur">
          <span className="text-slate-400">{displayCandle.time}</span>
          <span className="ml-2">O {displayCandle.open.toFixed(2)}</span>
          <span className="ml-2 text-emerald-400">H {displayCandle.high.toFixed(2)}</span>
          <span className="ml-2 text-rose-400">L {displayCandle.low.toFixed(2)}</span>
          <span className="ml-2">C {displayCandle.close.toFixed(2)}</span>
          {displayCandle.volume != null ? (
            <span className="ml-2">V {formatCompactVolume(displayCandle.volume)}</span>
          ) : null}
        </div>
      ) : null}
      <svg
        className="pointer-events-none absolute inset-0 z-10"
        width="100%"
        height="100%"
        aria-hidden
      >
        {displayDrawings.map((drawing) => (
          <DrawingShape
            key={drawing.id}
            drawing={drawing}
            selected={drawing.id === selectedId}
            chartHeight={height}
            chartWidth={chartWidth}
            anchorToPoint={anchorToPoint}
            priceToY={priceToY}
            timeToX={timeToX}
            onSelect={() => {
              setSelectedId(drawing.id);
              setTool("cursor");
              setDraft(null);
              setDraftTo(null);
              drawDragRef.current = null;
            }}
            onHandlePointerDown={onHandlePointerDown}
          />
        ))}
        {draft ? (
          <DraftShape
            from={draft}
            to={draftTo}
            anchorToPoint={anchorToPoint}
          />
        ) : null}
      </svg>
      {tool !== "cursor" ? (
        <div
          className="absolute inset-0 z-20 cursor-crosshair"
          onPointerDown={handleDrawPointerDown}
        />
      ) : null}
    </div>
  );
}

function ToolButton({
  active = false,
  disabled = false,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-md border text-slate-400 transition-colors",
        active
          ? "border-indigo-500 bg-indigo-600 text-white"
          : "border-slate-800 bg-slate-900/70 hover:bg-slate-800 hover:text-slate-100",
        disabled && "cursor-not-allowed opacity-40 hover:bg-slate-900/70 hover:text-slate-400",
      )}
    >
      {children}
    </button>
  );
}

function DrawingShape({
  drawing,
  selected,
  chartHeight,
  chartWidth,
  anchorToPoint,
  priceToY,
  timeToX,
  onSelect,
  onHandlePointerDown,
}: {
  drawing: ChartDrawing;
  selected: boolean;
  chartHeight: number;
  chartWidth: number;
  anchorToPoint: (anchor: Point & { logical?: number }) => ScreenPoint | null;
  priceToY: (price: number) => number | null;
  timeToX: (time: string, logical?: number) => number | null;
  onSelect: () => void;
  onHandlePointerDown: (event: React.PointerEvent<SVGElement>, target: DragTarget) => void;
}) {
  const color = drawing.color ?? DRAWING_COLOR;
  const common = {
    strokeLinecap: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };

  if (drawing.type === "horizontal") {
    const y = priceToY(drawing.price);
    if (y == null) return null;
    const anchorX = drawing.time ? timeToX(drawing.time, drawing.logical) : null;
    const labelX = anchorX == null
      ? chartWidth / 2
      : Math.max(44, Math.min(chartWidth - 44, anchorX));
    return (
      <>
        <DrawingLine
          drawing={drawing}
          x1={0}
          y1={y}
          x2={chartWidth}
          y2={y}
          color={color}
          width={drawing.width ?? DEFAULT_LINE_WIDTH}
          selected={selected}
          onSelect={onSelect}
          common={common}
          onHandlePointerDown={onHandlePointerDown}
          center={{ x: labelX, y }}
        />
        {selected ? (
          <DrawingLabel
            x={Math.max(42, chartWidth - 8)}
            y={Math.max(14, y - 8)}
            text={drawing.price.toFixed(2)}
            anchor="end"
          />
        ) : null}
        {drawing.time ? (
          <DrawingLabel
            x={labelX}
            y={chartHeight - 8}
            text={formatDrawingDate(drawing.time)}
            anchor="middle"
            opacity={selected ? 1 : 0.72}
          />
        ) : null}
      </>
    );
  }

  if (drawing.type === "vertical") {
    const x = timeToX(drawing.time, drawing.logical);
    if (x == null) return null;
    return (
      <>
        <DrawingLine
          drawing={drawing}
          x1={x}
          y1={0}
          x2={x}
          y2={chartHeight}
          color={color}
          width={drawing.width ?? DEFAULT_LINE_WIDTH}
          selected={selected}
          onSelect={onSelect}
          common={common}
          onHandlePointerDown={onHandlePointerDown}
          center={{ x, y: chartHeight / 2 }}
        />
        {selected ? (
          <DrawingLabel
            x={x}
            y={chartHeight - 8}
            text={formatDrawingDate(drawing.time)}
            anchor="middle"
          />
        ) : null}
      </>
    );
  }

  const from = anchorToPoint(drawing.from);
  const to = anchorToPoint(drawing.to);
  if (!from || !to) return null;

  if (drawing.type === "fibonacci") {
    const levels = drawing.levels?.length ? drawing.levels : FIBONACCI_LEVELS;
    const x1 = Math.min(from.x, to.x);
    const x2 = Math.max(Math.max(from.x, to.x), chartWidth);
    const top = Math.min(from.y, to.y) - 10;
    const bottom = Math.max(from.y, to.y) + 10;
    const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const fibWidth = drawing.width ?? DEFAULT_LINE_WIDTH;

    return (
      <g>
        <rect
          x={x1}
          y={Math.max(0, top)}
          width={Math.max(32, x2 - x1)}
          height={Math.max(18, Math.min(chartHeight, bottom) - Math.max(0, top))}
          fill="transparent"
          className="pointer-events-auto cursor-move"
          onPointerDown={(event) => {
            onSelect();
            onHandlePointerDown(event, {
              id: drawing.id,
              kind: "move",
              start: null,
              drawing,
            });
          }}
        />
        {levels.map((level) => {
          const y = from.y + (to.y - from.y) * level;
          const price = drawing.from.price + (drawing.to.price - drawing.from.price) * level;
          const percent = `${(level * 100).toFixed(level === 0 || level === 1 ? 0 : 1)}%`;
          return (
            <g key={level}>
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={color}
                strokeWidth={selected ? fibWidth + 0.5 : fibWidth}
                strokeDasharray={lineDash(drawing.style)}
                strokeOpacity={level === 0 || level === 1 ? 0.95 : 0.62}
                pointerEvents="none"
                {...common}
              />
              <DrawingLabel
                x={Math.max(56, chartWidth - 8)}
                y={Math.max(14, Math.min(chartHeight - 8, y - 4))}
                text={`${percent} ${price.toFixed(2)}`}
                anchor="end"
                color={color}
                opacity={selected ? 1 : 0.78}
              />
            </g>
          );
        })}
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={selected ? SELECTED_COLOR : color}
          strokeWidth={1}
          strokeDasharray="4 4"
          pointerEvents="none"
          {...common}
        />
        {selected ? (
          <>
            <DragHandle
              point={from}
              onPointerDown={(event) => onHandlePointerDown(event, { id: drawing.id, kind: "from", drawing })}
            />
            <DragHandle
              point={to}
              onPointerDown={(event) => onHandlePointerDown(event, { id: drawing.id, kind: "to", drawing })}
            />
            <DragHandle
              point={center}
              onPointerDown={(event) => onHandlePointerDown(event, {
                id: drawing.id,
                kind: "move",
                start: null,
                drawing,
              })}
            />
            <DrawingLabel
              x={from.x}
              y={from.y + 20}
              text={formatDrawingDate(drawing.from.time)}
              anchor="middle"
            />
            <DrawingLabel
              x={to.x}
              y={to.y + 20}
              text={formatDrawingDate(drawing.to.time)}
              anchor="middle"
            />
          </>
        ) : null}
      </g>
    );
  }

  const displayLine = extendTrendlineToViewport(from, to, chartWidth, chartHeight, drawing.mode);
  const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return (
    <>
      <DrawingLine
        drawing={drawing}
        x1={displayLine.from.x}
        y1={displayLine.from.y}
        x2={displayLine.to.x}
        y2={displayLine.to.y}
        color={color}
        width={drawing.width ?? DEFAULT_LINE_WIDTH}
        selected={selected}
        onSelect={onSelect}
        common={common}
        onHandlePointerDown={onHandlePointerDown}
        center={center}
      />
      {selected ? (
        <>
          <DragHandle
            point={from}
            onPointerDown={(event) => onHandlePointerDown(event, { id: drawing.id, kind: "from", drawing })}
          />
          <DrawingLabel
            x={from.x}
            y={from.y + 20}
            text={formatDrawingDate(drawing.from.time)}
            anchor="middle"
          />
          <DragHandle
            point={to}
            onPointerDown={(event) => onHandlePointerDown(event, { id: drawing.id, kind: "to", drawing })}
          />
          <DrawingLabel
            x={to.x}
            y={to.y + 20}
            text={formatDrawingDate(drawing.to.time)}
            anchor="middle"
          />
        </>
      ) : null}
    </>
  );
}

function DrawingLine({
  drawing,
  x1,
  y1,
  x2,
  y2,
  color,
  width,
  selected,
  common,
  center,
  onSelect,
  onHandlePointerDown,
}: {
  drawing: ChartDrawing;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  selected: boolean;
  common: { strokeLinecap: "round"; vectorEffect: "non-scaling-stroke" };
  center: ScreenPoint;
  onSelect: () => void;
  onHandlePointerDown: (event: React.PointerEvent<SVGElement>, target: DragTarget) => void;
}) {
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="transparent"
        strokeWidth={16}
        className="pointer-events-auto cursor-move"
        pointerEvents="stroke"
        onPointerDown={(event) => {
          onSelect();
          onHandlePointerDown(event, {
            id: drawing.id,
            kind: "move",
            start: null,
            drawing,
          });
        }}
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={selected ? width + 0.75 : width}
        strokeDasharray={lineDash(drawing.style)}
        pointerEvents="none"
        {...common}
      />
      {selected ? <DragHandle point={center} onPointerDown={(event) => onHandlePointerDown(event, {
        id: drawing.id,
        kind: "move",
        start: null,
        drawing,
      })} /> : null}
    </g>
  );
}

function DragHandle({
  point,
  onPointerDown,
}: {
  point: ScreenPoint;
  onPointerDown: (event: React.PointerEvent<SVGCircleElement>) => void;
}) {
  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={5}
      fill={SELECTED_COLOR}
      stroke="#111827"
      strokeWidth={2}
      className="pointer-events-auto cursor-move"
      onPointerDown={onPointerDown}
    />
  );
}

function DrawingLabel({
  x,
  y,
  text,
  anchor,
  color = SELECTED_COLOR,
  opacity = 1,
}: {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
  color?: string;
  opacity?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className="pointer-events-none select-none text-[11px] font-medium"
      fill={color}
      opacity={opacity}
      stroke="var(--background)"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {text}
    </text>
  );
}

function DraftShape({
  from,
  to,
  anchorToPoint,
}: {
  from: DraftPoint;
  to: DraftPoint | null;
  anchorToPoint: (anchor: DraftPoint) => ScreenPoint | null;
}) {
  const start = anchorToPoint(from);
  if (!start) return null;
  const end = to ? anchorToPoint(to) : null;
  return (
    <>
      {end ? (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={SELECTED_COLOR}
          strokeWidth={DEFAULT_LINE_WIDTH}
          strokeDasharray="6 5"
          pointerEvents="none"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <circle
        cx={start.x}
        cy={start.y}
        r={4}
        fill={SELECTED_COLOR}
        stroke="#111827"
        strokeWidth={2}
      />
      {end ? (
        <circle
          cx={end.x}
          cy={end.y}
          r={4}
          fill={SELECTED_COLOR}
          stroke="#111827"
          strokeWidth={2}
        />
      ) : null}
    </>
  );
}
