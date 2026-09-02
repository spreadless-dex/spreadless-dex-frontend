// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import mdx from '@astrojs/mdx';

import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

import { fileURLToPath } from 'node:url';
import { setDefaultResultOrder } from 'node:dns';

// The Cloudflare adapter prerenders by starting a Vite preview server on
// "localhost" and fetching it. On Linux builders where localhost resolves to
// ::1 first, the server binds IPv6 only while fetch dials 127.0.0.1 and the
// build dies with ECONNREFUSED. Preferring IPv4 keeps both on the same
// address. Harmless on macOS, where the build already passed.
setDefaultResultOrder('ipv4first');

// @privy-io/react-auth declares Solana and EVM smart-account packages as
// OPTIONAL peers, but Rolldown refuses to build when their named imports
// don't resolve. We only use Privy's Stellar embedded wallet, so those paths
// are dead code: point them at a stub instead of installing the packages.
// (@solana/kit is NOT stubbed: it is already installed through the wallet
// kit's AppKit dependency and other packages really use it.)
const privyOptionalPeers =
  /^(@solana-program\/(system|token|memo)|@abstract-foundation\/agw-client|permissionless|@farcaster\/mini-app-solana)(\/.*)?$/;
const privyPeerStub = fileURLToPath(
  new URL('./src/lib/stubs/privy-optional-peers.ts', import.meta.url),
);

// https://astro.build/config
export default defineConfig({
  integrations: [react(), mdx()],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: [{ find: privyOptionalPeers, replacement: privyPeerStub }],
    },
  },

  adapter: cloudflare()
});
