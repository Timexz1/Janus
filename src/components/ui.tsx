import * as React from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-800 bg-slate-900/50 p-4 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  hintTone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "tax";
  hintTone?: "positive" | "negative";
  className?: string;
}) {
  const valueTone =
    tone === "positive" ? "text-emerald-400"
    : tone === "negative" ? "text-rose-400"
    : "text-slate-100";

  const borderAccent =
    tone === "positive" ? "border-l-4 border-l-emerald-500"
    : tone === "negative" ? "border-l-4 border-l-rose-500"
    : tone === "tax" ? "border-l-4 border-l-amber-500"
    : "border-l-4 border-l-slate-700";

  const hintColor =
    hintTone === "positive" ? "text-emerald-400"
    : hintTone === "negative" ? "text-rose-400"
    : "text-slate-500";

  return (
    <Card className={cn(borderAccent, className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", valueTone)}>
        {value}
      </p>
      {hint ? <p className={cn("mt-1 text-sm", hintColor)}>{hint}</p> : null}
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-[110ch] text-sm leading-6 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline";
}) {
  const variants: Record<string, string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-500",
    outline:
      "border border-slate-700 text-slate-200 hover:bg-slate-800/60",
    ghost: "text-slate-300 hover:bg-slate-800/60",
    danger: "border border-rose-900/60 text-rose-300 hover:bg-rose-950/40",
  };
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-300">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputCls, className)} {...props} />;
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(inputCls, className)} {...props}>
      {children}
    </select>
  );
});

export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "buy" | "sell";
}) {
  const tones: Record<string, string> = {
    default: "bg-slate-800 text-slate-300",
    buy: "bg-emerald-950/60 text-emerald-300 border border-emerald-900/60",
    sell: "bg-rose-950/60 text-rose-300 border border-rose-900/60",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-slate-500">{description}</p>
      ) : null}
      {action}
    </Card>
  );
}
