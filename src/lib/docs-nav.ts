// Single source of truth for the docs sidebar: sections in order, pages in
// order. Slugs map 1:1 to content-collection entry ids (the MDX file path under
// src/content/docs without extension). DocsLayout derives the sidebar, the
// prev/next footer, and the "you are here" state from this list, so adding a
// page is: create the .mdx file, add one line here.

export interface DocPage {
  slug: string;
  label: string;
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export const DOCS_NAV: DocSection[] = [
  {
    title: "Getting Started",
    pages: [
      { slug: "overview", label: "What is Spreadless" },
      { slug: "for-institutions", label: "Why it's different" },
      { slug: "quickstart", label: "Quickstart" },
    ],
  },
  {
    title: "Concepts · The Math",
    pages: [
      { slug: "concepts/invariant-curve", label: "The Invariant Curve" },
      { slug: "concepts/amplification", label: "Amplification Factor (A)" },
      { slug: "concepts/slippage", label: "Slippage & Price Impact" },
      { slug: "concepts/single-sided", label: "Single-Sided Liquidity" },
      { slug: "concepts/fees-yield", label: "Fees & Yield" },
    ],
  },
  {
    title: "Guides",
    pages: [
      { slug: "guides/connect-wallet", label: "Connect a Wallet" },
      { slug: "guides/faucet", label: "Get Testnet Tokens" },
      { slug: "guides/trustlines", label: "Trustlines" },
      { slug: "guides/swap", label: "How to Swap" },
      { slug: "guides/provide-liquidity", label: "Provide Liquidity" },
      { slug: "guides/withdraw", label: "Withdraw Liquidity" },
      { slug: "guides/portfolio", label: "Portfolio & Activity" },
    ],
  },
  {
    title: "Protocol",
    pages: [
      { slug: "protocol/architecture", label: "Architecture" },
      { slug: "protocol/pool-contract", label: "Pool Contract Reference" },
      { slug: "protocol/slippage-and-safety", label: "Slippage & Safety" },
      { slug: "protocol/routing", label: "Routing" },
      { slug: "protocol/deployments", label: "Deployments & Network" },
    ],
  },
  {
    title: "Developers",
    pages: [
      { slug: "developers/stack", label: "Tech Stack" },
      { slug: "developers/sdk", label: "Using the SDK" },
      { slug: "developers/local-setup", label: "Run it Locally" },
    ],
  },
  {
    title: "Resources",
    pages: [
      { slug: "resources/faq", label: "FAQ" },
      { slug: "resources/glossary", label: "Glossary" },
    ],
  },
];

/** Flattened page list in reading order — powers prev/next. */
export const DOCS_FLAT: Array<DocPage & { section: string }> = DOCS_NAV.flatMap(
  (section) => section.pages.map((p) => ({ ...p, section: section.title })),
);

/** The first page — where /docs lands. */
export const DOCS_HOME = DOCS_FLAT[0].slug;

export function docHref(slug: string): string {
  return `/docs/${slug}`;
}

export function prevNext(slug: string) {
  const i = DOCS_FLAT.findIndex((p) => p.slug === slug);
  return {
    prev: i > 0 ? DOCS_FLAT[i - 1] : null,
    next: i >= 0 && i < DOCS_FLAT.length - 1 ? DOCS_FLAT[i + 1] : null,
  };
}
