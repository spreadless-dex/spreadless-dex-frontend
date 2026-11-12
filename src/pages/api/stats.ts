// The figures under the landing page's hero. See LiveStats.tsx.

import type { APIRoute } from "astro";
import { marketStats } from "../../lib/server/market";
import { marketResponse } from "../../lib/server/marketRoute";

export const prerender = false;

export const GET: APIRoute = ({ url }) => marketResponse(marketStats, url.origin);
