// Agent-friendly, version-controlled automatic approval policy.
//
// Add exact hosts or wildcard subdomains here, then run `bun run build` and
// reload the unpacked extension. These entries are displayed as read-only in
// the options page so the policy shipped by a build is always visible.
export const BUILT_IN_AUTO_APPROVE_HOST_PATTERNS = Object.freeze([
  'localhost',
  '*.localhost',
  '127.0.0.1',
  '[::1]',
  '0.0.0.0',
  'shop.conduit.market',
  'sell.conduit.market',
  'build.conduit.market',
  '*.conduit-market-coo.pages.dev',
  '*.conduit-merchant-33n.pages.dev'
])
