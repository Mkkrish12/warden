import type { InvoiceRecord } from "@warden/shared";
import { usd } from "../lib/format";

interface Props {
  data: { vendor: string; amount: number }[];
  invoices?: InvoiceRecord[];
  onBarClick?: (invoiceId: string) => void;
}

export function VendorSpendChart({ data, invoices, onBarClick }: Props) {
  const max = Math.max(...data.map((d) => d.amount), 1);

  function handleClick(vendor: string) {
    if (!onBarClick || !invoices) return;
    const match = invoices.find((i) => i.vendorName === vendor && i.status === "paid");
    if (match) onBarClick(match.invoiceId);
  }

  return (
    <ul className="space-y-3.5">
      {data.map(({ vendor, amount }) => {
        const pct = (amount / max) * 100;
        const clickable = !!onBarClick && !!invoices?.some((i) => i.vendorName === vendor && i.status === "paid");
        return (
          <li key={vendor} className="flex items-center gap-4">
            <span className="w-[150px] shrink-0 truncate text-[13px] text-text-sub" title={vendor}>
              {vendor}
            </span>

            <button
              type="button"
              disabled={!clickable}
              onClick={() => handleClick(vendor)}
              className={`relative h-6 flex-1 rounded bg-hover ${clickable ? "cursor-pointer" : "cursor-default"}`}
              title={clickable ? `Open ${vendor} invoice` : undefined}
            >
              <span
                className="absolute inset-y-0 left-0 rounded bg-brand transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </button>

            <span className="tnum w-[88px] shrink-0 text-right text-[13px] font-semibold text-text">
              {usd(amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
