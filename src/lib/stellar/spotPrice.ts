// A StableSwap pool's mid prices, from its balances and A alone. The contract
// has no view for this and a swap simulation needs a funded account, but the
// price is just the slope of the invariant at the current balances:
//
//   F = Ann·S + D − Ann·D − D^(n+1) / (n^n·P)
//   ∂F/∂xᵢ = Ann + D^(n+1) / (n^n·P·xᵢ)
//
// and one unit of token i buys ∂F/∂xᵢ ÷ ∂F/∂xⱼ of token j. Ann is A·n, as in
// calc_invariant() in contracts/spreadless-pool/src/math/stable.rs. Floats are
// enough here: these figures are for reading, nothing settles on them.

/** The invariant D, by the same Newton iteration as the contract. */
export function invariant(balances: number[], amp: number): number {
  const n = balances.length;
  const ann = amp * n;
  const sum = balances.reduce((a, b) => a + b, 0);
  let d = sum;
  for (let i = 0; i < 64; i++) {
    let p = d;
    for (const x of balances) p = (p * d) / (x * n);
    const prev = d;
    d = ((ann * sum + p * n) * d) / ((ann - 1) * d + (n + 1) * p);
    if (Math.abs(d - prev) <= sum * 1e-14) break;
  }
  return d;
}

/**
 * One relative price per token: token i buys `prices[i] / prices[j]` of token j,
 * before the swap fee. Balances in human units, every one above zero.
 */
export function spotPrices(balances: number[], amp: number): number[] {
  const n = balances.length;
  const d = invariant(balances, amp);
  let c = d;
  for (const x of balances) c = (c * d) / (x * n);
  return balances.map((x) => amp * n + c / x);
}
