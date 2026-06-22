/**
 * Client config for the 0G integration.
 *
 * The browser never holds a wallet or key — it talks to the local proxy
 * (server/) which signs/pays with a dev-funded 0G testnet account. Override the
 * URL for a deployed proxy via a Vite env var: VITE_ZG_PROXY_URL.
 */
export const ZG_PROXY_URL =
  (import.meta.env && import.meta.env.VITE_ZG_PROXY_URL) || 'http://localhost:8787';

/** Whether 0G features are even attempted. Set VITE_ZG_DISABLE=1 to force-off. */
export const ZG_ENABLED = !(import.meta.env && import.meta.env.VITE_ZG_DISABLE === '1');
