/** USDC has 6 decimals on-chain; the policy contract stores every cap in those units. */
export const USDC_DECIMALS = 6;
const SCALE = 1_000_000n;

/**
 * Convert a USD amount to USDC 6-decimal base units.
 *
 * Goes via a fixed-precision string rather than `amount * 1e6` because binary
 * floats can't represent every decimal exactly — `1240.5 * 1e6` is fine, but
 * plenty of realistic invoice amounts land a hair under and truncate to the
 * wrong cent. Rounds half-up at the 6th decimal.
 */
export function toUsdc6(amount: number): bigint {
  if (!Number.isFinite(amount)) throw new Error(`Invalid amount: ${amount}`);
  if (amount < 0) throw new Error(`Amount must not be negative: ${amount}`);

  const [whole, frac = ""] = amount.toFixed(USDC_DECIMALS).split(".");
  return BigInt(whole) * SCALE + BigInt(frac.padEnd(USDC_DECIMALS, "0"));
}

/** Format USDC base units back to a human string, e.g. 1240500000n -> "1,240.50". */
export function formatUsdc6(units: bigint): string {
  const whole = units / SCALE;
  const frac = units % SCALE;
  const cents = (frac / 10_000n).toString().padStart(2, "0");
  return `${whole.toLocaleString("en-US")}.${cents}`;
}
