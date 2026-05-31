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
import type { ChartDrawing, ChartLineStyle } from "@/lib/store/types";

export interface TradeMarker {
  time: string;
  side: "buy" | "sell";
  text: string;
}

type DrawTool = "cursor" | "trendline" | "horizontal" | "vertical";
type DragTarget =
  | { id: string; kind: "move"; start: EventPoint | null; drawing: ChartDrawing }
  | { id: string; kind: "from"; drawing: Extract<ChartDrawing, { type: "trendline" }> }
  | { id: string; kind: "to"; drawing: Extract<ChartDrawing, { type: "trendline" }> };

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
const COLOR_SWATCHES = ["#f59e0b", "#38bdf8", "#22c55e", "#f43f5e", "#a855f7"];

function nextDrawingId() {
  return globalThis.crypto?.randomUUID?.() ?? `drawing-${Date.now()}-${Math.random()}`;
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
  if (copy.type === "horizontal") return { ...copy, price: copy.price + dy };
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

export function ChartView({
  candles,
  markers,
  avgCost,
  drawings,
  onDrawingsChange,
  height = 420,
  drawingKey,
}: {
  candles: Candle[];
  markers: TradeMarker[];
  avgCost: number | null;
  drawings: ChartDrawing[];
  onDrawingsChange: (drawings: ChartDrawing[]) => void;
  height?: number;
  drawingKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const toolRef = useRef<DrawTool>("cursor");
  const draftRef = useRef<(Point & { logical?: number }) | null>(null);
  const dragRef = useRef<DragTarget | null>(null);
  const drawingsRef = useRef<ChartDrawing[]>(drawings);

  const [tool, setTool] = useState<DrawTool>("cursor");
  const [draft, setDraft] = useState<(Point & { logical?: number }) | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    queueMicrotask(() => {
      setTool("cursor");
      setDraft(null);
      setSelectedId(null);
    });
  }, [drawingKey]);

  const setDrawingList = useCallback((next: ChartDrawing[]) => {
    drawingsRef.current = next;
    onDrawingsChange(next);
  }, [onDrawingsChange]);

  const updateDrawing = useCallback((id: string, next: ChartDrawing) => {
    setDrawingList(drawingsRef.current.map((drawing) => (drawing.id === id ? next : drawing)));
  }, [setDrawingList]);

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
        width: DEFAULT_LINE_WIDTH,
        color: DEFAULT_DRAWING_COLOR,
        style: DEFAULT_LINE_STYLE,
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
        width: DEFAULT_LINE_WIDTH,
        color: DEFAULT_DRAWING_COLOR,
        style: DEFAULT_LINE_STYLE,
      };
      setDrawingList([...drawingsRef.current, drawing]);
      setSelectedId(drawing.id);
      setTool("cursor");
      return;
    }

    const currentDraft = draftRef.current;
    if (!currentDraft) {
      setDraft({ time: point.time, price: point.price, logical: point.logical });
      setSelectedId(null);
      return;
    }

    const drawing: ChartDrawing = {
      id: nextDrawingId(),
      type: "trendline",
      from: currentDraft,
      to: { time: point.time, price: point.price, logical: point.logical },
      width: DEFAULT_LINE_WIDTH,
      color: DEFAULT_DRAWING_COLOR,
      style: DEFAULT_LINE_STYLE,
    };
    setDrawingList([...drawingsRef.current, drawing]);
    setSelectedId(drawing.id);
    setDraft(null);
    setTool("cursor");
  }, [eventToPoint, setDrawingList]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setDrawingList(drawingsRef.current.filter((drawing) => drawing.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, setDrawingList]);

  const selectedDrawing = useMemo(
    () => drawings.find((drawing) => drawing.id === selectedId) ?? null,
    [drawings, selectedId],
  );

  const selectedWidth = selectedDrawing?.width ?? DEFAULT_LINE_WIDTH;
  const selectedStyle = selectedDrawing?.style ?? DEFAULT_LINE_STYLE;
  const selectedColor = selectedDrawing?.color ?? DEFAULT_DRAWING_COLOR;

  const updateSelectedWidth = useCallback((width: number) => {
    if (!selectedId) return;
    setDrawingList(drawingsRef.current.map((drawing) => (
      drawing.id === selectedId ? { ...drawing, width } : drawing
    )));
  }, [selectedId, setDrawingList]);

  const updateSelectedStyle = useCallback((style: ChartLineStyle) => {
    if (!selectedId) return;
    setDrawingList(drawingsRef.current.map((drawing) => (
      drawing.id === selectedId ? { ...drawing, style } : drawing
    )));
  }, [selectedId, setDrawingList]);

  const updateSelectedColor = useCallback((color: string) => {
    if (!selectedId) return;
    setDrawingList(drawingsRef.current.map((drawing) => (
      drawing.id === selectedId ? { ...drawing, color } : drawing
    )));
  }, [selectedId, setDrawingList]);

  const clearDrawings = useCallback(() => {
    setDrawingList([]);
    setDraft(null);
    setSelectedId(null);
    setTool("cursor");
  }, [setDrawingList]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedId) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      deleteSelected();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, selectedId]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      handleScroll: tool === "cursor",
      handleScale: tool === "cursor",
    });
  }, [tool]);

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

    chart.subscribeCrosshairMove(crosshairHandler);
    chart.timeScale().subscribeVisibleLogicalRangeChange(redrawOverlay);
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
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(redrawOverlay);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [avgCost, candles, height, markers]);

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
    const point = eventToPoint(event);
    const midpoint = clampIndex(Math.floor(candleTimes.length / 2), candleTimes);
    const fallbackStart: EventPoint | null =
      target.kind !== "move"
        ? null
        : target.drawing.type === "trendline"
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
    setSelectedId(target.id);
    setTool("cursor");
  }, [candleTimes, eventToPoint]);

  useEffect(() => {
    const onDragPointerMove = (event: PointerEvent) => {
      const target = dragRef.current;
      if (!target) return;
      event.preventDefault();
      const point = eventToPoint(event);
      if (!point) return;

      if (target.kind === "from") {
        updateDrawing(target.id, {
          ...target.drawing,
          from: { time: point.time, price: point.price, logical: point.logical },
        });
      } else if (target.kind === "to") {
        updateDrawing(target.id, {
          ...target.drawing,
          to: { time: point.time, price: point.price, logical: point.logical },
        });
      } else if (target.start) {
        const dx = point.logical - target.start.logical;
        const dy = point.price - target.start.price;
        updateDrawing(target.id, shiftDrawing(target.drawing, dx, dy, candleTimes));
      }
    };

    const onDragEnd = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onDragPointerMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
    return () => {
      window.removeEventListener("pointermove", onDragPointerMove);
      window.removeEventListener("pointerup", onDragEnd);
      window.removeEventListener("pointercancel", onDragEnd);
    };
  }, [candleTimes, eventToPoint, updateDrawing]);

  return (
    <div className="relative" style={{ width: "100%", height }}>
      <div className="absolute right-2 top-2 z-30 flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/80 p-1 shadow-sm backdrop-blur">
        <ToolButton active={tool === "cursor"} title="เลือก/เลื่อนกราฟ" onClick={() => { setTool("cursor"); setDraft(null); }}>
          <MousePointer2 className="h-4 w-4" aria-hidden />
        </ToolButton>
        <ToolButton active={tool === "trendline"} title="Trendline" onClick={() => { setTool("trendline"); setDraft(null); }}>
          <TrendingUp className="h-4 w-4" aria-hidden />
        </ToolButton>
        <ToolButton active={tool === "horizontal"} title="Horizontal line" onClick={() => { setTool("horizontal"); setDraft(null); }}>
          <Minus className="h-4 w-4" aria-hidden />
        </ToolButton>
        <ToolButton active={tool === "vertical"} title="Vertical line" onClick={() => { setTool("vertical"); setDraft(null); }}>
          <GripVertical className="h-4 w-4" aria-hidden />
        </ToolButton>
        {selectedDrawing ? (
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
        <ToolButton title="ล้างเส้นทั้งหมด" disabled={drawings.length === 0 && !draft} onClick={clearDrawings}>
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
        </div>
      ) : null}
      <svg
        className="pointer-events-none absolute inset-0 z-10"
        width="100%"
        height="100%"
        aria-hidden
      >
        {drawings.map((drawing) => (
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
            }}
            onHandlePointerDown={onHandlePointerDown}
          />
        ))}
        {draft ? <DraftAnchor anchor={draft} anchorToPoint={anchorToPoint} /> : null}
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
          center={{ x: chartWidth / 2, y }}
        />
        {selected ? (
          <DrawingLabel
            x={Math.max(42, chartWidth - 8)}
            y={Math.max(14, y - 8)}
            text={`${drawing.price.toFixed(2)}${drawing.time ? ` · ${formatDrawingDate(drawing.time)}` : ""}`}
            anchor="end"
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
  const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return (
    <>
      <DrawingLine
        drawing={drawing}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
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
}: {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className="pointer-events-none select-none text-[11px] font-medium"
      fill={SELECTED_COLOR}
      stroke="var(--background)"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {text}
    </text>
  );
}

function DraftAnchor({
  anchor,
  anchorToPoint,
}: {
  anchor: Point & { logical?: number };
  anchorToPoint: (anchor: Point & { logical?: number }) => ScreenPoint | null;
}) {
  const point = anchorToPoint(anchor);
  if (!point) return null;
  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={4}
      fill={SELECTED_COLOR}
      stroke="#111827"
      strokeWidth={2}
    />
  );
}
