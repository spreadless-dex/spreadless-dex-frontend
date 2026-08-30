// Maps raw wallet/SDK/Soroban errors to sentences the user can act on.
//
// Contract failures surface as strings like "HostError: Error(Contract, #14)".
// The numeric codes come from the pool contract's error enum (see `Errors` in
// @spreadless-dex/sdk) plus the OpenZeppelin Pausable/FungibleToken enums the
// contracts build on. The SDK sometimes decodes a code to its name (e.g.
// "SlippageExceeded"), so every rule matches both forms.

export interface TxErrorContext {
  /** Symbol of the token being spent — used for balance errors. */
  spend?: string;
  /** Symbol of the token being received — used for trustline errors. */
  receive?: string;
}

export interface MappedTxError {
  message: string;
  /** Raw error text (truncated), only set when no rule matched. */
  detail?: string;
}

function contractCode(msg: string, code: number): boolean {
  return new RegExp(`Error\\(Contract, #${code}\\)`).test(msg);
}

export function mapTxError(err: unknown, ctx: TxErrorContext = {}): MappedTxError {
  const raw = err instanceof Error ? err.message : String(err);

  // The user closed or declined the wallet prompt — nothing was sent.
  if (/reject|declin|denied|cancel/i.test(raw)) {
    return { message: "Request declined in your wallet. Nothing was submitted." };
  }

  // Missing trustline. We can't build the trustline-add operation ourselves
  // (that needs the classic asset's code + issuer, which isn't in config.ts
  // for SAC-wrapped tokens), so guide the user to their wallet instead.
  if (/trust/i.test(raw)) {
    const symbol = ctx.receive ?? ctx.spend;
    return {
      message: `Your wallet doesn't have a trustline for ${symbol ?? "this token"} yet. Open your wallet (e.g. Freighter) and add a trustline for ${symbol ?? "it"}, then try again.`,
    };
  }

  // FungibleToken #100 — the spent token's balance doesn't cover the amount.
  // The SDK sometimes decodes this to the enum's docstring ("…related to the
  // current balance of account from which tokens are expected to be
  // transferred"), so match that phrasing too.
  if (contractCode(raw, 100) || /InsufficientBalance|balance of account/i.test(raw)) {
    return {
      message: ctx.spend
        ? `Not enough ${ctx.spend} in your wallet for this amount.`
        : "Not enough balance in your wallet for this amount.",
    };
  }

  // Router: a hop inside an atomic route failed. The whole invocation is
  // rolled back, so the message leads with what matters: nothing moved. The
  // Router's error enum is not final; the hop index is read from the text.
  const hop = /route reverted at hop\s*#?(\d+)/i.exec(raw);
  if (hop) {
    return {
      message: `Leg ${hop[1]} of the route could not fill, so the whole route was rolled back. Nothing was executed and no intermediate token was left behind.`,
    };
  }
  if (/DeadlineExpired|deadline/i.test(raw)) {
    return {
      message:
        "The route's deadline passed before the network included it, so it was rolled back. Nothing was executed. Try again for a fresh quote.",
    };
  }
  if (/PoolNotRegistered|NotRegistered|UnknownPool/i.test(raw)) {
    return {
      message: "One vault on this route is not in the Factory registry, so the Router refused it. Nothing was executed.",
    };
  }
  if (/RouteTooLong|TokenMismatch|InvalidRoute|TokenContinuity/i.test(raw)) {
    return {
      message: "The Router rejected the route as invalid. Nothing was executed. Refresh the quote and try again.",
    };
  }

  // Pool #14 — the on-chain minimum-received floor kicked in.
  if (contractCode(raw, 14) || /SlippageExceeded/i.test(raw)) {
    return {
      message:
        "The price moved more than your slippage tolerance allows, so nothing was executed. Try again, or raise the tolerance in settings.",
    };
  }

  // Pool #15 — deposit would push the token past its pool cap.
  if (contractCode(raw, 15) || /CapExceeded/i.test(raw)) {
    return { message: "This deposit would exceed the pool's cap for this token. Try a smaller amount." };
  }

  // Pausable #1000 — the pool is paused by its owner.
  if (contractCode(raw, 1000) || /EnforcedPause/i.test(raw)) {
    return { message: "The pool is paused right now. Transactions are disabled until it's unpaused." };
  }

  // Pool #10 InvalidAmount / #11 ZeroDeposit — the contract rejected the value.
  if (contractCode(raw, 10) || contractCode(raw, 11) || /InvalidAmount|ZeroDeposit/i.test(raw)) {
    return { message: "The contract rejected this amount as invalid. Check the value and try again." };
  }

  // Classic Stellar "underfunded" — the account can't cover the XLM fee.
  if (/underfunded|insufficient.*fee|tx_?insufficient/i.test(raw)) {
    return {
      message: "Not enough XLM to cover network fees. Top up your wallet with testnet XLM and retry.",
    };
  }

  if (/timeout|timed out|TRY_AGAIN_LATER|txTooLate/i.test(raw)) {
    return {
      message:
        "The network didn't confirm in time. The transaction may still land, so check the explorer before retrying.",
    };
  }

  if (/failed to fetch|fetch failed|networkerror|econn|load failed/i.test(raw)) {
    return { message: "Couldn't reach the Stellar testnet. Check your connection and try again." };
  }

  // No rule matched: keep the honest generic line, but carry a truncated raw
  // detail so a testnet user can still report what actually happened.
  return {
    message: "Transaction failed. Nothing was executed.",
    detail: raw.length > 160 ? `${raw.slice(0, 160)}…` : raw || undefined,
  };
}
