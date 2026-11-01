// Public price feed: integrators read this instead of an on-chain oracle.
// Documented in src/content/docs/developers/price-api.mdx.

import type { APIRoute } from "astro";
import { marketResponse } from "../../lib/server/marketRoute";

export const prerender = false;

const round = (value: number) => Number(value.toFixed(7));

export const GET: APIRoute = () =>
  marketResponse((market) => ({
    network: market.network,
    updated_at: market.updatedAt,
    pools: market.pools.map((pool) => ({
      address: pool.address,
      quote: pool.quote,
      tokens: pool.tokens.map(({ symbol, address, price, reserve }) => ({
        symbol,
        address,
        price: round(price),
        reserve: round(reserve),
      })),
    })),
  }));
