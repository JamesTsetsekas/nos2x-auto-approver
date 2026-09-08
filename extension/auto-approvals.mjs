export const AUTO_APPROVE_STORAGE_KEYS = {
  enabled: 'auto_approve_enabled',
  allHosts: 'auto_approve_all_hosts',
  hostPatterns: 'auto_approve_host_patterns'
}

export const DEFAULT_AUTO_APPROVE_HOST_PATTERNS = Object.freeze([
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

export const DEFAULT_AUTO_APPROVE_SETTINGS = Object.freeze({
  enabled: true,
  allHosts: false,
  hostPatterns: DEFAULT_AUTO_APPROVE_HOST_PATTERNS
})

function removeTrailingDot(hostname) {
  return hostname.endsWith('.') ? hostname.slice(0, -1) : hostname
}

function hostnameFromValue(value) {
  if (typeof value !== 'string' || !value.trim()) return ''

  let candidate = value.trim().toLowerCase()
  try {
    if (!candidate.includes('://')) candidate = `http://${candidate}`
    return removeTrailingDot(new URL(candidate).hostname.toLowerCase())
  } catch (_) {
    return ''
  }
}

export function normalizeHostPattern(value) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed === '*') return null

  const wildcard = trimmed.includes('://')
    ? trimmed.replace('://*.', '://') !== trimmed
    : trimmed.startsWith('*.')
  const withoutWildcard = wildcard
    ? trimmed.includes('://')
      ? trimmed.replace('://*.', '://')
      : trimmed.slice(2)
    : trimmed
  const hostname = hostnameFromValue(withoutWildcard)

  if (!hostname || hostname.includes('*')) return null
  if (!/^\[?[a-z0-9:.-]+\]?$/.test(hostname)) return null

  return wildcard ? `*.${hostname}` : hostname
}

export function parseHostPatterns(value) {
  const lines = Array.isArray(value) ? value : String(value || '').split(/\r?\n/)
  const hostPatterns = []
  const invalidPatterns = []

  for (const line of lines) {
    const raw = String(line).trim()
    if (!raw || raw.startsWith('#')) continue

    const normalized = normalizeHostPattern(raw)
    if (!normalized) {
      invalidPatterns.push(raw)
    } else if (!hostPatterns.includes(normalized)) {
      hostPatterns.push(normalized)
    }
  }

  return {hostPatterns, invalidPatterns}
}

export function resolveAutoApproveSettings(stored = {}) {
  const keys = AUTO_APPROVE_STORAGE_KEYS
  const hasStoredPatterns = Array.isArray(stored[keys.hostPatterns])

  return {
    enabled:
      typeof stored[keys.enabled] === 'boolean'
        ? stored[keys.enabled]
        : DEFAULT_AUTO_APPROVE_SETTINGS.enabled,
    allHosts:
      typeof stored[keys.allHosts] === 'boolean'
        ? stored[keys.allHosts]
        : DEFAULT_AUTO_APPROVE_SETTINGS.allHosts,
    hostPatterns: hasStoredPatterns
      ? parseHostPatterns(stored[keys.hostPatterns]).hostPatterns
      : [...DEFAULT_AUTO_APPROVE_HOST_PATTERNS]
  }
}

export function hostMatchesPattern(host, pattern) {
  const hostname = hostnameFromValue(host)
  const normalizedPattern = normalizeHostPattern(pattern)

  if (!hostname || !normalizedPattern) return false
  if (!normalizedPattern.startsWith('*.')) return hostname === normalizedPattern

  const suffix = normalizedPattern.slice(2)
  return hostname === suffix || hostname.endsWith(`.${suffix}`)
}

export function shouldAutoApproveHost(host, stored = {}) {
  const settings = resolveAutoApproveSettings(stored)
  if (!settings.enabled) return false
  if (settings.allHosts) return true

  return settings.hostPatterns.some(pattern => hostMatchesPattern(host, pattern))
}
