import type { ReactNode } from "react";
import type { BadgeTone } from "../lib/format";

const TONE_CLASS: Record<BadgeTone, string> = {
  success: "bg-brand-bg text-brand",
  warning: "bg-warning-bg text-warning-text",
  critical: "bg-critical-bg text-critical",
  attention: "bg-attention-bg text-[#7E4B00]",
  info: "bg-[#EDF4FE] text-[#1F5199]",
  neutral: "bg-hover text-text-sub",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return <div className={`p-card ${padding ? "p-5" : ""} ${className}`}>{children}</div>;
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-4">
      <h2 className="text-[15px] font-semibold text-text">{title}</h2>
      {action}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
      {subtitle && <p className="mt-1 text-[13px] text-text-sub">{subtitle}</p>}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "critical";

const BUTTON_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark disabled:bg-[#95BEB0]",
  secondary: "bg-white text-text border border-[#BABEC3] hover:bg-hover disabled:text-text-tertiary",
  critical: "bg-critical text-white hover:bg-[#B32306] disabled:bg-[#E2A093]",
};

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_CLASS[variant]}`}
    >
      {children}
    </button>
  );
}

/** Monospace pill for addresses and hashes. */
export function MonoPill({ children, href }: { children: ReactNode; href?: string }) {
  const cls =
    "inline-flex items-center gap-1.5 rounded-full bg-hover px-2.5 py-1 font-mono text-xs text-text-sub";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={`${cls} hover:text-brand`}>
      {children}
    </a>
  ) : (
    <span className={cls}>{children}</span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-10 text-center text-[13px] text-text-tertiary">{message}</p>;
}

/** Shared table shell — simple horizontal rules, no zebra striping. */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border text-[11px] font-medium tracking-wide text-text-sub uppercase">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
