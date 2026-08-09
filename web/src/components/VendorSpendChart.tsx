import { usd } from "../lib/format";

/**
 * Horizontal bar chart for vendor spend.
 *
 * Hand-rolled SVG rather than recharts: recharts 3.10.1 renders its leaf
 * primitives (bar paths, axis text) as empty <g> elements under React 19.2.8 —
 * groups appear with correct counts but nothing inside them. Rather than pin a
 * fragile version combination before a demo, this draws the bars directly. It's
 * deterministic, dependency-free, and matches the Polaris palette exactly.
 */
export function VendorSpendChart({ data }: { data: { vendor: string; amount: number }[] }) {
  const max = Math.max(...data.map((d) => d.amount), 1);

  return (
    <ul className="space-y-3.5">
      {data.map(({ vendor, amount }) => {
        const pct = (amount / max) * 100;
        return (
          <li key={vendor} className="flex items-center gap-4">
            <span className="w-[150px] shrink-0 truncate text-[13px] text-text-sub" title={vendor}>
              {vendor}
            </span>

            <span className="relative h-6 flex-1 rounded bg-hover">
              <span
                className="absolute inset-y-0 left-0 rounded bg-brand transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </span>

            <span className="tnum w-[88px] shrink-0 text-right text-[13px] font-semibold text-text">
              {usd(amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
