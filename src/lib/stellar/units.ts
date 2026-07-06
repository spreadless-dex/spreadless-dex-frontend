// Soroban amounts are raw on-chain integer units — there is no decimal handling
// in the contract. A 7-decimal token means 1.0 token = 10_000_000 raw units.
// These helpers convert between human strings and raw bigint WITHOUT floats, so
// we never hit rounding errors (e.g. 0.1 * 10 ** 7 in JS is not exact).

export function toRawUnits(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (!trimmed) return 0n;
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = unsigned.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const raw = BigInt((whole || "0") + fracPadded);
  return negative ? -raw : raw;
}

export function fromRawUnits(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}
